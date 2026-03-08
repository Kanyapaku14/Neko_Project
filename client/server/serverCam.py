import os
import sys
import cv2
import time
import threading
import numpy as np
from collections import deque, defaultdict
from datetime import datetime, timezone
from flask import Flask, Response, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

try:
    from supabase import create_client
except Exception:
    create_client = None

# ── กำหนดให้ใช้ TCP สำหรับ RTSP ──────────────────────────────────────────────
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
    "rtsp_transport;tcp|stimeout;5000000|max_delay;500000|fflags;nobuffer|flags;low_delay"
)

# ── เพิ่ม path ของ smart_cat_health เพื่อ import โมเดล + DB helpers ─────────
THIS_DIR = os.path.dirname(os.path.abspath(__file__))
SCH_DIR = os.path.join(THIS_DIR, "smart_cat_health")

# THIS_DIR ต้องอยู่ใน sys.path เพื่อให้ import package `smart_cat_health.main` ได้
if THIS_DIR not in sys.path:
    sys.path.insert(0, THIS_DIR)
# SCH_DIR สำหรับ flat imports (models, behavior_system, cat_session)
if SCH_DIR not in sys.path:
    sys.path.insert(1, SCH_DIR)

from models import CatTracker
from behavior_system import BehaviorSystem
from cat_session import CatSessionManager

# ── DB helpers จาก main.py ───────────────────────────────────────────────────
from smart_cat_health.main import (
    create_supabase_client,
    insert_ai_event,
    insert_timeline_event,
    insert_alert_if_needed,
    map_behavior_to_db,
    should_commit_behavior_event,
    within_daily_cap,
    decide_abnormal_alert_level,
    set_camera_connection_status,
    load_camera_owner_id,
    load_camera_assigned_cat_ids,
    load_camera_record,
    upsert_daily_summary,
    BEHAVIOR_DAILY_CAP,
)

app = Flask(__name__)
CORS(app)

# ══════════════════════════════════════════════════════════════════════════════
# 🚨 แก้ไข 2 ค่านี้ให้ตรงกับกล้องของคุณ
# ══════════════════════════════════════════════════════════════════════════════
RTSP_URL    = "rtsp://testt1:1234test@192.168.1.140:554/stream2"
PROCESS_WIDTH = 640          # ย่อ frame ก่อนส่งโมเดล (เพื่อความเร็ว)
PROCESS_EVERY_N = 10          # ประมวลผลทุก N frame (1 = ทุก frame)
DETECTION_CONF  = 0.65        # confidence ขั้นต่ำสำหรับแมว
MIN_BBOX_AREA   = 5000        # พื้นที่ขั้นต่ำ (px²)
MAX_BBOX_RATIO  = 0.40        # bbox สูงสุดไม่เกิน 40% สัดส่วน frame
MIN_ASPECT_RATIO = 0.40       # width/height ขั้นต่ำ
# ══════════════════════════════════════════════════════════════════════════════

# ── DB config — อ่านจาก env var ──────────────────────────────────────────────
# ตั้งค่าก่อนรัน:
#   $env:SERVER_CAM_DB_WRITE="1"
#   $env:SERVER_CAM_CAMERA_ID="<uuid>"
DB_WRITE    = os.getenv("SERVER_CAM_DB_WRITE", "0") == "1"
CAMERA_ID   = os.getenv("SERVER_CAM_CAMERA_ID", None)

# ── โหลดโมเดล ────────────────────────────────────────────────────────────────
_weights      = os.path.join(SCH_DIR, "weights")
_tracker      = None
_behavior_sys = None
_session      = None

def _load_models():
    global _tracker, _behavior_sys, _session
    try:
        _tracker = CatTracker(
            model_path=os.path.join(_weights, "detection_cat.pt"),
            conf=DETECTION_CONF,
        )
        print(f"[AI] detection conf threshold: {DETECTION_CONF} | min bbox area: {MIN_BBOX_AREA}")
        _behavior_sys = BehaviorSystem(
            model_path=os.path.join(_weights, "behavior_cat.pth"),
            class_mapping_path=os.path.join(_weights, "behavior_cat_classes.json"),
        )
        _session = CatSessionManager(session_dir="sessions", known_cat_ids=None, max_cats=None)
        print("✅ [AI] โหลดโมเดลสำเร็จ!")
    except Exception as e:
        print(f"⚠️  [AI] โหลดโมเดลไม่สำเร็จ จะ stream แบบไม่มี AI: {e}")
        _tracker = _behavior_sys = _session = None

_load_models()

# ── โหลด Supabase + camera metadata (ถ้า DB_WRITE เปิด) ─────────────────────
_supabase     = None
_owner_id     = None
_assigned_cats = []

