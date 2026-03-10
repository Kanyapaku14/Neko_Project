import os
import cv2
import time
import json
import argparse
import mimetypes
from collections import defaultdict
from datetime import datetime, timezone
from collections import deque

from dotenv import load_dotenv

try:
    from .models import CatTracker
    from .behavior_system import BehaviorSystem
    from .cat_session import CatSessionManager
except ImportError:
    from models import CatTracker
    from behavior_system import BehaviorSystem
    from cat_session import CatSessionManager

try:
    from supabase import create_client
except ImportError:
    create_client = None


PROCESS_WIDTH = 640
MIN_DETECTION_CONF = 0.45
MIN_BBOX_AREA = 3000
CLASSIFY_EVERY_N = 2
CROP_EXPAND_RATIO = 0.25
NORMAL_SNAPSHOT_COOLDOWN_SEC = 15.0
ABNORMAL_SNAPSHOT_COOLDOWN_SEC = 8.0
OVER_CAPACITY_ALERT_COOLDOWN_SEC = 180.0
OVER_CAPACITY_MIN_PERSIST_SEC = 8.0
PROCESS_EVERY_N_FRAMES = 2
PENDING_IDENTITY_EXPIRE_MIN = 30
PENDING_IDENTITY_SWEEP_SEC = 120.0
HEALTH_WRITE_INTERVAL_SEC = 2.0

# Optional hardcoded stream override by camera_id.
# If set, this takes precedence over DB stream_source.
# Examples:
#   "camera-uuid": "webcam:0"
#   "camera-uuid": "rtsp://user:pass@ip/stream"
CAMERA_SOURCE_OVERRIDES = {
    # "0a18fe9a-dcc0-4088-be6c-2aa44ca734d8": "webcam:0",
}

# Real-world health app event rules:
# - Require sustained frames before counting one behavior event
# - Apply behavior-specific cooldown to prevent duplicate counting
BEHAVIOR_MIN_STREAK_FRAMES = {
    "eat": 10,
    "litter": 12,
    "sleep": 16,
    "activity": 20,
    "grooming": 6,
    "vomiting": 1,
    "abnormal": 5,
}
BEHAVIOR_MIN_CONFIDENCE = {
    "eat": 0.50,
    "litter": 0.55,
    "sleep": 0.45,
    "activity": 0.40,
    "grooming": 0.45,
    "vomiting": 0.45,
    "abnormal": 0.55,
}
BEHAVIOR_EVENT_COOLDOWN_SEC = {
    "eat": 90.0,
    "litter": 120.0,
    "sleep": 300.0,
    "activity": 180.0,
    "grooming": 90.0,
    "vomiting": 60.0,
    "abnormal": 60.0,
}

# Hard daily cap to prevent runaway counting due to noisy detections.
BEHAVIOR_DAILY_CAP = {
    "eat": 30,
    "litter": 20,
    "sleep": 24,
    "activity": 120,
    "grooming": 60,
    "vomiting": 25,
    "abnormal": 25,
}

# Abnormal escalation:
# - warning on first abnormal event
# - critical if >=3 abnormal events within 10 minutes
ABNORMAL_ESCALATION_WINDOW_SEC = 600.0
ABNORMAL_ESCALATION_CRITICAL_COUNT = 3
ABNORMAL_ALERT_COOLDOWN_SEC = {
    "warning": 300.0,
    "critical": 600.0,
}


def expand_bbox(bbox, frame_shape, ratio=CROP_EXPAND_RATIO):
    x1, y1, x2, y2 = bbox
    bw, bh = x2 - x1, y2 - y1
    pad_x, pad_y = bw * ratio, bh * ratio
    h, w = frame_shape[:2]
    return [max(0, int(x1 - pad_x)), max(0, int(y1 - pad_y)), min(w, int(x2 + pad_x)), min(h, int(y2 + pad_y))]


def map_behavior_to_db(label):
    m = {
        "eating": "eat",
        "toileting": "litter",
        "resting": "sleep",
        "active": "activity",
        "grooming": "grooming",
        "head_pressing": "abnormal",
        "vomiting": "vomiting",
        "unknown": "activity",
        "error": "activity",
    }
    return m.get(label, "activity")


def _slot_for_hour(hour):
    if 0 <= hour < 6:
        return "count_00_06"
    if 6 <= hour < 12:
        return "count_06_12"
    if 12 <= hour < 18:
        return "count_12_18"
    return "count_18_24"


def create_supabase_client():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    load_dotenv(os.path.join(base_dir, "..", "..", ".env"))
    url = os.getenv("EXPO_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not (url and key and create_client):
        return None
    return create_client(url, key)


def _runtime_dir(this_dir):
    d = os.path.join(this_dir, "runtime")
    os.makedirs(d, exist_ok=True)
    return d


def _sanitize_name(raw):
    return "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in str(raw or "default"))


def _is_pid_alive(pid):
    if not pid:
        return False
    try:
        os.kill(int(pid), 0)
        return True
    except PermissionError:
        return True
    except Exception:
        return False


def acquire_camera_lock(this_dir, camera_id):
    """
    Prevent duplicate pipeline runs on the same camera_id.
    """
    lock_name = f"camera_{_sanitize_name(camera_id)}.lock"
    lock_path = os.path.join(_runtime_dir(this_dir), lock_name)
    payload = {
        "pid": os.getpid(),
        "camera_id": camera_id,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
    fd = None
    try:
        fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, json.dumps(payload, ensure_ascii=True).encode("utf-8"))
        os.close(fd)
        return lock_path
    except FileExistsError:
        try:
            with open(lock_path, "r", encoding="utf-8") as f:
                existing = json.load(f)
        except Exception:
            existing = {}
        existing_pid = existing.get("pid")
        if existing_pid and _is_pid_alive(existing_pid):
            raise SystemExit(
                f"camera_id '{camera_id}' is already running (pid={existing_pid}). Stop old process first."
            )
        try:
            os.remove(lock_path)
        except Exception:
            raise SystemExit(f"camera_id '{camera_id}' lock exists and cannot be removed: {lock_path}")
        fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, json.dumps(payload, ensure_ascii=True).encode("utf-8"))
        os.close(fd)
        return lock_path
    finally:
        try:
            if fd is not None:
                os.close(fd)
        except Exception:
            pass


