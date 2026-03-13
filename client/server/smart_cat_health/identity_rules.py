"""
identity_rules.py

Cat Identity Resolution Engine — Rules 8-21
==============================================
Layer 0: Pre-filter  (Rules 17, 18, 19, 20, 21)
Layer 1: Identity Resolution  (Rules 8, 9, 12, 10, 11, 1, 14/15, 2, 16, 6, 3, 5, 4, 7)

Priority order (highest first):
  Rule 8  — No cats registered → skip all
  Rule 7  — Abnormal behavior → ALWAYS popup (override every other rule)
  Rule 9  — Track ID persistence (track cache, 20s window)
  Rule 12 — Session identity lock (first confident ID locks the session)
  Rule 10 — Temporal smoothing (sliding window vote, last 10 frames)
  Rule 11 — Motion path identity (cross-zone continuity, 60s)
  Rule 1  — Single-cat auto-resolve
  Rule 14 — Single-cat + extra detections → foreign cat logic
  Rule 15 — Foreign cat alert (1 popup/session)
  Rule 2  — High confidence auto-resolve (≥ 0.85)
  Rule 16 — Session dominance (longest track wins)
  Rule 6  — Zone cooldown (recent same-zone identity)
  Rule 3  — Zone context (only 1 cat in zone)
  Rule 5  — Eating session vote (≥ 60%)
  Rule 4  — Litter session popup (accumulated snapshots)
"""

import time
import math
from collections import deque, defaultdict
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Tuple

# ── Constants ────────────────────────────────────────────────────────────────

# Layer 0 — Pre-filter
CAT_PRESENCE_THRESHOLD      = 0.45   # Rule 17 (same as MIN_DETECTION_CONF)
MIN_BBOX_AREA               = 3000   # Rule 18 (same as existing main.py constant)
TEMPORAL_PERSISTENCE_FRAMES = 3      # Rule 19: min consecutive frames to trust a track
MIN_MOVEMENT_PX             = 5      # Rule 20: min pixel movement to count as "moved"
DUPLICATE_IOU_THRESH        = 0.60   # Rule 21: IoU threshold for duplicate merge

# Layer 1 — Identity Resolution
TRACK_MEMORY_TIMEOUT        = 20.0   # Rule 9:  seconds to remember track→cat mapping
TEMPORAL_WINDOW             = 10     # Rule 10: sliding window frame count
IDENTITY_MIN_CONF           = 0.40   # Rule 12: minimum confidence to lock session
SESSION_LOCK_ENABLED        = True   # Rule 12: enable/disable session locking
MOTION_PATH_TIMEOUT         = 60.0   # Rule 11: max seconds to carry identity across zones
IDENTITY_AUTO_RESOLVE_CONF  = 0.85   # Rule 2:  high-confidence auto-resolve threshold
SESSION_VOTE_THRESHOLD      = 0.60   # Rule 5:  eat session vote majority threshold
SESSION_MAX_SNAPSHOTS       = 5      # Rule 4:  max snapshots accumulated per litter session
SESSION_SNAPSHOT_INTERVAL_SEC = 5.0 # Rule 4:  interval between snapshots in litter session
IDENTITY_ZONE_COOLDOWN_SEC  = {      # Rule 6:  per-zone cooldown after last resolve
    "litter":   300.0,
    "eat":      120.0,
    "sleep":    600.0,
    "activity": 180.0,
}
ABNORMAL_BEHAVIORS = {"vomiting", "head_pressing", "abnormal"}  # Rule 7 trigger set


# ── Layer 0: Pre-filter Helpers ───────────────────────────────────────────────

def passes_presence_filter(detection_conf: float) -> bool:
    """Rule 17 — Cat presence validation."""
    return detection_conf >= CAT_PRESENCE_THRESHOLD


def passes_size_filter(bbox) -> bool:
    """Rule 18 — Minimum bounding box area."""
    x1, y1, x2, y2 = bbox
    return (x2 - x1) * (y2 - y1) >= MIN_BBOX_AREA