if DB_WRITE and CAMERA_ID:
    try:
        _supabase = create_supabase_client()
        if _supabase:
            _owner_id      = load_camera_owner_id(_supabase, CAMERA_ID)
            _assigned_cats = load_camera_assigned_cat_ids(_supabase, CAMERA_ID)
            cam_row        = load_camera_record(_supabase, CAMERA_ID)
            print(f"✅ [DB] Supabase เชื่อมสำเร็จ | camera_id={CAMERA_ID} | owner={_owner_id} | cats={_assigned_cats}")
            set_camera_connection_status(_supabase, CAMERA_ID, "online")
        else:
            print("⚠️  [DB] Supabase client init ล้มเหลว — ตรวจสอบ .env (EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY)")
    except Exception as e:
        print(f"⚠️  [DB] init error: {e}")
        _supabase = None
elif DB_WRITE and not CAMERA_ID:
    print("⚠️  [DB] SERVER_CAM_DB_WRITE=1 แต่ไม่ได้ตั้ง SERVER_CAM_CAMERA_ID — ข้ามการบันทึก DB")

# ── สี overlay ─────────────────────────────────────────────────────────────────
_BEHAVIOR_COLORS = {
    "eating":        (0, 200, 80),
    "toileting":     (30, 150, 255),
    "resting":       (100, 100, 255),
    "active":        (0, 220, 220),
    "grooming":      (200, 180, 0),
    "head_pressing": (0, 30, 220),
    "vomiting":      (0, 0, 200),
    "unknown":       (180, 180, 180),
}
_DEFAULT_COLOR     = (200, 200, 200)
_ABNORMAL_BEHAVIORS = {"head_pressing", "vomiting"}

# ── shared state ──────────────────────────────────────────────────────────────
_latest_frame_lock = threading.Lock()
_latest_frame      = None          # frame ดิบล่าสุด (numpy)
_latest_annotated  = None          # frame ที่ผ่าน AI แล้ว (numpy)
_ai_results        = []            # ผลลัพธ์ล่าสุด (list of dict)
_ai_results_lock   = threading.Lock()
_frame_idx         = 0

# ── DB write state (shared กับ _db_writer_thread) ───────────────────────────
_behavior_event_state   = {}
_daily_event_counts     = {}
_abnormal_escalation_state = {}
_summary_rollup         = defaultdict(lambda: {
    "total_feeding": 0,
    "total_litter":  0,
    "total_abnormal": 0,
    "count_00_06":   0,
    "count_06_12":   0,
    "count_12_18":   0,
    "count_18_24":   0,
    "_behavior_counts": defaultdict(int),
})

# ── thread อ่านกล้อง ──────────────────────────────────────────────────────────
def _pick_active_camera_from_db():
    if _supabase is None:
        return None
    try:
        rows = (
            _supabase.table("cameras")
            .select("id,owner_id,stream_source,stream_source_type,is_primary,is_ai_enabled,ai_connection_status,created_at")
            .order("is_primary", desc=True)
            .order("created_at", desc=False)
            .limit(50)
            .execute()
            .data
            or []
        )
        candidates = []
        for r in rows:
            src = _normalize_source_url(r.get("stream_source"))
            if not _is_valid_source_url(src):
                continue
            c = dict(r)
            c["stream_source"] = src
            c["_source_type_guess"] = _guess_source_type(src)
            candidates.append(c)
        if not candidates:
            return None

        # Prefer cameras that already have assigned cats.
        candidate_ids = [c.get("id") for c in candidates if _is_uuid_like(c.get("id"))]
        assigned_map = {}
        if candidate_ids:
            try:
                cc_rows = (
                    _supabase.table("camera_cats")
                    .select("camera_id")
                    .in_("camera_id", candidate_ids)
                    .execute()
                    .data
                    or []
                )
                for rr in cc_rows:
                    cid = str(rr.get("camera_id") or "")
                    assigned_map[cid] = assigned_map.get(cid, 0) + 1
            except Exception:
                assigned_map = {}

        # Prefer LIVE sources first so demo URLs do not override active RTSP cameras.
        live_first = sorted(
            candidates,
            key=lambda r: (
                0 if r.get("_source_type_guess") == "live" else 1,
                0 if assigned_map.get(str(r.get("id") or ""), 0) > 0 else 1,
                0 if (r.get("is_ai_enabled") is True or str(r.get("ai_connection_status") or "").lower() == "online") else 1,
                0 if r.get("is_primary") else 1,
            ),
        )
        return live_first[0]
    except Exception as e:
        print(f"[DB] pick active camera failed: {e}")
        return None


