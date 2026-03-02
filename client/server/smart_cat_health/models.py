import cv2
import numpy as np

try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None


class CatTracker:
    """YOLO tracker wrapper that returns simple tracked objects."""

    def __init__(self, model_path="yolov8n.pt", conf=0.45):
        self.conf = conf
        self.model = YOLO(model_path) if YOLO else None
        self.cat_class_id = None
        if self.model and hasattr(self.model, "names"):
            for k, v in self.model.names.items():
                if v == "cat":
                    self.cat_class_id = k
                    break

    def update(self, frame):
        if self.model is None:
            return []

        kwargs = {"persist": True, "verbose": False, "conf": self.conf}
        if self.cat_class_id is not None:
            kwargs["classes"] = [self.cat_class_id]

        results = self.model.track(frame, **kwargs)
        boxes = getattr(results[0].boxes, "xyxy", None)
        ids = getattr(results[0].boxes, "id", None)
        if boxes is None or ids is None:
            return []

        out = []
        for box, track_id in zip(boxes.cpu().numpy(), ids.cpu().numpy()):
            obj = type("TrackedObject", (object,), {})()
            obj.bbox = box
            obj.track_id = int(track_id)
            out.append(obj)
        return out