def release_camera_lock(lock_path):
    if not lock_path:
        return
    try:
        if os.path.exists(lock_path):
            os.remove(lock_path)
    except Exception as e:
        print(f"Failed to release lock {lock_path}: {e}")


def write_pipeline_health(this_dir, camera_id, health_state):
    cam = _sanitize_name(camera_id or "local")
    path = os.path.join(_runtime_dir(this_dir), f"pipeline_health_{cam}.json")
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(health_state, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Failed to write health file: {e}")


def set_camera_connection_status(supabase, camera_id, status):
    if not (supabase and camera_id):
        return
    try:
        supabase.table("cameras").update({"ai_connection_status": status}).eq("id", camera_id).execute()
    except Exception as e:
        print(f"Camera status update failed ({status}): {e}")


def expire_stale_pending_identity_reviews(supabase, camera_id, older_than_minutes=PENDING_IDENTITY_EXPIRE_MIN):
    """
    Auto-resolve stale pending identity reviews so old unresolved rows do not keep resurfacing.
    """
    if not (supabase and camera_id):
        return 0
    now_utc = datetime.now(timezone.utc)
    cutoff = datetime.fromtimestamp(now_utc.timestamp() - (older_than_minutes * 60.0), tz=timezone.utc).isoformat()
    try:
        rows = (
            supabase.table("ai_cat_identity_review")
            .select("id,metadata")
            .eq("camera_id", camera_id)
            .eq("reviewed", False)
            .lt("occurred_at", cutoff)
            .limit(500)
            .execute()
            .data
            or []
        )
        if not rows:
            return 0
        updated = 0
        for row in rows:
            metadata = dict(row.get("metadata") or {})
            metadata["auto_expired"] = True
            metadata["auto_expired_at"] = now_utc.isoformat()
            supabase.table("ai_cat_identity_review").update(
                {
                    "reviewed": True,
                    "reviewed_at": now_utc.isoformat(),
                    "resolved_by": "skipped",
                    "metadata": metadata,
                }
            ).eq("id", row["id"]).execute()
            updated += 1
        return updated
    except Exception as e:
        print(f"Pending identity expiry failed: {e}")
        return 0


def get_pending_identity_count(supabase, camera_id):
    if not (supabase and camera_id):
        return 0
    try:
        rows = (
            supabase.table("ai_cat_identity_review")
            .select("id")
            .eq("camera_id", camera_id)
            .eq("reviewed", False)
            .limit(5000)
            .execute()
            .data
            or []
        )
        return len(rows)
    except Exception:
        return 0


def normalize_source(raw_source):
    """
    Support per-camera source formats:
    - webcam:0  -> int(0)
    - 0         -> int(0)
    - rtsp/http/file path -> str
    """
    if raw_source is None:
        return None
    source = str(raw_source).strip()
    if source == "":
        return None
    if source.lower().startswith("webcam:"):
        idx = source.split(":", 1)[1].strip()
        return int(idx) if idx.isdigit() else source
    return int(source) if source.isdigit() else source


def load_camera_source_from_code(camera_id):
    if not camera_id:
        return None
    raw = CAMERA_SOURCE_OVERRIDES.get(str(camera_id))
    return normalize_source(raw) if raw else None


def load_camera_owner_id(supabase, camera_id):
    if not supabase or not camera_id:
        return None
    try:
        row = supabase.table("cameras").select("owner_id").eq("id", camera_id).single().execute().data
        return row.get("owner_id") if row else None
    except Exception:
        return None


def load_cat_name_map(supabase, cat_ids):
    if not supabase or not cat_ids:
        return {}
    try:
        rows = (
            supabase.table("cats")
            .select("id,name")
            .in_("id", cat_ids)
            .execute()
            .data
            or []
        )
        return {str(r.get("id")): (r.get("name") or str(r.get("id"))) for r in rows if r.get("id")}
    except Exception:
        return {}


def load_camera_source_from_db(supabase, camera_id):
    """
    Load dedicated source for this camera only.
    Expected column on cameras table: stream_source (text)
    """
    if not supabase or not camera_id:
        return None
    try:
        row = supabase.table("cameras").select("stream_source").eq("id", camera_id).single().execute().data
        return normalize_source((row or {}).get("stream_source"))
    except Exception:
        return None


def load_camera_record(supabase, camera_id):
    if not supabase or not camera_id:
        return None
    try:
        return (
            supabase.table("cameras")
            .select("id, owner_id, mode, stream_source, stream_source_type")
            .eq("id", camera_id)
            .maybe_single()
            .execute()
            .data
        )
    except Exception:
        return None


def load_camera_assigned_cat_ids(supabase, camera_id):
    """
    Return ordered cat UUID list assigned to this camera (from UI camera setup).
    Order: primary first, then assigned_at.
    """
    if not supabase or not camera_id:
        return []
    try:
        rows = (
            supabase.table("camera_cats")
            .select("cat_id, is_primary, assigned_at")
            .eq("camera_id", camera_id)
            .order("is_primary", desc=True)
            .order("assigned_at", desc=False)
            .execute()
            .data
            or []
        )
        return [str(r.get("cat_id")) for r in rows if r.get("cat_id")]
    except Exception:
        return []


def load_camera_zones(supabase, camera_id):
    if not supabase or not camera_id:
        return []
    try:
        rows = (
            supabase.table("camera_zones")
            .select("id, zone_type, label, polygon")
            .eq("camera_id", camera_id)
            .execute()
            .data
            or []
        )
        return rows
    except Exception:
        return []


def _zone_rect_pixels(zone_polygon, frame_shape):
    """
    Support normalized rect format persisted by Phone.js:
    polygon.rect = {x,y,w,h} in [0..1]
    """
    if not isinstance(zone_polygon, dict):
        return None
    rect = zone_polygon.get("rect")
    if not isinstance(rect, dict):
        return None
    h, w = frame_shape[:2]
    x = float(rect.get("x", 0.0))
    y = float(rect.get("y", 0.0))
    rw = float(rect.get("w", 0.0))
    rh = float(rect.get("h", 0.0))
    x1 = max(0, min(w - 1, int(x * w)))
    y1 = max(0, min(h - 1, int(y * h)))
    x2 = max(0, min(w - 1, int((x + rw) * w)))
    y2 = max(0, min(h - 1, int((y + rh) * h)))
    if x2 <= x1 or y2 <= y1:
        return None
    return (x1, y1, x2, y2)


def _zone_affinity_score(rect_px, foot_x, foot_y):
    """
    Compute 0..1 score based on distance to zone center (higher = deeper inside zone).
    """
    x1, y1, x2, y2 = rect_px
    if foot_x < x1 or foot_x > x2 or foot_y < y1 or foot_y > y2:
        return 0.0
    cx = (x1 + x2) / 2.0
    cy = (y1 + y2) / 2.0
    half_w = max(1.0, (x2 - x1) / 2.0)
    half_h = max(1.0, (y2 - y1) / 2.0)
    dx = abs(foot_x - cx) / half_w
    dy = abs(foot_y - cy) / half_h
    return max(0.0, 1.0 - max(dx, dy))


def detect_zone_for_bbox(camera_zones, bbox, frame_shape):
    """
    Return (zone_type, zone_score) for bbox foot point, else (None, 0.0).
    """
    if not camera_zones:
        return None, 0.0
    bx1, by1, bx2, by2 = bbox
    fx = int((bx1 + bx2) / 2.0)  # foot center x
    fy = int(by2)  # foot y
    best_type = None
    best_score = 0.0
    for z in camera_zones:
        zr = _zone_rect_pixels(z.get("polygon"), frame_shape)
        if not zr:
            continue
        score = _zone_affinity_score(zr, fx, fy)
        if score > best_score:
            best_score = score
            best_type = z.get("zone_type")
    return best_type, float(best_score)


def apply_zone_behavior_prior(db_behavior, confidence, zone_type, zone_score, zones_configured=False):
    """
    Rule-based disambiguation with zone affinity score (0..1):
    - If inside zone, boost confidence toward that zone's behavior
    - If zones are configured but bbox is outside, suppress eat/litter misfires
    """
    conf = float(confidence or 0.0)
    zone_score = float(zone_score or 0.0)
    boost = 0.18 * zone_score
    adj_conf = min(1.0, conf + boost)

    if zone_type == "food":
        if db_behavior in ("activity", "sleep") and adj_conf < 0.78:
            return "eat"
        if db_behavior == "litter" and conf < 0.80:
            return "activity"
    if zone_type == "litter":
        if db_behavior in ("activity", "sleep") and adj_conf < 0.80:
            return "litter"
        if db_behavior == "eat" and conf < 0.80:
            return "activity"
    if zone_type == "bed":
        if db_behavior == "eat" and adj_conf < 0.70:
            return "sleep"

    if zones_configured and zone_type is None and db_behavior in ("eat", "litter") and conf < 0.70:
        return "activity"
    return db_behavior


def insert_ai_event(supabase, camera_id, cat_uuid, behavior, confidence, abnormal, behavior_detail=None):
    if not supabase or not camera_id or not cat_uuid or "-" not in str(cat_uuid):
        return
    payload = {
        "camera_id": camera_id,
        "cat_id": cat_uuid,
        "behavior_label": map_behavior_to_db(behavior),
        "behavior_detail": behavior_detail or behavior,
        "confidence": round(float(confidence), 4),
        "abnormal": bool(abnormal),
        "occurred_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table("ai_cat_events").insert(payload).execute()


def insert_identity_review(
    supabase,
    camera_id,
    pred_cat_uuid,
    behavior,
    confidence,
    snapshot_path,
    reviewed=False,
    resolved_by=None,
    resolved_cat_id=None,
    session_id=None,
    metadata=None,
):
    if not supabase or not camera_id:
        return
    payload = {
        "camera_id": camera_id,
        "pred_cat_id": pred_cat_uuid if pred_cat_uuid and "-" in str(pred_cat_uuid) else None,
        "confidence": round(float(confidence), 4),
        "behavior_label": map_behavior_to_db(behavior),
        "behavior_detail": behavior,
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "snapshot_url": snapshot_path,
        "reviewed": bool(reviewed),
        "source": "smart_cat_health_server",
        "session_id": session_id,
        "resolved_by": resolved_by,
        "resolved_cat_id": resolved_cat_id if resolved_cat_id and "-" in str(resolved_cat_id) else None,
        "reviewed_at": datetime.now(timezone.utc).isoformat() if reviewed else None,
        "metadata": metadata or {},
    }
    supabase.table("ai_cat_identity_review").insert(payload).execute()


def _storage_public_url(storage_client, object_path):
    res = storage_client.get_public_url(object_path)
    if isinstance(res, dict):
        data = res.get("data") or {}
        return data.get("publicUrl") or data.get("public_url")
    if hasattr(res, "get"):
        return res.get("publicUrl") or res.get("public_url")
    return str(res) if res else None


def upload_snapshot_to_storage(supabase, local_path, camera_id, cat_uuid, event_time):
    """
    Upload local snapshot to Supabase Storage and return public URL.
    If upload fails, return local_path to keep flow non-breaking.
    """
    if not supabase or not local_path or not os.path.exists(local_path):
        return local_path
    bucket = "camera-snapshots"
    ext = os.path.splitext(local_path)[1] or ".jpg"
    stamp = event_time.strftime("%Y%m%dT%H%M%S")
    cat_seg = cat_uuid or "unassigned"
    object_path = f"{camera_id}/{cat_seg}/{stamp}_{int(time.time() * 1000)}{ext}"

    def _upload_once():
        storage = supabase.storage.from_(bucket)
        content_type = mimetypes.guess_type(local_path)[0] or "image/jpeg"
        with open(local_path, "rb") as f:
            file_bytes = f.read()
        storage.upload(object_path, file_bytes, {"content-type": content_type, "x-upsert": "true"})
        return _storage_public_url(storage, object_path)

    try:
        public_url = _upload_once()
        return public_url or local_path
    except Exception as e:
        msg = str(e)
        if "Bucket not found" in msg:
            try:
                supabase.storage.create_bucket(bucket, {"public": True})
                public_url = _upload_once()
                return public_url or local_path
            except Exception as e2:
                print(f"Storage upload failed after bucket create attempt: {e2}")
                return local_path
        print(f"Storage upload failed: {e}")
        return local_path


def insert_timeline_event(supabase, cat_uuid, event_type, title, description, event_time_iso):
    if not supabase or not cat_uuid or "-" not in str(cat_uuid):
        return
    payload = {
        "cat_id": cat_uuid,
        "event_type": event_type,
        "title": title,
        "description": description,
        "event_time": event_time_iso,
    }
    supabase.table("timeline_events").insert(payload).execute()


def insert_alert_if_needed(
    supabase,
    owner_id,
    camera_id,
    cat_uuid,
    behavior,
    confidence,
    abnormal,
    event_time_iso,
    severity="warning",
    title=None,
):
    if not (supabase and owner_id and abnormal):
        return
    title = title or "Abnormal behavior detected"
    payload = {
        "owner_id": owner_id,
        "camera_id": camera_id,
        "cat_id": cat_uuid if cat_uuid and "-" in str(cat_uuid) else None,
        "type": "behavior_abnormal",
        "severity": severity,
        "title": title,
        "description": f"Detected {behavior} with confidence {int(confidence * 100)}%",
        "details": "Please review camera snapshot and cat condition.",
        "timestamp": event_time_iso,
        "source": "smart_cat_health_server",
        "metadata": {"behavior": behavior, "confidence": confidence},
    }
    supabase.table("alerts").insert(payload).execute()


def insert_over_capacity_alert(
    supabase,
    owner_id,
    camera_id,
    top_cat_uuid,
    top_cat_name,
    observed_count,
    allowed_count,
    event_time_iso,
):
    if not (supabase and owner_id and camera_id):
        return
    title = "More cats detected than assigned"
    desc = f"Detected {observed_count} cats while this camera is assigned to {allowed_count}."
    if top_cat_name:
        details = f"Most active in this period: {top_cat_name} ({top_cat_uuid}). Please review camera assignment."
    else:
        details = "Please review camera assignment and cat identity."
    payload = {
        "owner_id": owner_id,
        "camera_id": camera_id,
        "cat_id": top_cat_uuid if top_cat_uuid and "-" in str(top_cat_uuid) else None,
        "type": "camera_over_capacity",
        "severity": "warning",
        "title": title,
        "description": desc,
        "details": details,
        "timestamp": event_time_iso,
        "source": "smart_cat_health_server",
        "metadata": {
            "observed_count": observed_count,
            "allowed_count": allowed_count,
            "top_cat_uuid": top_cat_uuid,
            "top_cat_name": top_cat_name,
        },
    }
    supabase.table("alerts").insert(payload).execute()


def should_commit_behavior_event(event_state, cat_key, db_behavior, confidence, now_ts, frame_idx):
    """
    Count one event only when:
    1) behavior confidence passes threshold
    2) behavior is sustained for minimum streak frames
    3) same behavior cooldown has elapsed
    """
    min_conf = BEHAVIOR_MIN_CONFIDENCE.get(db_behavior, 0.4)
    if float(confidence or 0.0) < min_conf:
        return False

    state = event_state.setdefault(
        cat_key,
        {
            "observed_label": None,
            "streak": 0,
            "last_event_at": {},  # label -> epoch seconds
            "last_event_frame": {},  # label -> frame index
        },
    )

    if state["observed_label"] == db_behavior:
        state["streak"] += 1
    else:
        state["observed_label"] = db_behavior
        state["streak"] = 1

    min_streak = BEHAVIOR_MIN_STREAK_FRAMES.get(db_behavior, 10)
    if state["streak"] < min_streak:
        return False

    last_at = float(state["last_event_at"].get(db_behavior, 0.0))
    cooldown = BEHAVIOR_EVENT_COOLDOWN_SEC.get(db_behavior, 120.0)
    if (now_ts - last_at) < cooldown:
        return False
    last_frame = int(state["last_event_frame"].get(db_behavior, -1))
    if frame_idx == last_frame:
        return False

    state["last_event_at"][db_behavior] = now_ts
    state["last_event_frame"][db_behavior] = int(frame_idx)
    return True


def within_daily_cap(daily_event_counts, cat_key, db_behavior, now_dt_utc):
    day_key = now_dt_utc.date().isoformat()
    state_key = (cat_key, day_key, db_behavior)
    current = daily_event_counts.get(state_key, 0)
    cap = BEHAVIOR_DAILY_CAP.get(db_behavior, 999999)
    if current >= cap:
        return False
    daily_event_counts[state_key] = current + 1
    return True


def decide_abnormal_alert_level(abnormal_state, cat_key, now_ts):
    """
    Return severity level 'warning' or 'critical' when alert should fire, else None.
    """
    state = abnormal_state.setdefault(
        cat_key,
        {
            "events": deque(),  # abnormal event timestamps
            "last_alert_at": {"warning": 0.0, "critical": 0.0},
        },
    )

    events = state["events"]
    events.append(now_ts)
    while events and (now_ts - events[0]) > ABNORMAL_ESCALATION_WINDOW_SEC:
        events.popleft()

    level = "critical" if len(events) >= ABNORMAL_ESCALATION_CRITICAL_COUNT else "warning"
    cooldown = ABNORMAL_ALERT_COOLDOWN_SEC[level]
    if (now_ts - state["last_alert_at"].get(level, 0.0)) < cooldown:
        return None
    state["last_alert_at"][level] = now_ts
    return level


def upsert_daily_summary(supabase, cat_uuid, summary_date, metrics):
    if not supabase or not cat_uuid or "-" not in str(cat_uuid):
        return
    existing = (
        supabase.table("ai_daily_summary")
        .select("id")
        .eq("cat_id", cat_uuid)
        .eq("summary_date", summary_date)
        .limit(1)
        .execute()
        .data
        or []
    )
    data = {
        "cat_id": cat_uuid,
        "summary_date": summary_date,
        "total_feeding": metrics.get("total_feeding", 0),
        "total_litter": metrics.get("total_litter", 0),
        "total_abnormal": metrics.get("total_abnormal", 0),
        "dominant_behavior": metrics.get("dominant_behavior", "activity"),
        "count_00_06": metrics.get("count_00_06", 0),
        "count_06_12": metrics.get("count_06_12", 0),
        "count_12_18": metrics.get("count_12_18", 0),
        "count_18_24": metrics.get("count_18_24", 0),
    }
    if existing:
        supabase.table("ai_daily_summary").update(data).eq("id", existing[0]["id"]).execute()
    else:
        supabase.table("ai_daily_summary").insert(data).execute()


def run(
    source=0,
    camera_id=None,
    db_write=False,
    model_path=None,
    behavior_model_path=None,
    class_mapping_path=None,
    normal_snapshot_cooldown_sec=NORMAL_SNAPSHOT_COOLDOWN_SEC,
    abnormal_snapshot_cooldown_sec=ABNORMAL_SNAPSHOT_COOLDOWN_SEC,
):
    this_dir = os.path.dirname(os.path.abspath(__file__))
    default_weights = os.path.join(this_dir, "weights")
    model_path = model_path or os.path.join(default_weights, "detection_cat.pt")
    behavior_model_path = behavior_model_path or os.path.join(default_weights, "behavior_cat.pth")
    class_mapping_path = class_mapping_path or os.path.join(default_weights, "behavior_cat_classes.json")

    tracker = CatTracker(model_path=model_path, conf=MIN_DETECTION_CONF)
    behavior_sys = BehaviorSystem(model_path=behavior_model_path, class_mapping_path=class_mapping_path)
    supabase = create_supabase_client() if db_write else None
    if db_write and not supabase:
        raise SystemExit(
            "Supabase client init failed. Ensure client/.env contains EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY "
            "(service role key from the same Supabase project)."
        )
    camera_row = load_camera_record(supabase, camera_id) if db_write and camera_id else None
    assigned_cat_ids = load_camera_assigned_cat_ids(supabase, camera_id) if db_write and camera_id else []
    camera_zones = load_camera_zones(supabase, camera_id) if db_write and camera_id else []
    cat_name_map = load_cat_name_map(supabase, assigned_cat_ids) if db_write and assigned_cat_ids else {}
    owner_id = load_camera_owner_id(supabase, camera_id) if db_write and camera_id else None
    code_source = load_camera_source_from_code(camera_id)
    db_source = load_camera_source_from_db(supabase, camera_id) if db_write and camera_id else None
    camera_mode = (camera_row or {}).get("mode")
    is_single_mode = camera_mode == "single_cat"

    if db_write and camera_id and not camera_row:
        raise SystemExit(
            f"camera_id '{camera_id}' not found in public.cameras. "
            "Use cameras.id (not auth.users.id)."
        )

    if db_write and camera_id and db_source is None and normalize_source(source) in (0, None):
        raise SystemExit(
            f"camera_id '{camera_id}' has no stream_source in DB. "
            "Set cameras.stream_source first (video/webcam/rtsp)."
        )
    if db_write and camera_id and not assigned_cat_ids:
        raise SystemExit(
            f"camera_id '{camera_id}' has no cats assigned in camera_cats. "
            "Assign cats from Setcamera UI first."
        )

    lock_path = acquire_camera_lock(this_dir, camera_id) if camera_id else None
    set_camera_connection_status(supabase, camera_id, "online")

    # Use DB cat ids directly for known cats.
    # Unknown/excess detections are still tracked as local CATxxx for identity review flow.
    session = CatSessionManager(
        session_dir="sessions",
        known_cat_ids=assigned_cat_ids if db_write else None,
        max_cats=None,
    )

    source = code_source if code_source is not None else (db_source if db_source is not None else source)
    print(
        "[smart_cat_health] source resolved:",
        source,
        "| from_code:",
        code_source is not None,
        "| from_db:",
        db_source is not None,
        "| camera_id:",
        camera_id,
    )
    summary_rollup = defaultdict(lambda: {
        "total_feeding": 0,
        "total_litter": 0,
        "total_abnormal": 0,
        "count_00_06": 0,
        "count_06_12": 0,
        "count_12_18": 0,
        "count_18_24": 0,
        "_behavior_counts": defaultdict(int),
    })
    behavior_event_state = {}
    daily_event_counts = {}
    abnormal_escalation_state = {}
    over_capacity_state = {
        "active_since": None,
        "peak_observed": 0,
        "activity_counts": defaultdict(int),  # cat_uuid -> events count in this active window
        "last_alert_at": 0.0,
    }
    stale_expire_state = {
        "last_sweep_at": 0.0,
    }
    health_state = {
        "camera_id": camera_id,
        "pid": os.getpid(),
        "started_at": datetime.now(timezone.utc).isoformat(),
        "source": str(source),
        "frames_total": 0,
        "frames_processed": 0,
        "events_committed": 0,
        "pending_identity_count": 0,
        "fps": 0.0,
        "last_frame_at": None,
        "last_db_write_at": None,
        "last_event_at": None,
        "last_snapshot_at": None,
        "over_capacity_active": False,
        "last_error": None,
    }
    fps_window = deque(maxlen=30)
    last_health_write = 0.0
    if db_write and camera_id:
        expired = expire_stale_pending_identity_reviews(supabase, camera_id, PENDING_IDENTITY_EXPIRE_MIN)
        if expired:
            print(f"[smart_cat_health] auto-expired stale pending identity rows: {expired}")

    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print(f"Cannot open source: {source}")
        set_camera_connection_status(supabase, camera_id, "offline")
        release_camera_lock(lock_path)
        return

    frame_count = 0
    try:
        while True:
            ok, frame_orig = cap.read()
            if not ok:
                break
            now = time.time()
            frame_count += 1
            health_state["frames_total"] = frame_count
            health_state["last_frame_at"] = datetime.now(timezone.utc).isoformat()

            h, w = frame_orig.shape[:2]
            if w > PROCESS_WIDTH:
                scale = PROCESS_WIDTH / w
                frame_small = cv2.resize(frame_orig, (PROCESS_WIDTH, int(h * scale)))
            else:
                scale = 1.0
                frame_small = frame_orig

            if frame_count % PROCESS_EVERY_N_FRAMES != 0:
                cv2.imshow("Smart Cat Health", frame_orig)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
                continue

            health_state["frames_processed"] += 1
            fps_window.append(now)
            if len(fps_window) >= 2:
                span = fps_window[-1] - fps_window[0]
                if span > 0:
                    health_state["fps"] = round((len(fps_window) - 1) / span, 2)

            tracked = tracker.update(frame_small)
            valid_tracks_in_frame = 0
            frame_cat_counts = defaultdict(int)  # mapped cat_uuid activity in this frame
            frame_cat_last_bbox = {}  # cat_uuid -> last bbox in this frame
            for obj in tracked:
                bx1, by1, bx2, by2 = obj.bbox
                if scale != 1.0:
                    bx1, by1, bx2, by2 = bx1 / scale, by1 / scale, bx2 / scale, by2 / scale
                bbox = [bx1, by1, bx2, by2]
                if (bx2 - bx1) * (by2 - by1) < MIN_BBOX_AREA:
                    continue
                valid_tracks_in_frame += 1

                cat_id = session.get_cat_id(obj.track_id, bbox=bbox)
                session.update_seen(cat_id, bbox=bbox)
                cat = session.get_cat_data(cat_id)
                if not cat:
                    continue

                ex1, ey1, ex2, ey2 = expand_bbox(bbox, frame_orig.shape)
                crop = frame_orig[ey1:ey2, ex1:ex2]
                if crop.size == 0:
                    continue

                if frame_count % CLASSIFY_EVERY_N == 0:
                    behavior, confidence = behavior_sys.classify_behavior(crop, track_id=obj.track_id)
                    session.update_behavior(cat_id, behavior, confidence)

                behavior = cat["current_behavior"]
                confidence = cat["current_confidence"]
                abnormal = behavior_sys.is_abnormal(behavior)
                is_known_cat_uuid = ("-" in str(cat_id)) and (not assigned_cat_ids or (str(cat_id) in assigned_cat_ids))
                if abnormal:
                    session.increment_abnormal(cat_id)

                should_snap = is_known_cat_uuid and (abnormal or session.can_snapshot(cat_id, now))
                snap_path = None
                if should_snap and session.can_snapshot(cat_id, now):
                    snap_bbox = expand_bbox(bbox, frame_orig.shape)
                    snap_path = behavior_sys.create_snapshot(
                        frame_orig, snap_bbox, cat_id, behavior_label=behavior, confidence=confidence,
                        event_type="abnormal" if abnormal else "monitor",
                    )
                    session.set_snapshot_cooldown(
                        cat_id,
                        now,
                        abnormal_snapshot_cooldown_sec if abnormal else normal_snapshot_cooldown_sec,
                    )
                    health_state["last_snapshot_at"] = datetime.now(timezone.utc).isoformat()

                if db_write and camera_id and "-" in str(camera_id):
                    try:
                        event_time = datetime.now(timezone.utc)
                        event_iso = event_time.isoformat()
                        now_event_ts = time.time()
                        cat_uuid = cat_id if is_known_cat_uuid else None
                        if cat_uuid:
                            frame_cat_counts[cat_uuid] += 1
                            frame_cat_last_bbox[cat_uuid] = bbox
                        db_behavior = map_behavior_to_db(behavior)
                        zone_type, zone_score = detect_zone_for_bbox(camera_zones, bbox, frame_orig.shape)
                        db_behavior = apply_zone_behavior_prior(
                            db_behavior,
                            confidence,
                            zone_type,
                            zone_score,
                            zones_configured=bool(camera_zones),
                        )
                        cat_event_key = cat_uuid or str(cat_id)
                        should_commit = should_commit_behavior_event(
                            event_state=behavior_event_state,
                            cat_key=cat_event_key,
                            db_behavior=db_behavior,
                            confidence=confidence,
                            now_ts=now_event_ts,
                            frame_idx=frame_count,
                        )
                        if snap_path:
                            snap_path = upload_snapshot_to_storage(
                                supabase=supabase,
                                local_path=snap_path,
                                camera_id=camera_id,
                                cat_uuid=cat_uuid,
                                event_time=event_time,
                            )
                            health_state["last_db_write_at"] = datetime.now(timezone.utc).isoformat()
                        if should_commit and within_daily_cap(
                            daily_event_counts=daily_event_counts,
                            cat_key=cat_event_key,
                            db_behavior=db_behavior,
                            now_dt_utc=event_time,
                        ):
                            insert_ai_event(
                                supabase,
                                camera_id,
                                cat_uuid,
                                behavior,
                                confidence,
                                abnormal,
                                behavior_detail=behavior,
                            )
                            committed = True
                            health_state["events_committed"] += 1
                            health_state["last_event_at"] = event_iso
                            health_state["last_db_write_at"] = datetime.now(timezone.utc).isoformat()
                        else:
                            committed = False
                        if cat_uuid and committed:
                            rollup = summary_rollup[cat_uuid]
                            if db_behavior == "eat":
                                rollup["total_feeding"] += 1
                            if db_behavior == "litter":
                                rollup["total_litter"] += 1
                            if abnormal or db_behavior == "abnormal":
                                rollup["total_abnormal"] += 1
                            rollup[_slot_for_hour(event_time.hour)] += 1
                            rollup["_behavior_counts"][db_behavior] += 1
                            insert_timeline_event(
                                supabase,
                                cat_uuid,
                                db_behavior,
                                f"Behavior: {db_behavior}",
                                f"{behavior} ({int(confidence * 100)}%)",
                                event_iso,
                            )
                            if (not is_single_mode) and db_behavior == "abnormal":
                                level = decide_abnormal_alert_level(
                                    abnormal_state=abnormal_escalation_state,
                                    cat_key=cat_event_key,
                                    now_ts=now_event_ts,
                                )
                                if level:
                                    title = "Critical abnormal pattern detected" if level == "critical" else "Abnormal behavior detected"
                                    insert_alert_if_needed(
                                        supabase=supabase,
                                        owner_id=owner_id,
                                        camera_id=camera_id,
                                        cat_uuid=cat_uuid,
                                        behavior=behavior,
                                        confidence=confidence,
                                        abnormal=True,
                                        event_time_iso=event_iso,
                                        severity=level,
                                        title=title,
                                    )
                            elif (not is_single_mode) and db_behavior != "abnormal":
                                insert_alert_if_needed(
                                    supabase, owner_id, camera_id, cat_uuid, behavior, confidence, abnormal, event_iso
                                )
                            health_state["last_db_write_at"] = datetime.now(timezone.utc).isoformat()
                        if snap_path:
                            insert_identity_review(
                                supabase=supabase,
                                camera_id=camera_id,
                                pred_cat_uuid=cat_uuid,
                                behavior=behavior,
                                confidence=confidence,
                                snapshot_path=snap_path,
                                reviewed=True,
                                resolved_by="auto",
                                resolved_cat_id=cat_uuid,
                                metadata={
                                    "confirmed_cat": True,
                                    "source": "pipeline_auto_confirm",
                                },
                            )
                            health_state["last_db_write_at"] = datetime.now(timezone.utc).isoformat()
                    except Exception as e:
                        health_state["last_error"] = str(e)
                        print(f"DB write error: {e}")

            # Over-capacity handling: detected tracks exceed assigned cats (aggregated + throttled)
            if db_write and camera_id and assigned_cat_ids:
                observed_count = valid_tracks_in_frame
                allowed_count = len(assigned_cat_ids)
                now_ts = time.time()
                health_state["over_capacity_active"] = observed_count > allowed_count
                if observed_count > allowed_count:
                    if over_capacity_state["active_since"] is None:
                        over_capacity_state["active_since"] = now_ts
                        over_capacity_state["peak_observed"] = observed_count
                        over_capacity_state["activity_counts"].clear()
                    over_capacity_state["peak_observed"] = max(over_capacity_state["peak_observed"], observed_count)
                    for cid, cnt in frame_cat_counts.items():
                        over_capacity_state["activity_counts"][cid] += cnt

                    persisted = now_ts - over_capacity_state["active_since"]
                    cooldown_passed = (now_ts - over_capacity_state["last_alert_at"]) >= OVER_CAPACITY_ALERT_COOLDOWN_SEC
                    if persisted >= OVER_CAPACITY_MIN_PERSIST_SEC and cooldown_passed:
                        top_cat_uuid = None
                        top_cat_name = None
                        if over_capacity_state["activity_counts"]:
                            top_cat_uuid = max(
                                over_capacity_state["activity_counts"],
                                key=over_capacity_state["activity_counts"].get,
                            )
                            top_cat_name = cat_name_map.get(top_cat_uuid, top_cat_uuid)
                        try:
                            event_iso = datetime.now(timezone.utc).isoformat()
                            # Always create identity review task when over-capacity persists.
                            # Single-cat and multi-cat both require user confirmation in this situation.
                            review_cat_uuid = top_cat_uuid or (assigned_cat_ids[0] if assigned_cat_ids else None)
                            snap_path = None
                            review_bbox = frame_cat_last_bbox.get(review_cat_uuid) if review_cat_uuid else None
                            if review_bbox:
                                snap_bbox = expand_bbox(review_bbox, frame_orig.shape)
                                snap_path = behavior_sys.create_snapshot(
                                    frame_orig,
                                    snap_bbox,
                                    review_cat_uuid or "unassigned",
                                    behavior_label="active",
                                    confidence=0.51,
                                    event_type="monitor",
                                )
                                if snap_path:
                                    snap_path = upload_snapshot_to_storage(
                                        supabase=supabase,
                                        local_path=snap_path,
                                        camera_id=camera_id,
                                        cat_uuid=review_cat_uuid,
                                        event_time=datetime.now(timezone.utc),
                                    )
                                    health_state["last_snapshot_at"] = datetime.now(timezone.utc).isoformat()
                                    health_state["last_db_write_at"] = datetime.now(timezone.utc).isoformat()
                            insert_identity_review(
                                supabase=supabase,
                                camera_id=camera_id,
                                pred_cat_uuid=review_cat_uuid,
                                behavior="active",
                                confidence=0.51,
                                snapshot_path=snap_path,
                                reviewed=False,
                                resolved_by=None,
                                resolved_cat_id=None,
                                session_id=f"over_capacity_{int(now_ts)}",
                                metadata={
                                    "reason": "over_capacity",
                                    "observed_count": over_capacity_state["peak_observed"],
                                    "allowed_count": allowed_count,
                                    "top_cat_uuid": top_cat_uuid,
                                    "top_cat_name": top_cat_name,
                                    "requires_confirm": True,
                                },
                            )
                            if not is_single_mode:
                                insert_over_capacity_alert(
                                    supabase=supabase,
                                    owner_id=owner_id,
                                    camera_id=camera_id,
                                    top_cat_uuid=top_cat_uuid,
                                    top_cat_name=top_cat_name,
                                    observed_count=over_capacity_state["peak_observed"],
                                    allowed_count=allowed_count,
                                    event_time_iso=event_iso,
                                )
                            health_state["last_db_write_at"] = datetime.now(timezone.utc).isoformat()
                            health_state["pending_identity_count"] += 1
                            over_capacity_state["last_alert_at"] = now_ts
                            over_capacity_state["active_since"] = now_ts
                            over_capacity_state["peak_observed"] = observed_count
                            over_capacity_state["activity_counts"].clear()
                        except Exception as e:
                            health_state["last_error"] = str(e)
                            print(f"Over-capacity alert insert failed: {e}")
                else:
                    over_capacity_state["active_since"] = None
                    over_capacity_state["peak_observed"] = 0
                    over_capacity_state["activity_counts"].clear()

            lost = session.get_lost_tracks(now)
            for tid in lost:
                behavior_sys.cleanup_track(tid)
                session.remove_track(tid)

            if frame_count % 60 == 0:
                session.cleanup_expired_pool(now)

            if db_write and camera_id:
                if (now - stale_expire_state["last_sweep_at"]) >= PENDING_IDENTITY_SWEEP_SEC:
                    expired = expire_stale_pending_identity_reviews(supabase, camera_id, PENDING_IDENTITY_EXPIRE_MIN)
                    stale_expire_state["last_sweep_at"] = now
                    if expired:
                        print(f"[smart_cat_health] auto-expired stale pending identity rows: {expired}")
                    health_state["pending_identity_count"] = get_pending_identity_count(supabase, camera_id)

            if (now - last_health_write) >= HEALTH_WRITE_INTERVAL_SEC:
                write_pipeline_health(this_dir, camera_id, health_state)
                last_health_write = now

            cv2.imshow("Smart Cat Health", frame_orig)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    finally:
        health_state["ended_at"] = datetime.now(timezone.utc).isoformat()
        write_pipeline_health(this_dir, camera_id, health_state)
        if db_write and supabase:
            summary_date = datetime.now(timezone.utc).date().isoformat()
            for cat_uuid, metrics in summary_rollup.items():
                behaviors = metrics.pop("_behavior_counts", {})
                if behaviors:
                    metrics["dominant_behavior"] = max(behaviors, key=behaviors.get)
                try:
                    upsert_daily_summary(supabase, cat_uuid, summary_date, metrics)
                except Exception as e:
                    print(f"Daily summary upsert error ({cat_uuid}): {e}")
            set_camera_connection_status(supabase, camera_id, "offline")
        session.save_session()
        cap.release()
        cv2.destroyAllWindows()
        release_camera_lock(lock_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Smart Cat Health server pipeline")
    parser.add_argument("--source", type=str, default="0", help="0 webcam or video path")
    parser.add_argument("--width", type=int, default=PROCESS_WIDTH)
    parser.add_argument("--min-conf", type=float, default=MIN_DETECTION_CONF)
    parser.add_argument("--camera-id", type=str, default=None, help="UUID in cameras.id")
    parser.add_argument("--db-write", action="store_true", help="Write ai events to Supabase")
    parser.add_argument("--detector-model", type=str, default=None)
    parser.add_argument("--behavior-model", type=str, default=None)
    parser.add_argument("--class-mapping", type=str, default=None)
    parser.add_argument("--snapshot-cooldown-normal", type=float, default=NORMAL_SNAPSHOT_COOLDOWN_SEC)
    parser.add_argument("--snapshot-cooldown-abnormal", type=float, default=ABNORMAL_SNAPSHOT_COOLDOWN_SEC)
    args = parser.parse_args()

    PROCESS_WIDTH = args.width
    MIN_DETECTION_CONF = args.min_conf
    src = normalize_source(args.source)

    if args.db_write and not args.camera_id:
        raise SystemExit("When using --db-write you must pass --camera-id (UUID).")

    run(
        source=src,
        camera_id=args.camera_id,
        db_write=args.db_write,
        model_path=args.detector_model,
        behavior_model_path=args.behavior_model,
        class_mapping_path=args.class_mapping,
        normal_snapshot_cooldown_sec=args.snapshot_cooldown_normal,
        abnormal_snapshot_cooldown_sec=args.snapshot_cooldown_abnormal,
    )
