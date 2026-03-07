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

# ── กำหนดให้ใช้ TCP สำหรับ RTSP ──────────────────────────────────────────────
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"

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
RTSP_URL      = "rtsp://testt1:1234test@172.20.10.8:554/stream2"
PROCESS_WIDTH  = 640          # ย่อ frame ก่อนส่งโมเดล (เพื่อความเร็ว)
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
def _camera_reader_thread():
    global _latest_frame, _frame_idx
    print(f"📷 [Camera] กำลังเชื่อมต่อ: {RTSP_URL}")
    while True:
        cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
        if not cap.isOpened():
            print("❌ [Camera] เชื่อมต่อล้มเหลว รออีก 3 วิ...")
            time.sleep(3)
            continue
        print("✅ [Camera] เชื่อมต่อสำเร็จ!")
        while True:
            ok, frame = cap.read()
            if not ok:
                print("⚠️  [Camera] สัญญาณขาด กำลัง reconnect...")
                cap.release()
                time.sleep(1)
                break
            with _latest_frame_lock:
                _latest_frame = frame.copy()
                _frame_idx += 1

# ── thread ประมวลผล AI ────────────────────────────────────────────────────────
def _ai_worker_thread():
    global _latest_annotated
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
            continue

        last_processed_idx = cur_idx

        # ── ถ้าไม่มีโมเดล ส่ง frame ดิบ ──────────────────────────────────
        if _tracker is None:
            with _ai_results_lock:
                _latest_annotated = frame.copy()
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
            _ai_results[:] = results_this_frame

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
threading.Thread(target=_camera_reader_thread, daemon=True).start()
threading.Thread(target=_ai_worker_thread,     daemon=True).start()
if DB_WRITE and CAMERA_ID and _supabase:
    threading.Thread(target=_db_writer_thread, daemon=True).start()
    print(f"[DB Writer] ✅ thread เริ่มแล้ว (camera_id={CAMERA_ID})")

# ── MJPEG stream generator ────────────────────────────────────────────────────
def _generate_mjpeg():
    while True:
        with _ai_results_lock:
            frame = _latest_annotated

        if frame is None:
            placeholder = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(placeholder, "Waiting for camera...",
                        (120, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 200), 2)
            ret, buf = cv2.imencode(".jpg", placeholder)
        else:
            ret, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])

        if not ret:
            time.sleep(0.033)
            continue

        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n"
        )
        time.sleep(0.033)   # ~30 fps cap

# ── Routes ────────────────────────────────────────────────────────────────────
@app.route("/api/video_feed")
def video_feed():
    return Response(_generate_mjpeg(), mimetype="multipart/x-mixed-replace; boundary=frame")

@app.route("/api/ai_results")
def ai_results():
    """JSON endpoint — ผลลัพธ์ AI ล่าสุด (ใช้ใน CameraScreen)"""
    with _ai_results_lock:
        data = list(_ai_results)
    return jsonify({"results": data, "ts": time.time()})

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