def _compute_iou(b1, b2) -> float:
    """Intersection-over-Union between two bboxes [x1,y1,x2,y2]."""
    ix1 = max(b1[0], b2[0])
    iy1 = max(b1[1], b2[1])
    ix2 = min(b1[2], b2[2])
    iy2 = min(b1[3], b2[3])
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    a1 = (b1[2] - b1[0]) * (b1[3] - b1[1])
    a2 = (b2[2] - b2[0]) * (b2[3] - b2[1])
    union = a1 + a2 - inter
    return inter / union if union > 0 else 0.0


def _bbox_center(bbox):
    x1, y1, x2, y2 = bbox
    return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)


class TrackFrameCounter:
    """
    Rule 19 — Temporal Persistence (Ghost Filter).
    Tracks how many consecutive frames a track_id has been seen.
    Resets to 0 when a track disappears.
    """
    def __init__(self):
        self._counts: Dict[int, int] = {}

    def update(self, track_id: int) -> int:
        """Increment counter. Returns new count."""
        self._counts[track_id] = self._counts.get(track_id, 0) + 1
        return self._counts[track_id]

    def remove(self, track_id: int):
        self._counts.pop(track_id, None)

    def passes(self, track_id: int) -> bool:
        """Rule 19: True if track has been seen enough consecutive frames."""
        return self._counts.get(track_id, 0) >= TEMPORAL_PERSISTENCE_FRAMES


class DuplicateDetectionMerger:
    """
    Rule 21 — Duplicate Detection Merge.
    For a set of (track_id, bbox) in one frame, merges pairs whose IoU > threshold.
    Keeps the track_id with longer history (lower track_id ~ older = preferred).
    """
    @staticmethod
    def merge(tracks: List[Tuple[int, list]]) -> List[Tuple[int, list]]:
        """
        tracks: list of (track_id, bbox)
        Returns deduplicated list. Merged track_id = the older (lower) track_id.
        """
        if len(tracks) < 2:
            return tracks
        to_remove = set()
        remap: Dict[int, int] = {}  # new_track_id → kept_track_id
        track_list = list(tracks)
        for i in range(len(track_list)):
            for j in range(i + 1, len(track_list)):
                tid_i, bbox_i = track_list[i]
                tid_j, bbox_j = track_list[j]
                if tid_i in to_remove or tid_j in to_remove:
                    continue
                if _compute_iou(bbox_i, bbox_j) >= DUPLICATE_IOU_THRESH:
                    # Keep older (lower numeric id) track
                    keep = min(tid_i, tid_j)
                    drop = max(tid_i, tid_j)
                    to_remove.add(drop)
                    remap[drop] = keep
        result = [(remap.get(tid, tid), bbox) for tid, bbox in track_list if tid not in to_remove]
        return result


class MovementTracker:
    """
    Rule 20 — Movement Check.
    Tracks the last known center per track_id to compute movement distance.
    """
    def __init__(self):
        self._last_center: Dict[int, Tuple[float, float]] = {}

    def update(self, track_id: int, bbox) -> float:
        """Returns movement distance since last frame (pixels). Updates center."""
        cx, cy = _bbox_center(bbox)
        if track_id not in self._last_center:
            self._last_center[track_id] = (cx, cy)
            return 0.0
        lx, ly = self._last_center[track_id]
        dist = math.sqrt((cx - lx) ** 2 + (cy - ly) ** 2)
        self._last_center[track_id] = (cx, cy)
        return dist

    def remove(self, track_id: int):
        self._last_center.pop(track_id, None)

    def has_moved(self, track_id: int, bbox) -> bool:
        """
        Rule 20: Returns True if the cat has moved enough.
        Note: we still allow identity resolution even if cat hasn't moved.
        This flag is used to gate behavior event commits (not identity).
        """
        cx, cy = _bbox_center(bbox)
        if track_id not in self._last_center:
            return False
        lx, ly = self._last_center[track_id]
        return math.sqrt((cx - lx) ** 2 + (cy - ly) ** 2) >= MIN_MOVEMENT_PX