def _apply_source_from_db(cam_row):
    global _current_source, _source_type, _current_camera_id, _current_owner_id, _source_updated_at, _last_context_refresh_at
    if not cam_row:
        return False
    source_url = _normalize_source_url(cam_row.get("stream_source"))
    if not source_url:
        return False
    camera_id = cam_row.get("id")
    owner_id = cam_row.get("owner_id")
    source_type = _guess_source_type(source_url)

    changed = False
    with _source_lock:
        # Do not let DB demo source hijack a working live camera stream.
        if _camera_status == "connected" and _source_type == "live" and source_type == "demo":
            return False
        # Keep current live stream stable while healthy; don't hot-swap to another DB live URL.
        if (
            _camera_status == "connected"
            and _is_uuid_like(_current_camera_id)
            and _source_type == "live"
            and source_type == "live"
            and str(_current_source or "") != str(source_url or "")
        ):
            return False
        new_key = f"{source_type}|{camera_id}|{source_url}"
        old_key = f"{_source_type}|{_current_camera_id}|{_current_source}"
        if new_key != old_key:
            _source_type = source_type
            _current_source = source_url
            _current_camera_id = camera_id
            _current_owner_id = owner_id
            _source_updated_at = time.time()
            _track_cat_map.clear()
            _activity_sessions.clear()
            changed = True

    # Keep camera context fresh even when source URL doesn't change.
    # This allows server-only mode (no UI) to keep assigned cats synced from DB.
    now_ts = time.time()
    if changed or (not _is_uuid_like(_current_camera_id)) or (now_ts - _last_context_refresh_at > 60):
        _refresh_camera_context(camera_id=camera_id, owner_id=owner_id)
        _last_context_refresh_at = now_ts
        if changed:
            print(f"[DB] auto source applied camera={camera_id} type={source_type}")
    return changed


def _db_source_sync_thread():
    # Keep source synced from DB even when UI app is not opened.
    while True:
        try:
            cam = _pick_active_camera_from_db()
            if cam:
                _apply_source_from_db(cam)
            else:
                # No camera row found yet; clear transient mapping but keep stream alive.
                _track_cat_map.clear()
        except Exception as e:
            print(f"[DB] source sync error: {e}")
        time.sleep(DB_SOURCE_SYNC_SEC)


def _camera_reader_thread():
    global _latest_frame, _latest_frame_ts, _frame_idx, _capture_fps, _camera_status, _current_source, _source_type, _last_good_source, _last_good_type

    while True:
        with _source_lock:
            source_to_play = _current_source
            type_to_play   = _source_type
        
        print(f"📷 [VideoSource] สลับเป็นโหมด: {type_to_play} | Source: {source_to_play}")
        cap = cv2.VideoCapture(source_to_play, cv2.CAP_FFMPEG if "rtsp" in str(source_to_play).lower() else cv2.CAP_ANY)
        try:
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            if hasattr(cv2, "CAP_PROP_OPEN_TIMEOUT_MSEC"):
                cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)
            if hasattr(cv2, "CAP_PROP_READ_TIMEOUT_MSEC"):
                cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000)
        except Exception:
            pass

        if not cap.isOpened():
            print("❌ [VideoSource] เปิดไม่ได้ รออีก 3 วิ...")
            _mark_bad_source(source_to_play, cooldown_sec=180)
            with _source_lock:
                _camera_status = "disconnected"
                # Fallback to last known good source if new source cannot be opened
                if _last_good_source and _current_source != _last_good_source:
                    print(f"↩ [VideoSource] fallback to last good source: {_last_good_source}")
                    _current_source = _last_good_source
                    _source_type = _last_good_type
            time.sleep(1)
            continue

        with _source_lock:
            _camera_status = "connected"
            _last_good_source = source_to_play
            _last_good_type = type_to_play

        print(f"✅ [VideoSource] เริ่มเล่น {type_to_play} แล้ว!")
        
        # ถ้ารูปแบบไฟล์เป็นวีดีโอ ให้ cap.get(cv2.CAP_PROP_FPS) ไว้คำนวณ wait time
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_time = 1.0 / fps

        # ลูปอ่านเฟรม
        while True:
            # เช็คว่ามีคำสั่งเปลี่ยน source หรือไม่
            with _source_lock:
                if _current_source != source_to_play:
                    print("🔄 [VideoSource] มีคำสั่งเปลี่ยน Source ขอ stop ตัวเก่า...")
                    break 

            start_t = time.time()
            ok, frame = cap.read()
            
            if not ok:
                if type_to_play == "demo":
                    # 🔥 วิดีโอเล่นจบแล้ว ให้ loop ใหม่ 🔥
                    print("🔄 [VideoSource] วิดีโอเล่นจบแล้ว... กำลังวน Loop ใหม่")
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0) # กลับไปเฟรม 0
                    continue
                else:    
                    print("⚠️  [VideoSource] สัญญาณสดขาด กำลัง reconnect...")
                    _mark_bad_source(source_to_play, cooldown_sec=60)
                    break

            now_ts = time.time()
            with _latest_frame_lock:
                if _latest_frame_ts > 0:
                    dt = now_ts - _latest_frame_ts
                    if dt > 0:
                        inst_fps = 1.0 / dt
                        _capture_fps = inst_fps if _capture_fps <= 0 else ((_capture_fps * 0.85) + (inst_fps * 0.15))
                _latest_frame = frame.copy()
                _latest_frame_ts = now_ts
                _frame_idx += 1

            if (_frame_idx % 30) == 0:
                _update_camera_move_state(frame)

            # ควบคุมความเร็วการเล่นสำหรับ VOD video
            if type_to_play == "demo":
                elapsed = time.time() - start_t
                if elapsed < frame_time:
                    time.sleep(frame_time - elapsed)

        cap.release()
        time.sleep(1)

