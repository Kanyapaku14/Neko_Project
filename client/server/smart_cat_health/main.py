import os
import cv2
import time
import argparse
import mimetypes
from collections import defaultdict
from datetime import datetime, timezone

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
        "grooming": "activity",
        "head_pressing": "abnormal",
        "vomiting": "abnormal",
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


def load_camera_owner_id(supabase, camera_id):
    if not supabase or not camera_id:
        return None
    try:
        row = supabase.table("cameras").select("owner_id").eq("id", camera_id).single().execute().data
        return row.get("owner_id") if row else None
    except Exception:
        return None


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
            .select("id, owner_id, stream_source, stream_source_type")
            .eq("id", camera_id)
            .maybe_single()
            .execute()
            .data
        )
    except Exception:
        return None


def load_camera_cat_uuid_map(supabase, camera_id):
    """Map session IDs (CAT001, CAT002, ...) to real cat UUIDs from camera_cats."""
    out = {}
    if not supabase or not camera_id:
        return out
    try:
        rows = (
            supabase.table("camera_cats")
            .select("cat_id, assigned_at")
            .eq("camera_id", camera_id)
            .order("assigned_at", desc=False)
            .execute()
            .data
            or []
        )
        for i, row in enumerate(rows, start=1):
            out[f"CAT{i:03d}"] = row.get("cat_id")
    except Exception:
        return {}
    return out


def insert_ai_event(supabase, camera_id, cat_uuid, behavior, confidence, abnormal):
    if not supabase or not camera_id or not cat_uuid or "-" not in str(cat_uuid):
        return
    payload = {
        "camera_id": camera_id,
        "cat_id": cat_uuid,
        "behavior_label": map_behavior_to_db(behavior),
        "confidence": round(float(confidence), 4),
        "abnormal": bool(abnormal),
        "occurred_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table("ai_cat_events").insert(payload).execute()


def insert_identity_review(supabase, camera_id, pred_cat_uuid, behavior, confidence, snapshot_path):
    if not supabase or not camera_id:
        return
    payload = {
        "camera_id": camera_id,
        "pred_cat_id": pred_cat_uuid if pred_cat_uuid and "-" in str(pred_cat_uuid) else None,
        "confidence": round(float(confidence), 4),
        "behavior_label": map_behavior_to_db(behavior),
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "snapshot_url": snapshot_path,
        "reviewed": False,
        "source": "smart_cat_health_server",
        "session_id": None,
        "metadata": {},
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


def insert_alert_if_needed(supabase, owner_id, camera_id, cat_uuid, behavior, confidence, abnormal, event_time_iso):
    if not (supabase and owner_id and abnormal):
        return
    payload = {
        "owner_id": owner_id,
        "camera_id": camera_id,
        "cat_id": cat_uuid if cat_uuid and "-" in str(cat_uuid) else None,
        "type": "behavior_abnormal",
        "severity": "warning",
        "title": "Abnormal behavior detected",
        "description": f"Detected {behavior} with confidence {int(confidence * 100)}%",
        "details": "Please review camera snapshot and cat condition.",
        "timestamp": event_time_iso,
        "source": "smart_cat_health_server",
        "metadata": {"behavior": behavior, "confidence": confidence},
    }
    supabase.table("alerts").insert(payload).execute()


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
    session = CatSessionManager(session_dir="sessions")
    supabase = create_supabase_client() if db_write else None
    if db_write and not supabase:
        raise SystemExit(
            "Supabase client init failed. Ensure client/.env contains EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY "
            "(service role key from the same Supabase project)."
        )
    camera_row = load_camera_record(supabase, camera_id) if db_write and camera_id else None
    cat_uuid_map = load_camera_cat_uuid_map(supabase, camera_id) if db_write and camera_id else {}
    owner_id = load_camera_owner_id(supabase, camera_id) if db_write and camera_id else None
    db_source = load_camera_source_from_db(supabase, camera_id) if db_write and camera_id else None

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

    source = db_source if db_source is not None else source
    print(
        "[smart_cat_health] source resolved:",
        source,
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

    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print(f"Cannot open source: {source}")
        return

    frame_count = 0
    try:
        while True:
            ok, frame_orig = cap.read()
            if not ok:
                break
            now = time.time()
            frame_count += 1

            h, w = frame_orig.shape[:2]
            if w > PROCESS_WIDTH:
                scale = PROCESS_WIDTH / w
                frame_small = cv2.resize(frame_orig, (PROCESS_WIDTH, int(h * scale)))
            else:
                scale = 1.0
                frame_small = frame_orig

            tracked = tracker.update(frame_small)
            for obj in tracked:
                bx1, by1, bx2, by2 = obj.bbox
                if scale != 1.0:
                    bx1, by1, bx2, by2 = bx1 / scale, by1 / scale, bx2 / scale, by2 / scale
                bbox = [bx1, by1, bx2, by2]
                if (bx2 - bx1) * (by2 - by1) < MIN_BBOX_AREA:
                    continue

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
                if abnormal:
                    session.increment_abnormal(cat_id)

                should_snap = abnormal or session.can_snapshot(cat_id, now)
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

                if db_write and camera_id and "-" in str(camera_id):
                    try:
                        event_time = datetime.now(timezone.utc)
                        event_iso = event_time.isoformat()
                        cat_uuid = cat_uuid_map.get(cat_id)
                        if snap_path:
                            snap_path = upload_snapshot_to_storage(
                                supabase=supabase,
                                local_path=snap_path,
                                camera_id=camera_id,
                                cat_uuid=cat_uuid,
                                event_time=event_time,
                            )
                        insert_ai_event(supabase, camera_id, cat_uuid, behavior, confidence, abnormal)
                        if cat_uuid:
                            db_behavior = map_behavior_to_db(behavior)
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
                            insert_alert_if_needed(
                                supabase, owner_id, camera_id, cat_uuid, behavior, confidence, abnormal, event_iso
                            )
                        if snap_path:
                            insert_identity_review(supabase, camera_id, cat_uuid, behavior, confidence, snap_path)
                    except Exception as e:
                        print(f"DB write error: {e}")

            lost = session.get_lost_tracks(now)
            for tid in lost:
                behavior_sys.cleanup_track(tid)
                session.remove_track(tid)

            if frame_count % 60 == 0:
                session.cleanup_expired_pool(now)

            cv2.imshow("Smart Cat Health", frame_orig)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    finally:
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
        session.save_session()
        cap.release()
        cv2.destroyAllWindows()


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