# ── Layer 1: Identity Resolution Classes ─────────────────────────────────────

class TrackIdentityCache:
    """
    Rule 9 — Track ID Persistence.
    Remembers resolved cat_id per track_id for up to TRACK_MEMORY_TIMEOUT seconds.
    Updated whenever any rule successfully resolves an identity.
    """
    def __init__(self):
        self._cache: Dict[int, dict] = {}

    def set(self, track_id: int, cat_id: str, resolved_by: str = "rule"):
        """Record a resolved identity for a track."""
        self._cache[track_id] = {
            "cat_id": cat_id,
            "resolved_at": time.time(),
            "resolved_by": resolved_by,
        }

    def get(self, track_id: int) -> Optional[str]:
        """Rule 9: Return cached cat_id if still within timeout, else None."""
        entry = self._cache.get(track_id)
        if not entry:
            return None
        age = time.time() - entry["resolved_at"]
        if age <= TRACK_MEMORY_TIMEOUT:
            return entry["cat_id"]
        del self._cache[track_id]
        return None

    def remove(self, track_id: int):
        self._cache.pop(track_id, None)

    def invalidate_cat(self, cat_id: str):
        """Invalidate all entries for a given cat_id (e.g., after skip)."""
        to_del = [tid for tid, e in self._cache.items() if e["cat_id"] == cat_id]
        for tid in to_del:
            del self._cache[tid]


class TrackSlidingVote:
    """
    Rule 10 — Temporal Smoothing (Sliding Window Vote).
    Maintains a sliding window of the last TEMPORAL_WINDOW classification cat_ids per track.
    Returns the most frequent cat_id in the window.
    """
    def __init__(self):
        self._windows: Dict[int, deque] = {}

    def add_vote(self, track_id: int, cat_id: Optional[str]):
        if cat_id is None:
            return
        if track_id not in self._windows:
            self._windows[track_id] = deque(maxlen=TEMPORAL_WINDOW)
        self._windows[track_id].append(cat_id)

    def get_winner(self, track_id: int) -> Optional[str]:
        """Rule 10: Return most frequent cat_id from sliding window, or None if empty."""
        window = self._windows.get(track_id)
        if not window:
            return None
        counts: Dict[str, int] = {}
        for cid in window:
            counts[cid] = counts.get(cid, 0) + 1
        return max(counts, key=counts.get)

    def remove(self, track_id: int):
        self._windows.pop(track_id, None)


class MotionPathIdentity:
    """
    Rule 11 — Motion Path Identity (Cross-Zone Continuity).
    Cats don't teleport — carry the same identity as the track moves across zones.
    Stores (cat_id, zone_type, timestamp) per track_id.
    """
    def __init__(self):
        self._path: Dict[int, dict] = {}

    def update(self, track_id: int, cat_id: str, zone_type: Optional[str]):
        self._path[track_id] = {
            "cat_id": cat_id,
            "zone_type": zone_type,
            "last_seen": time.time(),
        }

    def get(self, track_id: int) -> Optional[str]:
        """Rule 11: Return cat_id from motion path if within timeout."""
        entry = self._path.get(track_id)
        if not entry:
            return None
        age = time.time() - entry["last_seen"]
        return entry["cat_id"] if age <= MOTION_PATH_TIMEOUT else None

    def remove(self, track_id: int):
        self._path.pop(track_id, None)