# ── thread ประมวลผล AI ────────────────────────────────────────────────────────
def _ai_worker_thread():
    global _latest_annotated, _latest_annotated_ts
    last_processed_idx = -1
    classify_every     = 2
    classify_counter   = 0

    while True:
        time.sleep(0.01)
        if _latest_frame is None:
            continue

        with _latest_frame_lock:
            frame   = _latest_frame.copy()
            cur_idx = _frame_idx

        if cur_idx == last_processed_idx:
            time.sleep(0.01)
            continue

        if cur_idx % PROCESS_EVERY_N != 0:
            last_processed_idx = cur_idx
            with _latest_frame_lock:
                annotated = _latest_frame.copy() if _latest_frame is not None else None
            if annotated is not None:
                with _ai_results_lock:
                    _latest_annotated = annotated
                    _latest_annotated_ts = time.time()
            continue

        last_processed_idx = cur_idx

        # ── ถ้าไม่มีโมเดล ส่ง frame ดิบ ──────────────────────────────────
        if _tracker is None:
            with _ai_results_lock:
                _latest_annotated = frame.copy()
                _latest_annotated_ts = time.time()
            continue

        # ── resize สำหรับ inference ───────────────────────────────────────
        h, w   = frame.shape[:2]
        if w > PROCESS_WIDTH:
            scale = PROCESS_WIDTH / w
            small = cv2.resize(frame, (PROCESS_WIDTH, int(h * scale)))
        else:
            scale = 1.0
            small = frame

        annotated = frame.copy()
        results_this_frame = []

        try:
            tracked = _tracker.update(small)
            classify_counter += 1

            for obj in tracked:
                bx1, by1, bx2, by2 = obj.bbox
                if scale != 1.0:
                    bx1, by1, bx2, by2 = bx1/scale, by1/scale, bx2/scale, by2/scale
                bbox = [int(bx1), int(by1), int(bx2), int(by2)]

                bw       = bbox[2] - bbox[0]
                bh       = bbox[3] - bbox[1]
                bbox_area  = bw * bh
                frame_area = w * h

                if bbox_area < MIN_BBOX_AREA:
                    continue
                if frame_area > 0 and (bbox_area / frame_area) > MAX_BBOX_RATIO:
                    continue
                aspect = bw / bh if bh > 0 else 0
                if aspect < MIN_ASPECT_RATIO:
                    print(f"[Filter] skip track={obj.track_id} aspect={aspect:.2f} (too tall = human)")
                    continue

                cat_id = _session.get_cat_id(obj.track_id, bbox=bbox)
                _session.update_seen(cat_id, bbox=bbox)
                cat = _session.get_cat_data(cat_id)
                if not cat:
                    continue

                # ── classify behavior ─────────────────────────────────────
                ex1 = max(0, bbox[0] - 20)
                ey1 = max(0, bbox[1] - 20)
                ex2 = min(w, bbox[2] + 20)
                ey2 = min(h, bbox[3] + 20)
                crop = frame[ey1:ey2, ex1:ex2]

                if crop.size > 0 and classify_counter % classify_every == 0:
                    behavior, confidence = _behavior_sys.classify_behavior(
                        crop, track_id=obj.track_id
                    )
                    _session.update_behavior(cat_id, behavior, confidence)

                behavior   = cat["current_behavior"]
                confidence = cat["current_confidence"]
                abnormal   = behavior in _ABNORMAL_BEHAVIORS
                color      = _BEHAVIOR_COLORS.get(behavior, _DEFAULT_COLOR)

                # ── วาด overlay ───────────────────────────────────────────
                x1, y1, x2, y2 = bbox
                thickness = 3 if abnormal else 2
                cv2.rectangle(annotated, (x1, y1), (x2, y2), color, thickness)

                label = f"{cat_id} | {behavior} {int(confidence*100)}%"
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                cv2.rectangle(annotated, (x1, y1 - th - 8), (x1 + tw + 6, y1), color, -1)
                cv2.putText(
                    annotated, label,
                    (x1 + 3, y1 - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5,
                    (0, 0, 0) if abnormal else (255, 255, 255),
                    1, cv2.LINE_AA,
                )

                if abnormal:
                    cv2.putText(
                        annotated, "⚠ ABNORMAL",
                        (x1, y2 + 18),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                        (0, 0, 220), 2, cv2.LINE_AA,
                    )

                results_this_frame.append({
                    "cat_id":     cat_id,
                    "behavior":   behavior,
                    "confidence": round(float(confidence), 3),
                    "abnormal":   abnormal,
                    "bbox":       bbox,
                })

            # ── timestamp บน frame ────────────────────────────────────────
            ts = time.strftime("%H:%M:%S")
            cv2.putText(
                annotated, f"AI | {ts}",
                (8, annotated.shape[0] - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45,
                (255, 255, 255), 1, cv2.LINE_AA,
            )

        except Exception as e:
            print(f"[AI Worker] error: {e}")

        with _ai_results_lock:
            _latest_annotated = annotated
            _latest_annotated_ts = time.time()
            _ai_results[:] = results_this_frame
        _update_activity_sessions(frame, results_this_frame)

# ── thread บันทึกลง DB (เฉพาะเมื่อ DB_WRITE=True) ───────────────────────────
def _slot_for_hour(hour):
    if 0 <= hour < 6:   return "count_00_06"
    if 6 <= hour < 12:  return "count_06_12"
    if 12 <= hour < 18: return "count_12_18"
    return "count_18_24"

def _db_writer_thread():
    """
    อ่าน _ai_results ทุก 1 วิ แล้วตัดสินใจว่าจะ commit event ลง DB หรือไม่
    Logic เดียวกับ main.py แต่ทำงานแบบ async ไม่บล็อก MJPEG stream
    """
    print(f"[DB Writer] เริ่มต้น | camera_id={CAMERA_ID} | supabase={'OK' if _supabase else 'NONE'}")
    frame_counter = 0

    while True:
        time.sleep(1.0)

        if not _supabase or not CAMERA_ID:
            continue

        with _ai_results_lock:
            results_snapshot = list(_ai_results)

        if not results_snapshot:
            continue

        frame_counter += 1
        now_ts   = time.time()
        now_dt   = datetime.now(timezone.utc)
        event_iso = now_dt.isoformat()

        for res in results_snapshot:
            cat_id    = res["cat_id"]
            behavior  = res["behavior"]
            confidence = res["confidence"]
            abnormal  = res["abnormal"]

            # รับเฉพาะแมวที่ assigned ไว้ (UUID) — ข้าม local track id
            is_uuid  = "-" in str(cat_id)
            cat_uuid = cat_id if is_uuid else None

            # ถ้ายังไม่มี assigned cats หรือ cat_id นี้ไม่ได้ assign ให้กล้องนี้ → ข้าม
            if _assigned_cats and cat_uuid and cat_uuid not in _assigned_cats:
                continue

            db_behavior = map_behavior_to_db(behavior)
            cat_key     = cat_uuid or str(cat_id)

            should_commit = should_commit_behavior_event(
                event_state=_behavior_event_state,
                cat_key=cat_key,
                db_behavior=db_behavior,
                confidence=confidence,
                now_ts=now_ts,
                frame_idx=frame_counter,
            )

            if not should_commit:
                continue

            if not within_daily_cap(
                daily_event_counts=_daily_event_counts,
                cat_key=cat_key,
                db_behavior=db_behavior,
                now_dt_utc=now_dt,
            ):
                print(f"[DB Writer] daily cap ถึงแล้ว: {cat_key} {db_behavior}")
                continue

            try:
                # ── insert ai_cat_events ──────────────────────────────────
                insert_ai_event(_supabase, CAMERA_ID, cat_uuid, behavior, confidence, abnormal)
                print(f"[DB Writer] ✅ event: cat={cat_id} behavior={db_behavior} conf={confidence:.2f} abnormal={abnormal}")

                # ── insert timeline_events ────────────────────────────────
                if cat_uuid:
                    insert_timeline_event(
                        _supabase,
                        cat_uuid,
                        db_behavior,
                        f"Behavior: {db_behavior}",
                        f"{behavior} ({int(confidence * 100)}%)",
                        event_iso,
                    )

                # ── update daily rollup ───────────────────────────────────
                if cat_uuid:
                    rollup = _summary_rollup[cat_uuid]
                    if db_behavior == "eat":
                        rollup["total_feeding"] += 1
                    if db_behavior == "litter":
                        rollup["total_litter"] += 1
                    if abnormal or db_behavior == "abnormal":
                        rollup["total_abnormal"] += 1
                    rollup[_slot_for_hour(now_dt.hour)] += 1
                    rollup["_behavior_counts"][db_behavior] += 1

                # ── alert ถ้า abnormal ────────────────────────────────────
                if abnormal and _owner_id:
                    level = decide_abnormal_alert_level(
                        abnormal_state=_abnormal_escalation_state,
                        cat_key=cat_key,
                        now_ts=now_ts,
                    )
                    if level:
                        title = (
                            "Critical abnormal pattern detected"
                            if level == "critical"
                            else "Abnormal behavior detected"
                        )
                        insert_alert_if_needed(
                            supabase=_supabase,
                            owner_id=_owner_id,
                            camera_id=CAMERA_ID,
                            cat_uuid=cat_uuid,
                            behavior=behavior,
                            confidence=confidence,
                            abnormal=True,
                            event_time_iso=event_iso,
                            severity=level,
                            title=title,
                        )
                        print(f"[DB Writer] 🚨 alert inserted: {level} | {behavior}")

            except Exception as e:
                print(f"[DB Writer] ❌ error: {e}")

    # ── (unreachable) flush daily summary ────────────────────────────────

def _flush_daily_summary():
    if not _supabase:
        return
    summary_date = datetime.now(timezone.utc).date().isoformat()
    for cat_uuid, metrics in _summary_rollup.items():
        behaviors = metrics.pop("_behavior_counts", {})
        if behaviors:
            metrics["dominant_behavior"] = max(behaviors, key=behaviors.get)
        try:
            upsert_daily_summary(_supabase, cat_uuid, summary_date, metrics)
        except Exception as e:
            print(f"[DB Writer] daily summary error ({cat_uuid}): {e}")

# ── เริ่ม background threads ──────────────────────────────────────────────────
try:
    _apply_source_from_db(_pick_active_camera_from_db())
except Exception:
    pass
threading.Thread(target=_camera_reader_thread, daemon=True).start()
threading.Thread(target=_ai_worker_thread,     daemon=True).start()
if DB_WRITE and CAMERA_ID and _supabase:
    threading.Thread(target=_db_writer_thread, daemon=True).start()
    print(f"[DB Writer] ✅ thread เริ่มแล้ว (camera_id={CAMERA_ID})")

# ── MJPEG stream generator ────────────────────────────────────────────────────
def _clamp_int(value, default_value, low, high):
    try:
        v = int(value)
    except Exception:
        v = int(default_value)
    return max(low, min(high, v))


def _encode_stream_frame(frame, quality, max_width):
    if frame is None:
        return None
    out = frame
    try:
        h, w = out.shape[:2]
        if w > max_width > 0:
            scale = max_width / float(w)
            out = cv2.resize(out, (max_width, max(1, int(h * scale))))
    except Exception:
        out = frame

    ok, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, int(quality)])
    if not ok:
        return None
    return buf.tobytes()


