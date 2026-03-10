import cv2
import numpy as np

try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None


class CatTracker:
    """YOLO tracker wrapper that returns simple tracked objects.

    Always restricts detection to cat class only:
    - Searches model.names for any key whose value matches "cat" (case-insensitive)
    - Falls back to class 0 when no "cat" label found (custom single-class models)
    """

    def __init__(self, model_path="yolov8n.pt", conf=0.45):
        self.conf = conf
        self.model = YOLO(model_path) if YOLO else None
        self.cat_class_id = None

        if self.model and hasattr(self.model, "names"):
            names = self.model.names  # {int: str}
            print(f"[CatTracker] model classes: {names}")

            # 1️⃣ หาชื่อ "cat" แบบ case-insensitive
            for k, v in names.items():
                if str(v).strip().lower() == "cat":
                    self.cat_class_id = k
                    break

            # 2️⃣ ถ้าไม่เจอ (custom model ที่เทรนแค่แมวอย่างเดียว) → ใช้ class 0
            if self.cat_class_id is None:
                self.cat_class_id = 0
                print(
                    "[CatTracker] ไม่พบ class ชื่อ 'cat' ใน model → "
                    "ใช้ class 0 แทน (custom single-class model)"
                )
            else:
                print(f"[CatTracker] ใช้ class id={self.cat_class_id} (cat) เท่านั้น")

    def update(self, frame):
        if self.model is None:
            return []

        # บังคับ filter เฉพาะ class แมว — ไม่จับคน/วัตถุอื่น
        kwargs = {
            "persist": True,
            "verbose": False,
            "conf": self.conf,
            "classes": [self.cat_class_id],  # 🐱 แมวเท่านั้น
        }

        results = self.model.track(frame, **kwargs)
        boxes = getattr(results[0].boxes, "xyxy", None)
        ids   = getattr(results[0].boxes, "id",  None)
        if boxes is None or ids is None:
            return []

        out = []
        for box, track_id in zip(boxes.cpu().numpy(), ids.cpu().numpy()):
            obj = type("TrackedObject", (object,), {})()
            obj.bbox = box
            obj.track_id = int(track_id)
            out.append(obj)
        return out

