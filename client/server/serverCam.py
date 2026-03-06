import os
import sys
import cv2
import time
import threading
import numpy as np
from flask import Flask, Response, jsonify
from flask_cors import CORS

# ── กำหนดให้ใช้ TCP สำหรับ RTSP ──────────────────────────────────────────────
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"

# ── เพิ่ม path ของ smart_cat_health เพื่อ import โมเดล ───────────────────────
THIS_DIR = os.path.dirname(os.path.abspath(__file__))
SCH_DIR = os.path.join(THIS_DIR, "smart_cat_health")
if SCH_DIR not in sys.path:
    sys.path.insert(0, SCH_DIR)

from models import CatTracker
from behavior_system import BehaviorSystem
from cat_session import CatSessionManager

app = Flask(__name__)
CORS(app)

# ══════════════════════════════════════════════════════════════════════════════
# 🚨 แก้ไข 2 ค่านี้ให้ตรงกับกล้องของคุณ
# ══════════════════════════════════════════════════════════════════════════════
RTSP_URL    = "rtsp://testt1:1234test@172.20.10.8:554/stream2"
PROCESS_WIDTH = 640          # ย่อ frame ก่อนส่งโมเดล (เพื่อความเร็ว)
PROCESS_EVERY_N = 10          # ประมวลผลทุก N frame (1 = ทุก frame)
DETECTION_CONF   = 0.65        # confidence ขั้นต่ำสำหรับแมว
MIN_BBOX_AREA    = 5000        # พื้นที่ขั้นต่ำ (px²) — กรอง object เล็กเกินไปออก
MAX_BBOX_RATIO   = 0.40        # bbox สูงสุดไม่เกิน 40% สัดส่วน frame (คนยืนใกล้กล้องมักใหญ่กว่านี้)
MIN_ASPECT_RATIO = 0.40        # width/height ขั้นต่ำ — คนยืน ~0.2-0.35, แมว ~0.5-1.5
# ══════════════════════════════════════════════════════════════════════════════

# ── โหลดโมเดล ────────────────────────────────────────────────────────────────
_weights = os.path.join(SCH_DIR, "weights")
_tracker      = None
_behavior_sys = None
_session      = None

def _load_models():
    global _tracker, _behavior_sys, _session
    try:
        _tracker      = CatTracker(
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
_DEFAULT_COLOR = (200, 200, 200)
_ABNORMAL_BEHAVIORS = {"head_pressing", "vomiting"}

# ── state สำหรับ inference แบบ async ─────────────────────────────────────────
_latest_frame_lock  = threading.Lock()
_latest_frame       = None          # frame ดิบล่าสุด (numpy)
_latest_annotated   = None          # frame ที่ผ่าน AI แล้ว (numpy)
_ai_results         = []            # ผลลัพธ์ล่าสุด (list of dict)
_ai_results_lock    = threading.Lock()
_frame_idx          = 0

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
    classify_every = 2
    classify_counter = 0

    while True:
        # รอจนกว่าจะมี frame ใหม่
        with _latest_frame_lock:
            if _frame_idx == last_processed_idx or _latest_frame is None:
                pass
            else:
                frame = _latest_frame.copy()
                cur_idx = _frame_idx

        time.sleep(0.01)
        if _latest_frame is None:
            continue

        with _latest_frame_lock:
            frame = _latest_frame.copy()
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

        # ── ถ้าไม่มีโมเดล ส่ง frame ดิบ ─────────────────────────────────────
        if _tracker is None:
            with _ai_results_lock:
                _latest_annotated = frame.copy()
            continue

        # ── resize สำหรับ inference ──────────────────────────────────────────
        h, w = frame.shape[:2]
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

                bw = bbox[2] - bbox[0]
                bh = bbox[3] - bbox[1]
                bbox_area = bw * bh
                frame_area = w * h

                # ❤️‍🗨️ filter 1: พื้นที่ขั้นต่ำ
                if bbox_area < MIN_BBOX_AREA:
                    continue

                # ❤️‍🗨️ filter 2: bbox ใหญ่เกินไป (คนยืนใกล้กล้อง)
                if frame_area > 0 and (bbox_area / frame_area) > MAX_BBOX_RATIO:
                    continue

                # ❤️‍🗨️ filter 3: aspect ratio — คนยืนสูงแคบ (w/h น้อย), แมวอ้วนกลม/แนวนอน (w/h มากกว่า)
                aspect = bw / bh if bh > 0 else 0
                if aspect < MIN_ASPECT_RATIO:
                    print(f"[Filter] skip track={obj.track_id} aspect={aspect:.2f} (too tall = human)")
                    continue

                cat_id = _session.get_cat_id(obj.track_id, bbox=bbox)
                _session.update_seen(cat_id, bbox=bbox)
                cat = _session.get_cat_data(cat_id)
                if not cat:
                    continue

                # ── classify behavior ────────────────────────────────────────
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

                # ── วาด overlay ──────────────────────────────────────────────
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
                    "cat_id":    cat_id,
                    "behavior":  behavior,
                    "confidence": round(float(confidence), 3),
                    "abnormal":  abnormal,
                    "bbox":      bbox,
                })

            # ── timestamp บน frame ───────────────────────────────────────────
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

# ── เริ่ม background threads ──────────────────────────────────────────────────
threading.Thread(target=_camera_reader_thread, daemon=True).start()
threading.Thread(target=_ai_worker_thread,     daemon=True).start()

# ── MJPEG stream generator ────────────────────────────────────────────────────
def _generate_mjpeg():
    while True:
        with _ai_results_lock:
            frame = _latest_annotated

        if frame is None:
            # ยังไม่มีภาพ — ส่ง placeholder สีดำ
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
    """JSON endpoint — ผลลัพธ์ AI ล่าสุด (optional สำหรับแอพ)"""
    with _ai_results_lock:
        data = list(_ai_results)
    return jsonify({"results": data, "ts": time.time()})

@app.route("/api/health")
def health():
    has_frame = _latest_annotated is not None
    return jsonify({"camera": has_frame, "ai": _tracker is not None})

# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("🚀 [Camera+AI Server] กำลังรันบน Port 5000...")
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