def _generate_mjpeg_raw(out_fps=None, jpeg_quality=None, max_width=None):
    out_fps = _clamp_int(out_fps, STREAM_OUTPUT_FPS, 6, 30)
    jpeg_quality = _clamp_int(jpeg_quality, JPEG_QUALITY, 35, 90)
    max_width = _clamp_int(max_width, STREAM_MAX_WIDTH, 320, 1920)
    while True:
        with _ai_results_lock:
            ann = _latest_annotated.copy() if _latest_annotated is not None else None
        with _latest_frame_lock:
            raw = _latest_frame.copy() if _latest_frame is not None else None

        # Raw-first for smooth motion.
        frame = raw if raw is not None else ann

        if frame is None:
            placeholder = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(placeholder, "Waiting for camera...",
                        (120, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 200), 2)
            payload = _encode_stream_frame(placeholder, jpeg_quality, max_width)
        else:
            payload = _encode_stream_frame(frame, jpeg_quality, max_width)

        if not payload:
            time.sleep(0.033)
            continue

        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n"
            b"Cache-Control: no-store, no-cache, must-revalidate, max-age=0\r\n"
            b"Pragma: no-cache\r\n\r\n" + payload + b"\r\n"
        )
        time.sleep(1.0 / max(1, out_fps))


def _generate_mjpeg_ai(out_fps=None, jpeg_quality=None, max_width=None):
    out_fps = _clamp_int(out_fps, STREAM_OUTPUT_FPS, 6, 30)
    jpeg_quality = _clamp_int(jpeg_quality, JPEG_QUALITY, 35, 90)
    max_width = _clamp_int(max_width, STREAM_MAX_WIDTH, 320, 1920)
    while True:
        with _ai_results_lock:
            ann = _latest_annotated.copy() if _latest_annotated is not None else None
        with _latest_frame_lock:
            raw = _latest_frame.copy() if _latest_frame is not None else None

        # AI overlay feed; fallback to raw when AI frame is not available.
        frame = ann if ann is not None else raw

        if frame is None:
            placeholder = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(placeholder, "Waiting for camera...",
                        (120, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 200), 2)
            payload = _encode_stream_frame(placeholder, jpeg_quality, max_width)
        else:
            payload = _encode_stream_frame(frame, jpeg_quality, max_width)

        if not payload:
            time.sleep(0.033)
            continue

        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n"
            b"Cache-Control: no-store, no-cache, must-revalidate, max-age=0\r\n"
            b"Pragma: no-cache\r\n\r\n" + payload + b"\r\n"
        )
        time.sleep(1.0 / max(1, out_fps))