class SessionIdentityLock:
    """
    Rule 12 — Session Identity Lock.
    Once the first confident identity is established in a session,
    lock that cat_id for the entire session duration.
    """
    def __init__(self):
        self._locks: Dict[str, str] = {}  # session_id → cat_id

    def try_lock(self, session_id: str, cat_id: str, confidence: float) -> bool:
        """
        Attempt to lock session to cat_id.
        Returns True if lock is now set (new or already matching).
        """
        if not SESSION_LOCK_ENABLED or not session_id:
            return False
        if session_id in self._locks:
            return True  # already locked
        if confidence >= IDENTITY_MIN_CONF and cat_id:
            self._locks[session_id] = cat_id
            return True
        return False

    def get(self, session_id: str) -> Optional[str]:
        """Rule 12: Return locked cat_id for session or None."""
        return self._locks.get(session_id) if session_id else None

    def release(self, session_id: str):
        self._locks.pop(session_id, None)


class ZoneIdentityCache:
    """
    Rule 6 — Recent Session Memory (Zone Cooldown).
    Caches the last resolved cat_id per zone_type with a per-zone cooldown.
    """
    def __init__(self):
        self._cache: Dict[str, dict] = {}  # zone_type → {cat_id, resolved_at}

    def set(self, zone_type: str, cat_id: str):
        if zone_type:
            self._cache[zone_type] = {"cat_id": cat_id, "resolved_at": time.time()}

    def get(self, zone_type: Optional[str]) -> Optional[str]:
        """Rule 6: Return cached cat_id if within cooldown window."""
        if not zone_type:
            return None
        entry = self._cache.get(zone_type)
        if not entry:
            return None
        cooldown = IDENTITY_ZONE_COOLDOWN_SEC.get(zone_type, 120.0)
        age = time.time() - entry["resolved_at"]
        return entry["cat_id"] if age <= cooldown else None


@dataclass
class SessionSnapshot:
    path: str
    cat_id: Optional[str]
    taken_at: float = field(default_factory=time.time)
    count: int = 0  # vote count for this cat at snapshot time


class SessionIdentityTracker:
    """
    Rules 4 & 5 — Litter/Eat Session Accumulation.
    Collects snapshots and cat_id votes during a zone session.
    Provides vote result and snapshot list on session end.
    """
    def __init__(self, zone_type: str):
        self.zone_type = zone_type
        self._votes: Dict[str, int] = {}   # cat_id → vote count
        self._snapshots: List[SessionSnapshot] = []
        self._last_snapshot_at: float = 0.0
        self._session_start: float = time.time()
        self._longest_track: Dict[str, float] = {}  # cat_id → total active seconds

    def add_vote(self, cat_id: Optional[str], confidence: float, snapshot_path: Optional[str] = None):
        """Record a classification vote and optionally a snapshot."""
        if cat_id:
            self._votes[cat_id] = self._votes.get(cat_id, 0) + 1
        current_count = self._votes.get(cat_id, 0) if cat_id else 0

        now = time.time()
        if (snapshot_path
                and len(self._snapshots) < SESSION_MAX_SNAPSHOTS
                and (now - self._last_snapshot_at) >= SESSION_SNAPSHOT_INTERVAL_SEC):
            self._snapshots.append(SessionSnapshot(path=snapshot_path, cat_id=cat_id, taken_at=now, count=current_count))
            self._last_snapshot_at = now

    def add_track_time(self, cat_id: Optional[str], seconds: float):
        """Rule 16: Record presence time for session dominance."""
        if cat_id:
            self._longest_track[cat_id] = self._longest_track.get(cat_id, 0.0) + seconds

    def get_vote_winner(self) -> Tuple[Optional[str], float]:
        """
        Rules 5 & 16: Return (winner_cat_id, vote_fraction) using majority vote.
        Falls back to longest-track winner (Rule 16) if no clear majority.
        """
        total = sum(self._votes.values())
        if total == 0:
            # Rule 16 fallback
            if self._longest_track:
                winner = sorted(self._longest_track.items(), key=lambda x: (-x[1], x[0]))[0][0]
                return winner, 1.0
            return None, 0.0
        sorted_votes = sorted(self._votes.items(), key=lambda x: x[1], reverse=True)
        top_cat, top_count = sorted_votes[0]
        top_tied = [cid for cid, cnt in sorted_votes if cnt == top_count]
        fraction = top_count / total
        # If there is a tie for top count, force user confirmation.
        if len(top_tied) > 1:
            return top_cat, fraction
        if fraction >= SESSION_VOTE_THRESHOLD:
            return top_cat, fraction
        # Rule 16 fallback: longest track wins if vote inconclusive
        if self._longest_track:
            winner = sorted(self._longest_track.items(), key=lambda x: (-x[1], x[0]))[0][0]
            return winner, fraction  # fraction < threshold → triggers popup in caller
        return None, fraction

    def get_snapshots(self) -> List[dict]:
        """Return enriched snapshot list: [{path, cat_id, count}] for frontend display."""
        return [
            {"path": s.path, "cat_id": s.cat_id, "count": s.count}
            for s in self._snapshots
        ]

    def get_cat_vote_counts(self) -> Dict[str, int]:
        """Return vote counts per cat for frontend badge display: {cat_id: count}"""
        return dict(self._votes)

    def total_votes(self) -> int:
        return sum(self._votes.values())


