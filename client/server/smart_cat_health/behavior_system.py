import os
import json
from collections import deque
from datetime import datetime

import cv2

try:
    import torch
    import torch.nn as nn
    from torchvision import models, transforms
    from PIL import Image
    TORCH_OK = True
except ImportError:
    TORCH_OK = False
    torch = None
    nn = None
    models = None
    transforms = None
    Image = None


ABNORMAL_BEHAVIORS = {"head_pressing", "vomiting"}


def build_behavior_model(num_classes=6):
    model = models.efficientnet_b0(weights=None)
    in_features = model.classifier[1].in_features
    model.classifier = nn.Sequential(
        nn.Dropout(p=0.3),
        nn.Linear(in_features, 512),
        nn.ReLU(),
        nn.BatchNorm1d(512),
        nn.Dropout(p=0.2),
        nn.Linear(512, 256),
        nn.ReLU(),
        nn.Dropout(p=0.1),
        nn.Linear(256, num_classes),
    )
    return model


class BehaviorSystem:
    def __init__(self, model_path=None, class_mapping_path=None):
        self.model = None
        self.class_names = ["eating", "grooming", "head_pressing", "resting", "toileting", "vomiting"]
        self.image_size = 256
        self.SMOOTHING_WINDOW = 15
        self.MIN_CONFIDENCE = 0.40
        self.ABNORMAL_CONFIDENCE = 0.70
        self.ABNORMAL_STREAK_NEEDED = 4
        self.ABNORMAL_CONFIDENCE_BY_LABEL = {
            "vomiting": 0.45,
            "head_pressing": self.ABNORMAL_CONFIDENCE,
        }
        self.ABNORMAL_STREAK_BY_LABEL = {
            "vomiting": 1,
            "head_pressing": self.ABNORMAL_STREAK_NEEDED,
        }
        self.FALLBACK_BEHAVIOR = "active"
        self.behavior_history = {}
        self.abnormal_streak = {}
        self.snapshot_folder = "snapshots"
        os.makedirs(self.snapshot_folder, exist_ok=True)

        if class_mapping_path and os.path.exists(class_mapping_path):
            with open(class_mapping_path, "r", encoding="utf-8") as f:
                mapping = json.load(f)
            self.class_names = mapping.get("classes", self.class_names)
            self.image_size = mapping.get("image_size", self.image_size)

        if not TORCH_OK:
            return

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.preprocess = transforms.Compose([
            transforms.Resize((self.image_size, self.image_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])
        if model_path and os.path.exists(model_path):
            try:
                model = build_behavior_model(num_classes=len(self.class_names))
                state_dict = torch.load(model_path, map_location=self.device, weights_only=True)
                model.load_state_dict(state_dict)
                model.to(self.device)
                model.eval()
                self.model = model
            except Exception:
                self.model = None

    def _classify_single(self, crop_bgr):
        if self.model is None or not TORCH_OK:
            return "unknown", 0.0
        try:
            crop_rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(crop_rgb)
            tensor = self.preprocess(pil_img).unsqueeze(0).to(self.device)
            with torch.no_grad():
                out = self.model(tensor)
                probs = torch.softmax(out, dim=1)[0]
            conf, pred = probs.max(0)
            idx = pred.item()
            label = self.class_names[idx] if idx < len(self.class_names) else f"class_{idx}"
            return label, float(conf.item())
        except Exception:
            return "error", 0.0

    def _update_abnormal_streak(self, track_id, raw_label, raw_conf):
        if track_id not in self.abnormal_streak:
            self.abnormal_streak[track_id] = {}
        streak = self.abnormal_streak[track_id]
        if raw_label in ABNORMAL_BEHAVIORS:
            min_conf = self.ABNORMAL_CONFIDENCE_BY_LABEL.get(raw_label, self.ABNORMAL_CONFIDENCE)
            if raw_conf >= min_conf:
                streak[raw_label] = streak.get(raw_label, 0) + 1
                for lbl in list(streak.keys()):
                    if lbl != raw_label:
                        streak[lbl] = 0
            else:
                streak[raw_label] = 0
        else:
            for lbl in streak:
                streak[lbl] = 0

    def classify_behavior(self, crop_bgr, track_id=None):
        raw_label, raw_conf = self._classify_single(crop_bgr)
        if track_id is None:
            if raw_conf < self.MIN_CONFIDENCE:
                return self.FALLBACK_BEHAVIOR, raw_conf
            if raw_label in ABNORMAL_BEHAVIORS and raw_conf < self.ABNORMAL_CONFIDENCE:
                return self.FALLBACK_BEHAVIOR, raw_conf
            return raw_label, raw_conf

        self._update_abnormal_streak(track_id, raw_label, raw_conf)
        if track_id not in self.behavior_history:
            self.behavior_history[track_id] = deque(maxlen=self.SMOOTHING_WINDOW)
        self.behavior_history[track_id].append((raw_label, raw_conf))
        history = self.behavior_history[track_id]

        vote_weights = {}
        for label, conf in history:
            if label in ("unknown", "error"):
                continue
            vote_weights[label] = vote_weights.get(label, 0.0) + conf
        if not vote_weights:
            return self.FALLBACK_BEHAVIOR, 0.0

        # Abnormal override: if a recent abnormal signal is strong enough, surface it
        for abnormal_label in ABNORMAL_BEHAVIORS:
            min_conf = self.ABNORMAL_CONFIDENCE_BY_LABEL.get(abnormal_label, self.ABNORMAL_CONFIDENCE)
            min_streak = self.ABNORMAL_STREAK_BY_LABEL.get(abnormal_label, self.ABNORMAL_STREAK_NEEDED)
            recent_hits = [conf for label, conf in history if label == abnormal_label and conf >= min_conf]
            streak_count = self.abnormal_streak.get(track_id, {}).get(abnormal_label, 0)
            if len(recent_hits) >= min_streak or streak_count >= min_streak:
                avg_conf = sum(recent_hits) / len(recent_hits) if recent_hits else 0.0
                return abnormal_label, avg_conf

        sorted_labels = sorted(vote_weights.items(), key=lambda x: x[1], reverse=True)
        best_label = sorted_labels[0][0]
        confs = [c for l, c in history if l == best_label]
        avg_conf = sum(confs) / len(confs) if confs else 0.0
        if avg_conf < self.MIN_CONFIDENCE:
            return self.FALLBACK_BEHAVIOR, avg_conf

        if best_label in ABNORMAL_BEHAVIORS:
            streak_count = self.abnormal_streak.get(track_id, {}).get(best_label, 0)
            min_conf = self.ABNORMAL_CONFIDENCE_BY_LABEL.get(best_label, self.ABNORMAL_CONFIDENCE)
            min_streak = self.ABNORMAL_STREAK_BY_LABEL.get(best_label, self.ABNORMAL_STREAK_NEEDED)
            if avg_conf < min_conf or streak_count < min_streak:
                return self.FALLBACK_BEHAVIOR, avg_conf
        return best_label, avg_conf

    def cleanup_track(self, track_id):
        self.behavior_history.pop(track_id, None)
        self.abnormal_streak.pop(track_id, None)

    def is_abnormal(self, label):
        return label in ABNORMAL_BEHAVIORS

    def create_snapshot(self, frame, bbox, cat_id, behavior_label="unknown", confidence=0.0, event_type="monitor"):
        x1, y1, x2, y2 = map(int, bbox)
        h, w = frame.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            return None
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        folder = os.path.join(self.snapshot_folder, cat_id)
        os.makedirs(folder, exist_ok=True)
        filename = f"{event_type}_{behavior_label}_{ts}.jpg"
        path = os.path.join(folder, filename)
        cv2.imwrite(path, crop)
        return path