# ── Routes ────────────────────────────────────────────────────────────────────
@app.route("/api/video_feed")
def video_feed():
    fps = request.args.get("fps")
    quality = request.args.get("quality")
    width = request.args.get("width")
    return Response(
        _generate_mjpeg_raw(out_fps=fps, jpeg_quality=quality, max_width=width),
        mimetype="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", "Pragma": "no-cache"},
    )

@app.route("/api/video_feed_raw")
def video_feed_raw():
    fps = request.args.get("fps")
    quality = request.args.get("quality")
    width = request.args.get("width")
    return Response(
        _generate_mjpeg_raw(out_fps=fps, jpeg_quality=quality, max_width=width),
        mimetype="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", "Pragma": "no-cache"},
    )

@app.route("/api/video_feed_ai")
def video_feed_ai():
    fps = request.args.get("fps")
    quality = request.args.get("quality")
    width = request.args.get("width")
    return Response(
        _generate_mjpeg_ai(out_fps=fps, jpeg_quality=quality, max_width=width),
        mimetype="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", "Pragma": "no-cache"},
    )

@app.route("/api/latest_frame.jpg")
def latest_frame_jpg():
    with _ai_results_lock:
        frame = _latest_annotated.copy() if _latest_annotated is not None else None
    if frame is None:
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(frame, "No frame yet", (190, 245), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 200), 2)
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 78])
    if not ok:
        return Response(status=503)
    return Response(buf.tobytes(), mimetype="image/jpeg")


