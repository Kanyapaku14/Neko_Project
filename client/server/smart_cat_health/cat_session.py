import os
import json
import time
import math
from datetime import datetime


class CatSessionManager:
    REUSE_TIMEOUT = 60.0
    BBOX_MATCH_DIST_MAX = 200
    MAX_CATS = 6
    LOST_TRACK_TIMEOUT = 15

    def __init__(self, session_dir="sessions", max_cats=None):
        self.track_to_cat = {}
        self.cats = {}
        self.lost_pool = set()
        self._next_cat_num = 1
        self.session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.session_start = time.time()
        self.session_dir = session_dir
        if max_cats is not None:
            self.MAX_CATS = max_cats
        os.makedirs(session_dir, exist_ok=True)

    @staticmethod
    def _bbox_center(bbox):
        x1, y1, x2, y2 = bbox
        return ((x1 + x2) / 2, (y1 + y2) / 2)

    @staticmethod
    def _bbox_distance(bbox1, bbox2):
        c1 = CatSessionManager._bbox_center(bbox1)
        c2 = CatSessionManager._bbox_center(bbox2)
        return math.sqrt((c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2)

    def get_cat_id(self, track_id, bbox=None):
        if track_id in self.track_to_cat:
            return self.track_to_cat[track_id]

        reuse_id = self._try_reuse(bbox)
        if reuse_id:
            self.track_to_cat[track_id] = reuse_id
            self.cats[reuse_id]["track_ids"].append(track_id)
            self.lost_pool.discard(reuse_id)
            return reuse_id

        if len(self.cats) >= self.MAX_CATS:
            closest = self._find_closest_cat(bbox)
            if closest:
                self.track_to_cat[track_id] = closest
                self.cats[closest]["track_ids"].append(track_id)
                self.lost_pool.discard(closest)
                return closest

        cat_id = f"CAT{self._next_cat_num:03d}"
        self._next_cat_num += 1
        self.track_to_cat[track_id] = cat_id
        self.cats[cat_id] = {
            "cat_id": cat_id,
            "track_ids": [track_id],
            "first_seen": time.time(),
            "last_seen": time.time(),
            "last_bbox": bbox,
            "current_behavior": "unknown",
            "current_confidence": 0.0,
            "behavior_counts": {},
            "abnormal_count": 0,
            "snapshot_cooldown": 0,
            "previous_behavior": None,
        }
        return cat_id

    def _try_reuse(self, bbox):
        if not self.lost_pool or bbox is None:
            return None
        now = time.time()
        best_id = None
        best_score = float("inf")
        for cat_id in list(self.lost_pool):
            cat = self.cats.get(cat_id)
            if not cat or not cat.get("last_bbox"):
                continue
            if (now - cat["last_seen"]) > self.REUSE_TIMEOUT:
                continue
            dist = self._bbox_distance(bbox, cat["last_bbox"])
            if dist > self.BBOX_MATCH_DIST_MAX:
                continue
            score = dist + (now - cat["last_seen"]) * 5
            if score < best_score:
                best_score = score
                best_id = cat_id
        return best_id

    def _find_closest_cat(self, bbox):
        if bbox is None:
            return None
        best_cat = None
        best_dist = float("inf")
        for cat_id, cat in self.cats.items():
            last_bbox = cat.get("last_bbox")
            if not last_bbox:
                continue
            dist = self._bbox_distance(bbox, last_bbox)
            if dist < best_dist:
                best_dist = dist
                best_cat = cat_id
        return best_cat

    def get_cat_data(self, cat_id):
        return self.cats.get(cat_id)

    def update_seen(self, cat_id, bbox=None):
        cat = self.cats.get(cat_id)
        if not cat:
            return
        cat["last_seen"] = time.time()
        if bbox is not None:
            cat["last_bbox"] = bbox

    def update_behavior(self, cat_id, behavior, confidence):
        cat = self.cats.get(cat_id)
        if not cat:
            return
        previous = cat["previous_behavior"]
        cat["current_behavior"] = behavior
        cat["current_confidence"] = confidence
        if behavior != previous:
            cat["behavior_counts"][behavior] = cat["behavior_counts"].get(behavior, 0) + 1
        cat["previous_behavior"] = behavior

    def increment_abnormal(self, cat_id):
        cat = self.cats.get(cat_id)
        if cat:
            cat["abnormal_count"] += 1

    def can_snapshot(self, cat_id, current_time):
        cat = self.cats.get(cat_id)
        return bool(cat and current_time > cat["snapshot_cooldown"])

    def set_snapshot_cooldown(self, cat_id, current_time, cooldown_seconds):
        cat = self.cats.get(cat_id)
        if cat:
            cat["snapshot_cooldown"] = current_time + cooldown_seconds

    def remove_track(self, track_id):
        cat_id = self.track_to_cat.pop(track_id, None)
        if cat_id:
            self.lost_pool.add(cat_id)

    def get_lost_tracks(self, current_time, timeout=None):
        timeout = timeout or self.LOST_TRACK_TIMEOUT
        lost = []
        for track_id, cat_id in self.track_to_cat.items():
            cat = self.cats.get(cat_id)
            if cat and (current_time - cat["last_seen"]) > timeout:
                lost.append(track_id)
        return lost

    def cleanup_expired_pool(self, current_time):
        expired = set()
        for cat_id in self.lost_pool:
            cat = self.cats.get(cat_id)
            if cat and (current_time - cat["last_seen"]) > self.REUSE_TIMEOUT:
                expired.add(cat_id)
        self.lost_pool -= expired

    @property
    def active_cats(self):
        return len(self.track_to_cat)

    @property
    def total_cats(self):
        return len(self.cats)

    def save_session(self, path=None):
        if path is None:
            path = os.path.join(self.session_dir, f"session_{self.session_id}.json")
        payload = {
            "session_id": self.session_id,
            "session_duration_seconds": round(time.time() - self.session_start, 1),
            "total_cats_detected": self.total_cats,
            "cats": list(self.cats.values()),
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
        return path