class ForeignCatSessionTracker:
    """
    Rules 14 & 15 — Single-cat camera, multiple detections.
    Tracks whether a foreign-cat alert has been sent for this session.
    """
    def __init__(self):
        self._alerted: set = set()   # session_ids that already had an alert

    def should_alert(self, session_id: str) -> bool:
        """True on first occurrence per session."""
        if session_id in self._alerted:
            return False
        self._alerted.add(session_id)
        return True

    def reset(self, session_id: str):
        self._alerted.discard(session_id)


# ── Resolution Result ─────────────────────────────────────────────────────────

@dataclass
class IdentityResolution:
    cat_id: Optional[str]          # resolved UUID or None
    should_popup: bool             # whether to create identity_review row (pending)
    multi_snapshots: List[str]     # paths for session-end multi-snapshot popup
    resolved_by: str               # which rule resolved: "rule_9", "rule_1", etc.
    is_foreign_cat_alert: bool     # Rule 15: popup needs [my cat]/[other] UI
    auto_resolved: bool            # True if no user input required


# ── Main Resolution Engine ────────────────────────────────────────────────────

class IdentityRuleEngine:
    """
    Central engine that runs all 21 rules per detection.
    Instantiate once per camera pipeline run.
    """
    def __init__(self, known_cat_ids: List[str]):
        self.known_cat_ids = [str(c) for c in known_cat_ids if c]
        self.n_known = len(self.known_cat_ids)

        # Layer 0
        self.frame_counter    = TrackFrameCounter()
        self.movement_tracker = MovementTracker()
        self.merger           = DuplicateDetectionMerger()

        # Layer 1
        self.track_cache      = TrackIdentityCache()
        self.sliding_vote     = TrackSlidingVote()
        self.motion_path      = MotionPathIdentity()
        self.session_lock     = SessionIdentityLock()
        self.zone_cache       = ZoneIdentityCache()
        self.foreign_tracker  = ForeignCatSessionTracker()

        # Active session trackers per (zone_type, session_id)
        self._session_trackers: Dict[Tuple[str, str], SessionIdentityTracker] = {}

    # ── Layer 0: Pre-filter ──────────────────────────────────────────────────

    def prefilter_passes(
        self,
        track_id: int,
        bbox,
        detection_conf: float,
    ) -> bool:
        """
        Rules 17, 18, 19: Determine if this detection should enter the pipeline.
        Rule 20 is separate (movement gate on event commit, not identity).
        Note: Rule 21 (merge) is applied at frame level before calling this.
        """
        if not passes_presence_filter(detection_conf):
            return False  # Rule 17
        if not passes_size_filter(bbox):
            return False  # Rule 18
        count = self.frame_counter.update(track_id)
        if count < TEMPORAL_PERSISTENCE_FRAMES:
            return False  # Rule 19
        return True

    def merge_duplicates(self, tracks: List[Tuple[int, list]]) -> List[Tuple[int, list]]:
        """Rule 21: Merge overlapping bboxes in a frame."""
        return self.merger.merge(tracks)

    def has_moved(self, track_id: int, bbox) -> bool:
        """Rule 20: Check whether track has moved enough for behavior event."""
        return self.movement_tracker.has_moved(track_id, bbox)

    def update_movement(self, track_id: int, bbox):
        self.movement_tracker.update(track_id, bbox)

    # ── Layer 1: Identity Resolution ─────────────────────────────────────────

    def resolve(
        self,
        *,
        track_id: int,
        bbox,
        confidence: float,
        behavior: str,
        zone_type: Optional[str],
        session_id: str,
        detected_count: int,
        snapshot_path: Optional[str] = None,
        session_ended: bool = False,
    ) -> IdentityResolution:
        """
        Run all identity rules in priority order.
        Returns an IdentityResolution describing what to do.

        Call `on_track_lost()` when a track disappears.
        Call `on_session_end()` when a zone session closes.
        """

        # ── Rule 8: No cats registered ──────────────────────────────────────
        if self.n_known == 0:
            return IdentityResolution(
                cat_id=None, should_popup=False,
                multi_snapshots=[], resolved_by="rule_8",
                is_foreign_cat_alert=False, auto_resolved=True,
            )

        is_abnormal = behavior in ABNORMAL_BEHAVIORS

        # ── Rule 7: Abnormal always asks (override) ──────────────────────────
        if is_abnormal:
            # Still try to give a best-guess cat_id from cache to pre-fill the picker
            hint = self.track_cache.get(track_id) or self.session_lock.get(session_id)
            return IdentityResolution(
                cat_id=hint, should_popup=True,
                multi_snapshots=[snapshot_path] if snapshot_path else [],
                resolved_by="rule_7",
                is_foreign_cat_alert=False, auto_resolved=False,
            )

        # ── Rule 9: Track ID persistence ────────────────────────────────────
        cached = self.track_cache.get(track_id)
        if cached:
            self._update_session_vote(zone_type, session_id, cached, confidence, snapshot_path, session_ended)
            self.motion_path.update(track_id, cached, zone_type)
            return IdentityResolution(
                cat_id=cached, should_popup=False,
                multi_snapshots=[], resolved_by="rule_9",
                is_foreign_cat_alert=False, auto_resolved=True,
            )

        # ── Rule 12: Session identity lock ───────────────────────────────────
        locked = self.session_lock.get(session_id)
        if locked:
            self.track_cache.set(track_id, locked, "rule_12")
            self._update_session_vote(zone_type, session_id, locked, confidence, snapshot_path, session_ended)
            self.motion_path.update(track_id, locked, zone_type)
            return IdentityResolution(
                cat_id=locked, should_popup=False,
                multi_snapshots=[], resolved_by="rule_12",
                is_foreign_cat_alert=False, auto_resolved=True,
            )

        # ── Rule 10: Temporal sliding window vote ────────────────────────────
        # (vote is added from the classifier output by caller; winner read here)
        sliding_winner = self.sliding_vote.get_winner(track_id)
        if sliding_winner and sliding_winner in self.known_cat_ids:
            self._commit_resolve(track_id, sliding_winner, confidence, zone_type, session_id, snapshot_path, session_ended, "rule_10")
            return IdentityResolution(
                cat_id=sliding_winner, should_popup=False,
                multi_snapshots=[], resolved_by="rule_10",
                is_foreign_cat_alert=False, auto_resolved=True,
            )

        # ── Rule 11: Motion path identity ────────────────────────────────────
        motion_id = self.motion_path.get(track_id)
        if motion_id and motion_id in self.known_cat_ids:
            self._commit_resolve(track_id, motion_id, confidence, zone_type, session_id, snapshot_path, session_ended, "rule_11")
            return IdentityResolution(
                cat_id=motion_id, should_popup=False,
                multi_snapshots=[], resolved_by="rule_11",
                is_foreign_cat_alert=False, auto_resolved=True,
            )

        # ── Rule 1: Single-cat auto-resolve ──────────────────────────────────
        if self.n_known == 1:
            if detected_count <= 1:
                cat_id = self.known_cat_ids[0]
                self._commit_resolve(track_id, cat_id, confidence, zone_type, session_id, snapshot_path, session_ended, "rule_1")
                return IdentityResolution(
                    cat_id=cat_id, should_popup=False,
                    multi_snapshots=[], resolved_by="rule_1",
                    is_foreign_cat_alert=False, auto_resolved=True,
                )
            else:
                # ── Rule 14/15: Single-cat camera, multiple detections ───────
                primary = self.known_cat_ids[0]
                # Longest track gets primary — use motion path or track cache as proxy
                should_foreign_alert = self.foreign_tracker.should_alert(session_id)
                # Assign primary to this track (longest-running gets it)
                self._commit_resolve(track_id, primary, confidence, zone_type, session_id, snapshot_path, session_ended, "rule_14")
                return IdentityResolution(
                    cat_id=primary, should_popup=should_foreign_alert,
                    multi_snapshots=[snapshot_path] if (should_foreign_alert and snapshot_path) else [],
                    resolved_by="rule_15" if should_foreign_alert else "rule_14",
                    is_foreign_cat_alert=should_foreign_alert,
                    auto_resolved=not should_foreign_alert,
                )

        # ── Rule 2: High confidence auto-resolve ─────────────────────────────
        if confidence >= IDENTITY_AUTO_RESOLVE_CONF:
            # use sliding_winner as best-guess, or fall through if no winner
            best = sliding_winner if sliding_winner in self.known_cat_ids else None
            if best is None and self.n_known == 1:
                best = self.known_cat_ids[0]
            if best:
                self._commit_resolve(track_id, best, confidence, zone_type, session_id, snapshot_path, session_ended, "rule_2")
                return IdentityResolution(
                    cat_id=best, should_popup=False,
                    multi_snapshots=[], resolved_by="rule_2",
                    is_foreign_cat_alert=False, auto_resolved=True,
                )

        # ── Rule 6: Zone cooldown (recent same-zone) ─────────────────────────
        zone_remembered = self.zone_cache.get(zone_type)
        if zone_remembered and zone_remembered in self.known_cat_ids:
            self._commit_resolve(track_id, zone_remembered, confidence, zone_type, session_id, snapshot_path, session_ended, "rule_6")
            return IdentityResolution(
                cat_id=zone_remembered, should_popup=False,
                multi_snapshots=[], resolved_by="rule_6",
                is_foreign_cat_alert=False, auto_resolved=True,
            )

        # ── Rule 3: Zone context (only 1 cat detected in zone right now) ─────
        if detected_count == 1 and zone_type in ("litter", "food", "eat", "bed"):
            # Only 1 cat in this zone — but we don't know which one yet.
            # We'll accumulate and decide at session end (Rules 4/5 below).
            pass

        # ── Accumulate session data for Rules 4/5/16 ─────────────────────────
        self._update_session_vote(zone_type, session_id, None, confidence, snapshot_path, session_ended)

        if session_ended:
            return self._finalize_session(zone_type, session_id, track_id, confidence)

        # ── Still in session, not enough to resolve yet ───────────────────────
        return IdentityResolution(
            cat_id=None, should_popup=False,
            multi_snapshots=[], resolved_by="pending_session",
            is_foreign_cat_alert=False, auto_resolved=False,
        )

    # ── Session Finalization (Rules 4, 5, 16) ────────────────────────────────

    def on_session_end(self, zone_type: Optional[str], session_id: str) -> IdentityResolution:
        """
        Called when a zone session closes (no detection in zone for > timeout).
        Finalizes vote and decides whether to auto-resolve or popup.
        """
        return self._finalize_session(zone_type, session_id, track_id=None, confidence=0.0)

    def _finalize_session(
        self,
        zone_type: Optional[str],
        session_id: str,
        track_id: Optional[int],
        confidence: float,
    ) -> IdentityResolution:
        key = (zone_type, session_id)
        tracker = self._session_trackers.get(key)
        if not tracker:
            return IdentityResolution(
                cat_id=None, should_popup=False,
                multi_snapshots=[], resolved_by="no_session",
                is_foreign_cat_alert=False, auto_resolved=True,
            )

        winner, fraction = tracker.get_vote_winner()
        snapshots = tracker.get_snapshots()
        del self._session_trackers[key]

        if winner and winner in self.known_cat_ids and fraction >= SESSION_VOTE_THRESHOLD:
            # Rule 5 / Rule 16 — majority vote auto-resolve
            if track_id is not None:
                self._commit_resolve(track_id, winner, confidence, zone_type, session_id, None, False, "rule_5")
            return IdentityResolution(
                cat_id=winner, should_popup=False,
                multi_snapshots=[], resolved_by="rule_5",
                is_foreign_cat_alert=False, auto_resolved=True,
            )
        else:
            # Rule 4 — litter popup OR Rule 5 inadequate vote → popup with snapshots
            rule_label = "rule_4" if zone_type == "litter" else "rule_5_popup"
            return IdentityResolution(
                cat_id=winner,  # best guess pre-fill
                should_popup=True,
                multi_snapshots=snapshots,
                resolved_by=rule_label,
                is_foreign_cat_alert=False,
                auto_resolved=False,
            )

    # ── Internal Helpers ──────────────────────────────────────────────────────

    def _commit_resolve(
        self,
        track_id: int,
        cat_id: str,
        confidence: float,
        zone_type: Optional[str],
        session_id: str,
        snapshot_path: Optional[str],
        session_ended: bool,
        rule_label: str,
    ):
        """Update all caches after a successful resolution."""
        self.track_cache.set(track_id, cat_id, rule_label)
        self.motion_path.update(track_id, cat_id, zone_type)
        self.zone_cache.set(zone_type, cat_id)
        self.session_lock.try_lock(session_id, cat_id, confidence)
        self._update_session_vote(zone_type, session_id, cat_id, confidence, snapshot_path, session_ended)

    def _update_session_vote(
        self,
        zone_type: Optional[str],
        session_id: str,
        cat_id: Optional[str],
        confidence: float,
        snapshot_path: Optional[str],
        session_ended: bool,
    ):
        if not zone_type or not session_id:
            return
        key = (zone_type, session_id)
        if key not in self._session_trackers:
            self._session_trackers[key] = SessionIdentityTracker(zone_type)
        self._session_trackers[key].add_vote(cat_id, confidence, snapshot_path)

    def add_sliding_vote(self, track_id: int, cat_id: Optional[str]):
        """Rule 10: Called by main loop after classifier output."""
        if cat_id:
            self.sliding_vote.add_vote(track_id, cat_id)

    def on_user_resolved(self, track_id: Optional[int], cat_id: Optional[str], session_id: Optional[str], zone_type: Optional[str]):
        """
        Called after user picks a cat in the popup.
        Updates all caches. If cat_id is None (skipped), DOES NOT update caches.
        """
        if cat_id is None:
            return  # skip → no cache update (Rule skip handling)
        if track_id is not None:
            self.track_cache.set(track_id, cat_id, "user")
        if zone_type:
            self.zone_cache.set(zone_type, cat_id)
        if session_id:
            self.session_lock.try_lock(session_id, cat_id, confidence=1.0)

    def on_track_lost(self, track_id: int):
        """Call when tracker reports a track as lost."""
        self.frame_counter.remove(track_id)
        self.movement_tracker.remove(track_id)
        self.sliding_vote.remove(track_id)
        self.motion_path.remove(track_id)
        # NOTE: track_cache is NOT removed on lost — it stays for TRACK_MEMORY_TIMEOUT
        # so that when the same track reappears, we can re-use the resolved identity.