@app.route("/api/frame_signature")
def frame_signature():
    with _latest_frame_lock:
        frame = _latest_frame.copy() if _latest_frame is not None else None
        ts = _latest_frame_ts
    sig = _frame_signature(frame)
    return jsonify({
        "status": "ok" if sig else "no_frame",
        "signature": sig,
        "frame_ts": ts,
    })


@app.route("/api/zone_status")
def zone_status():
    with _zone_lock:
        food_n = len(_zones_by_type.get("food") or [])
        litter_n = len(_zones_by_type.get("litter") or [])
        baseline = _zone_baseline_signature
    with _source_lock:
        cam_id = _current_camera_id
    return jsonify({
        "status": "ok",
        "camera_id": cam_id,
        "zones_configured": food_n + litter_n,
        "food_zones": food_n,
        "litter_zones": litter_n,
        "has_baseline_signature": bool(baseline),
        "camera_moved": bool(_camera_moved),
        "camera_moved_since": _camera_moved_since or None,
        "signature_distance": _last_zone_distance,
    })

@app.route("/api/set_source", methods=["POST"])
def set_source():
    global _current_source, _source_type, _current_camera_id, _current_owner_id, _source_updated_at
    try:
        data = request.get_json(silent=True) or {}
        source_url = _normalize_source_url(data.get("source_url"))
        requested_type = str(data.get("source_type") or "").strip().lower()
        camera_id = data.get("camera_id")
        owner_id = data.get("owner_id")

        source_type = requested_type if requested_type in ("live", "demo") else _guess_source_type(source_url)
        if not source_url:
            # Fallback: if app does not provide demo URL, keep live mode on default camera source.
            if source_type == "demo":
                return jsonify({"status": "error", "message": "source_url is required for demo source"}), 400
            source_url = RTSP_URL
        if not _is_valid_source_url(source_url):
            return jsonify({"status": "error", "message": "invalid source_url"}), 400

        if _is_temporarily_bad_source(source_url):
            return jsonify({
                "status": "error",
                "message": "source temporarily blocked after recent connection failure",
                "source": source_url,
            }), 409

        # Fast-path: no-op when requested source is already active.
        with _source_lock:
            current_key = f"{_source_type}|{_current_camera_id}|{_current_source}"
        requested_key = f"{source_type}|{camera_id}|{source_url}"
        if requested_key != current_key:
            readable = _probe_source_readable(source_url, source_type=source_type)
            if not readable:
                _mark_bad_source(source_url, cooldown_sec=180)
                return jsonify({
                    "status": "error",
                    "message": "source is not reachable/readable",
                    "source": source_url,
                }), 409

        # Fast-path: no-op when requested source is already active.
        with _source_lock:
            if (
                _current_source == source_url
                and _source_type == source_type
                and str(_current_camera_id or "") == str(camera_id or "")
                and str(_current_owner_id or "") == str(owner_id or "")
            ):
                return jsonify({
                    "status": "ok",
                    "message": "unchanged",
                    "source": _current_source,
                    "type": _source_type,
                    "camera_id": _current_camera_id,
                    "owner_id": _current_owner_id,
                    "updated_at": _source_updated_at,
                })

        with _source_lock:
            _source_type = source_type
            _current_source = source_url
            _current_camera_id = camera_id
            _current_owner_id = owner_id
            _source_updated_at = time.time()
            _track_cat_map.clear()
            _activity_sessions.clear()

        _refresh_camera_context(camera_id=camera_id, owner_id=owner_id)

        return jsonify({
            "status": "ok",
            "source": _current_source,
            "type": _source_type,
            "camera_id": _current_camera_id,
            "owner_id": _current_owner_id,
            "updated_at": _source_updated_at,
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route("/api/source_status")
def source_status():
    with _source_lock:
        return jsonify({
            "status": "ok",
            "source": _current_source,
            "source_type": _source_type,
            "camera_status": _camera_status,
            "camera_id": _current_camera_id,
            "owner_id": _current_owner_id,
            "updated_at": _source_updated_at,
        })

@app.route("/api/ai_results")
def ai_results():
    """JSON endpoint — ผลลัพธ์ AI ล่าสุด (ใช้ใน CameraScreen)"""
    with _ai_results_lock:
        data = list(_ai_results)
    return jsonify({"results": data, "ts": time.time()})


@app.route("/api/environment")
def environment():
    # Tapo C200C has no onboard temperature/humidity sensor.
    # We estimate environment via weather API using camera coordinates.
    cam_id = request.args.get("camera_id")
    if not cam_id:
        with _source_lock:
            cam_id = _current_camera_id

    lat_q = _to_float(request.args.get("lat"))
    lon_q = _to_float(request.args.get("lon"))
    if lat_q is not None and lon_q is not None:
        lat, lon, coord_source = lat_q, lon_q, "query"
    else:
        lat, lon, coord_source = _get_coords_for_camera(cam_id)

    if lat is None or lon is None:
        return jsonify({
            "status": "no_coords",
            "message": "Missing camera coordinates. Set CAMERA_LAT/CAMERA_LON or CAMERA_COORDS_JSON.",
            "camera_id": cam_id,
        }), 200

    cache_key = f"{cam_id}|{round(lat, 6)}|{round(lon, 6)}"
    now_ts = time.time()
    if (
        _environment_cache.get("key") == cache_key
        and (now_ts - float(_environment_cache.get("ts") or 0.0)) < ENV_CACHE_SEC
        and isinstance(_environment_cache.get("payload"), dict)
    ):
        payload = dict(_environment_cache["payload"])
        payload["cache"] = True
        return jsonify(payload)

    current = _fetch_open_meteo_current(lat, lon)
    if not current:
        return jsonify({
            "status": "unavailable",
            "camera_id": cam_id,
            "lat": lat,
            "lon": lon,
            "coord_source": coord_source,
        }), 200

    payload = {
        "status": "ok",
        "camera_id": cam_id,
        "lat": lat,
        "lon": lon,
        "coord_source": coord_source,
        "temperature": current["temperature"],
        "humidity": current["humidity"],
        "provider": current["provider"],
        "cache": False,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
    _environment_cache["key"] = cache_key
    _environment_cache["ts"] = now_ts
    _environment_cache["payload"] = payload
    return jsonify(payload)

@app.route("/api/health")
def health():
    has_frame = _latest_annotated is not None
    return jsonify({
        "camera":  has_frame,
        "ai":      _tracker is not None,
        "db":      _supabase is not None,
        "db_write": DB_WRITE,
        "camera_id": CAMERA_ID,
    })

# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("🚀 [Camera+AI Server] กำลังรันบน Port 5000...")
    print(f"   DB_WRITE={DB_WRITE} | CAMERA_ID={CAMERA_ID}")
    try:
        app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
    finally:
        _flush_daily_summary()
        if _supabase and CAMERA_ID:
            set_camera_connection_status(_supabase, CAMERA_ID, "offline")
