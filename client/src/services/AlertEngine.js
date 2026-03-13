import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Minimal EventEmitter Ã¢â‚¬â€ replaces Node's `events` module which is
 * not available in React Native / Expo Hermes environment.
 */
class SimpleEmitter {
    constructor() { this._listeners = {}; }
    on(event, cb) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(cb);
    }
    off(event, cb) {
        if (this._listeners[event]) {
            this._listeners[event] = this._listeners[event].filter(l => l !== cb);
        }
    }
    emit(event, data) {
        (this._listeners[event] || []).forEach(cb => cb(data));
    }
    setMaxListeners() { } // no-op for API compatibility
}

const ALERT_STORAGE_KEY_PREFIX = 'global_alerts';

const ABNORMAL_BEHAVIOR_SET = new Set(['vomiting', 'head_pressing', 'abnormal']);
const DEBUG_ALERT_ENGINE = false;
const DEFAULT_PENDING_COOLDOWN_MS = {
    litter: 10 * 60 * 1000,
    litter_box: 10 * 60 * 1000,
    toileting: 10 * 60 * 1000,
    eat: 10 * 60 * 1000,
    feeding_session: 10 * 60 * 1000,
    activity: 5 * 60 * 1000,
    active: 5 * 60 * 1000,
    grooming: 10 * 60 * 1000,
    sleep: 15 * 60 * 1000,
    vomiting: 2 * 60 * 1000,
    head_pressing: 2 * 60 * 1000,
    abnormal: 2 * 60 * 1000,
};

const debugLog = (...args) => {
    if (__DEV__ && DEBUG_ALERT_ENGINE) console.log(...args);
};

const normalizeBehaviorLabel = (value) =>
    String(value || '').toLowerCase().replace(/\s+/g, '_').trim();

const isAbnormalBehaviorLabel = (value) => ABNORMAL_BEHAVIOR_SET.has(normalizeBehaviorLabel(value));

const isActivityBehaviorLabel = (value) => {
    const v = normalizeBehaviorLabel(value);
    return v === 'activity' || v === 'active';
};

const NOTIFICATIONS_ENABLED_KEY = 'notifications_enabled';


/**
 * Global Alert Engine Event Names
 */
export const AlertEvents = {
    UPDATED: 'ALERT_ENGINE_UPDATED',
    NEW_CRITICAL: 'ALERT_ENGINE_NEW_CRITICAL',
    RESOLVED: 'ALERT_ENGINE_RESOLVED',
    ALERT_ADDED: 'ALERT_ENGINE_ALERT_ADDED',
    // Identity confirmation events
    IDENTITY_PENDING: 'ALERT_ENGINE_IDENTITY_PENDING',
    IDENTITY_RESOLVED: 'ALERT_ENGINE_IDENTITY_RESOLVED',
};

class AlertEngineService {
    constructor() {
        this.alerts = [];
        this.unreadCount = 0;
        this.cameraUnreadCount = 0;
        this.activeCriticalAlerts = false;
        this.pendingIdentityCount = 0;
        this.lastEmitByKey = {};
        this.isReady = false;
        this.emitter = new SimpleEmitter();
        this.scopeKey = 'anonymous';

        // Load persistency on boot
        this._loadAlertsForScope(this.scopeKey);
    }

    // Public subscription API â€” clean and testable
    on(event, cb) { this.emitter.on(event, cb); }
    off(event, cb) { this.emitter.off(event, cb); }

    _storageKey() {
        return `${ALERT_STORAGE_KEY_PREFIX}:${this.scopeKey}`;
    }

    async setScope(scopeKey) {
        const next = (scopeKey || 'anonymous').toString();
        if (next === this.scopeKey) return;
        this.scopeKey = next;
        this.alerts = [];
        this.unreadCount = 0;
        this.cameraUnreadCount = 0;
        this.activeCriticalAlerts = false;
        this.pendingIdentityCount = 0;
        this.lastEmitByKey = {};
        this.isReady = false;
        await this._loadAlertsForScope(this.scopeKey);
    }

    async _loadAlertsForScope(scopeKey) {
        try {
            const stored = await AsyncStorage.getItem(`${ALERT_STORAGE_KEY_PREFIX}:${scopeKey}`);
            if (stored) {
                const parsed = JSON.parse(stored);
                const now = Date.now();
                // Drop stale pending identity alerts on app relaunch to prevent old popup spam.
                this.alerts = (Array.isArray(parsed) ? parsed : []).filter((a) => {
                    if (!a) return false;
                    if (a.pendingIdentityConfirm === true) {
                        const abnormal = isAbnormalBehaviorLabel(a.behaviorLabel)
                            || isAbnormalBehaviorLabel(a.behaviorDetail);
                        if (!abnormal && isActivityBehaviorLabel(a.behaviorLabel)) {
                            // Drop activity/active pending identity alerts on load
                            return false;
                        }
                        const maxAgeMs = abnormal
                            ? 48 * 60 * 60 * 1000
                            : 12 * 60 * 60 * 1000;
                        const ts = new Date(a.timestamp || 0).getTime();
                        if (!Number.isFinite(ts)) return false;
                        return (now - ts) <= maxAgeMs;
                    }
                    return true;
                });
            }
        } catch (e) {
            console.error("AlertEngine: Failed to load alerts", e);
        } finally {
            this.isReady = true;
            this._recalculateState(); // emits UPDATED so late-mounting components sync up
        }
    }

    async _saveAlerts() {
        this._recalculateState(); // Emit UI update immediately before slow disk I/O
        try {
            await AsyncStorage.setItem(this._storageKey(), JSON.stringify(this.alerts));
        } catch (e) {
            console.error("AlertEngine: Failed to save alerts", e);
        }
    }

    _recalculateState() {
        let unreadGeneral = 0;
        let unreadCamera = 0;

        for (const a of this.alerts) {
            if (a.isRead || a.isDeleted) continue;
            const isCameraAlert = a.type === 'pending_identity' || a.type === 'behavior_abnormal' || a.isAbnormal;
            if (isCameraAlert) {
                unreadCamera++;
            } else {
                unreadGeneral++;
            }
        }

        this.unreadCount = unreadGeneral;
        this.cameraUnreadCount = unreadCamera;

        this.activeCriticalAlerts = this.alerts.some(a => a.severity === 'critical' && !a.resolved && !a.isDeleted);
        this.pendingIdentityCount = this.alerts.filter(a => a.pendingIdentityConfirm === true && !a.isDeleted).length;
        this._emitUpdate();
    }

    _emitUpdate() {
        this.emitter.emit(AlertEvents.UPDATED, {
            alerts: this.alerts,
            unreadCount: this.unreadCount,
            cameraUnreadCount: this.cameraUnreadCount,
            hasCritical: this.activeCriticalAlerts,
            pendingIdentityCount: this.pendingIdentityCount
        });
    }

    /**
     * Add a new alert to the engine.
     * Designed to be generic to support future features (Temp/Humidity, Auth, etc.)
     * @param {Object} alertData - { type, severity, title, desc, details, expiresAt, ttlMs }
     *   expiresAt: explicit ISO expiry date (optional)
     *   ttlMs: time-to-live in ms (optional). Defaults: critical=48h, warning=24h, info/success=6h
     */
    async logEvent(alertData) {

        if (alertData?.pendingIdentityConfirm === true) {
            const abnormal = isAbnormalBehaviorLabel(alertData.behaviorLabel)
                || isAbnormalBehaviorLabel(alertData.behaviorDetail)
                || alertData.isAbnormal === true;
            if (!abnormal && isActivityBehaviorLabel(alertData.behaviorLabel)) {
                // Do not create identity-prompt alerts for activity/active
                return;
            }
        }
        try {
            const raw = await AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
            if (raw === 'false') return;
        } catch (_) {
            // if storage fails, default to allow

        }
        const normalizedSeverity = (alertData.severity || 'info').toLowerCase();
        const nowMs = Date.now();
        const dedupeKey = alertData.dedupeKey ? String(alertData.dedupeKey) : null;
        const cooldownMs = Number(alertData.cooldownMs || 0);

        if (dedupeKey && cooldownMs > 0) {
            const lastTs = Number(this.lastEmitByKey[dedupeKey] || 0);
            if (lastTs > 0 && (nowMs - lastTs) < cooldownMs) {
                return;
            }
        }

        // Prevent duplicate spam of the same un-resolved critical event type
        // (Except pending_identity: allow multiple abnormal sessions)
        if (normalizedSeverity === 'critical' && alertData.type !== 'pending_identity') {
            const hasExisting = this.alerts.some(a => a.type === alertData.type && !a.resolved);
            if (hasExisting) {
                debugLog(`AlertEngine: Ignored duplicate critical event for [${alertData.type}]`);
                return;
            }
        }

        // --- CONTENT-BASED DEDUPLICATION ---
        // For general alerts (Camera moved, etc.), avoid repetition if title/type match within 5 minutes
        const FIVE_MIN_MS = 5 * 60 * 1000;
        const potentialDup = this.alerts.find(a =>
            a.type === alertData.type &&
            a.title === alertData.title &&
            Math.abs(new Date(a.timestamp).getTime() - nowMs) < FIVE_MIN_MS
        );
        if (potentialDup && alertData.type !== 'pending_identity' && normalizedSeverity !== 'critical') {
            debugLog(`AlertEngine: Ignored repeated event [${alertData.type}] within 5min window`);
            return;
        }

        // Duplicate guard for pending_identity:
        // If the same (sessionId + behaviorLabel) is already waiting, update existing to newest instead of dropping.
        if (alertData.pendingIdentityConfirm === true) {
            const dupIdx = this.alerts.findIndex(
                a => a.pendingIdentityConfirm === true
                    && a.sessionId === alertData.sessionId
                    && a.behaviorLabel === alertData.behaviorLabel
            );
            if (dupIdx >= 0) {
                const prev = this.alerts[dupIdx];
                const prevTs = new Date(prev.timestamp || 0).getTime();
                const nextTs = new Date(alertData.timestamp || Date.now()).getTime();
                if (Number.isFinite(nextTs) && nextTs >= prevTs) {
                    this.alerts[dupIdx] = {
                        ...prev,
                        confidence: alertData.confidence ?? prev.confidence ?? null,
                        cropSnapshot: alertData.cropSnapshot || prev.cropSnapshot || null,
                        multiSnapshots: Array.isArray(alertData.multiSnapshots) ? alertData.multiSnapshots : (prev.multiSnapshots || null),
                        source: alertData.source || prev.source || null,
                        remoteReviewId: alertData.remoteReviewId || prev.remoteReviewId || null,
                        timestamp: alertData.timestamp || prev.timestamp || new Date().toISOString(),
                        dedupeKey: dedupeKey || prev.dedupeKey || null,
                    };
                    await this._saveAlerts();
                }
                return;
            }
        }

        // Compute expiresAt: use explicit value, or derive from ttlMs, or default by severity
        const defaultTtlMs = {
            critical: 48 * 60 * 60 * 1000,  // 48h
            warning: 24 * 60 * 60 * 1000,  // 24h
            success: 6 * 60 * 60 * 1000,  //  6h
            info: 6 * 60 * 60 * 1000,  //  6h
        };
        const ttlMs = alertData.ttlMs ?? (defaultTtlMs[normalizedSeverity] ?? defaultTtlMs.info);
        const expiresAt = alertData.expiresAt ?? new Date(Date.now() + ttlMs).toISOString();

        const pendingSessionId = (alertData.pendingIdentityConfirm === true)
            ? (alertData.sessionId || alertData.remoteReviewId || dedupeKey || alertData.id || null)
            : null;

        // --- ENHANCED DEDUPLICATION ---
        const existingIdx = this.alerts.findIndex(a =>
            String(a.id) === String(alertData.id) ||
            (alertData.remoteReviewId && String(a.remoteReviewId) === String(alertData.remoteReviewId)) ||
            (pendingSessionId && a.sessionId === pendingSessionId) ||
            (alertData.type === 'pending_identity' && a.sessionId === alertData.sessionId && a.behaviorLabel === alertData.behaviorLabel)
        );

        if (existingIdx >= 0) {
            const prev = this.alerts[existingIdx];
            // If already identified or read, don't let a sync-back "unread" status overwrite it
            const nextIsRead = (prev.isRead === true) ? true : (alertData.isRead ?? prev.isRead);
            const nextResolved = alertData.resolved ?? prev.resolved;
            const nextPending = alertData.pendingIdentityConfirm !== undefined
                ? alertData.pendingIdentityConfirm
                : prev.pendingIdentityConfirm;

            this.alerts[existingIdx] = {
                ...prev,
                isRead: nextIsRead,
                resolved: nextResolved,
                remoteReviewId: alertData.remoteReviewId || prev.remoteReviewId || null,
                _fromRemote: alertData._fromRemote || prev._fromRemote || false,
                timestamp: (alertData.timestamp && new Date(alertData.timestamp) > new Date(prev.timestamp))
                    ? alertData.timestamp : prev.timestamp,
                pendingIdentityConfirm: nextPending,
                resolvedCatId: alertData.resolvedCatId || prev.resolvedCatId || null,
                resolvedCatName: alertData.resolvedCatName || prev.resolvedCatName || null,
                resolvedBy: alertData.resolvedBy || prev.resolvedBy || null,
            };
            await this._saveAlerts();
            return;
        }

        const newAlert = {
            id: alertData.id || (Date.now().toString() + Math.random().toString(36).substr(2, 5)),
            type: alertData.type || 'system',
            severity: normalizedSeverity,
            title: alertData.title,
            desc: alertData.desc,
            details: alertData.details || '',
            catId: alertData.catId || null,
            catName: alertData.catName || null,
            timestamp: alertData.timestamp || new Date().toISOString(),
            cameraId: alertData.cameraId || null,
            expiresAt,
            isRead: alertData.isRead === true,
            resolved: alertData.resolved ?? (normalizedSeverity !== 'critical'),
            _fromRemote: alertData._fromRemote === true,
            remoteReviewId: alertData.remoteReviewId || null,
            dedupeKey,
            identityRule: alertData.identityRule || null,
            catCounts: alertData.catCounts || null,

            // â”€â”€ Identity Confirmation Fields (optional, undefined if not a pending_identity alert) â”€â”€
            // pendingIdentityConfirm: bool â€” true while waiting for user to identify the cat
            // behaviorLabel: string â€” e.g. 'vomiting'
            // confidence: number â€” model confidence 0-1
            // cropSnapshot: string â€” URL/URI to crop image
            // sessionId: string â€” session this detection belongs to
            // source: string â€” model name e.g. 'behavior_classifier_v3'
            // resolvedCatId: string|null â€” cat_id chosen by user
            // resolvedAt: string|null â€” ISO timestamp of resolution
            // resolvedBy: string|null â€” 'user' | 'auto' | 'skipped'
            // feedbackUsedForTraining: bool â€” set to true by backend after training
            ...(alertData.pendingIdentityConfirm !== undefined && {
                pendingIdentityConfirm: alertData.pendingIdentityConfirm,
                behaviorLabel: alertData.behaviorLabel || null,
                confidence: alertData.confidence ?? null,
                cropSnapshot: alertData.cropSnapshot || null,
                multiSnapshots: Array.isArray(alertData.multiSnapshots) ? alertData.multiSnapshots : null,
                sessionId: pendingSessionId,
                source: alertData.source || null,
                resolvedCatId: alertData.resolvedCatId || null,
                resolvedCatName: alertData.resolvedCatName || null,
                resolutionText: alertData.resolutionText || null,
                resolvedAt: alertData.resolvedAt || null,
                resolvedBy: alertData.resolvedBy || null,
                feedbackUsedForTraining: alertData.feedbackUsedForTraining || false,
                isAbnormal: alertData.isAbnormal || false,
            }),
        };

        this.alerts.unshift(newAlert);
        if (dedupeKey) this.lastEmitByKey[dedupeKey] = nowMs;

        // Keep history manageable (limit must be higher than sync fetch limit to prevent loops)
        if (this.alerts.length > 200) {
            this.alerts.pop();
        }

        await this._saveAlerts();
        this.emitter.emit(AlertEvents.ALERT_ADDED, newAlert);

        if (normalizedSeverity === 'critical') {
            this.emitter.emit(AlertEvents.NEW_CRITICAL, newAlert);
        }

        if (newAlert.pendingIdentityConfirm === true) {
            this.emitter.emit(AlertEvents.IDENTITY_PENDING, newAlert);
        }
    }

    /**
     * Submit a new uncertain behavior detection for user confirmation.
     * Replaces the former IdentityConfirmQueue.submit()
     * @param {Object} payload - { behaviorLabel, confidence, cropSnapshot, multiSnapshots, sessionId, source, isAbnormal, dedupeKey, cooldownMs }
     */
    async logPendingIdentity(payload) {
        const { behaviorLabel, confidence, cropSnapshot, multiSnapshots, sessionId, source, isAbnormal, dedupeKey, cooldownMs, catCounts, identityRule, cameraId } = payload;
        if (!behaviorLabel) return;
        const label = behaviorLabel;
        const abnormalLabel = isAbnormalBehaviorLabel(label);
        if (isActivityBehaviorLabel(label) && !abnormalLabel) {
            // Do not prompt cat selection for activity/active
            return;
        }

        const normalized = normalizeBehaviorLabel(label);
        const autoCooldownMs = DEFAULT_PENDING_COOLDOWN_MS[normalized] || (abnormalLabel ? 2 * 60 * 1000 : 10 * 60 * 1000);
        const effectiveCooldownMs = Number(cooldownMs || 0) > 0 ? Number(cooldownMs) : autoCooldownMs;
        const autoDedupeKey = dedupeKey || `pending_identity:${normalized}:${cameraId || 'unknown'}`;

        const confidencePct = confidence != null ? Math.round(confidence * 100) : null;
        const confidenceStr = confidencePct != null ? ` (${confidencePct}% confidence)` : '';
        const isAbnormalFinal = abnormalLabel || isAbnormal === true;
        const titleText = isAbnormalFinal
            ? 'Abnormal behavior detected - Identify the cat'
            : 'Behavior detected - Identify the cat';

        await this.logEvent({
            type: 'pending_identity',
            severity: isAbnormalFinal ? 'critical' : 'info',
            title: titleText,
            desc: `Detected "${label}"${confidenceStr}, but the system is not sure which cat it is. Please identify the cat.`,
            details: source ? `From model: ${source}` : '',
            pendingIdentityConfirm: true,
            behaviorLabel: label,
            confidence: confidence ?? null,
            cropSnapshot: cropSnapshot || null,
            multiSnapshots: Array.isArray(multiSnapshots) ? multiSnapshots : null,
            sessionId: sessionId || null,
            source: source || null,
            isAbnormal: isAbnormalFinal || false,
            dedupeKey: autoDedupeKey,
            cooldownMs: effectiveCooldownMs,
            catCounts: catCounts || null,
            identityRule: identityRule || null,
            cameraId: cameraId || null,
        });
    }

    /**
     * Get all alerts currently waiting for identity confirmation.
     */
    getPendingIdentities() {
        return this.alerts.filter(a => a.pendingIdentityConfirm === true && !a.isDeleted);
    }

    /**
     * Get count of pending identity confirmations.
     */
    getPendingIdentityCount() {
        return this.pendingIdentityCount;
    }

    /**
     * Mark specific active critical alerts as resolved
     * @param {string} criteriaType - The type of alert to resolve (e.g., 'camera_connection')
     * @param {string} resolutionMessage - Optional log to append
     */
    async resolveActiveAlerts(criteriaType, resolutionData = null) {
        let changed = false;
        this.alerts = this.alerts.map(a => {
            if (a.type === criteriaType && !a.resolved) {
                changed = true;
                return { ...a, resolved: true, resolvedAt: new Date().toISOString() };
            }
            return a;
        });

        if (changed) {
            if (resolutionData) {
                // Log a success event indicating resolution
                await this.logEvent({
                    type: criteriaType + '_resolved',
                    severity: 'success',
                    ...resolutionData
                });
            } else {
                await this._saveAlerts();
            }
            this.emitter.emit(AlertEvents.RESOLVED, criteriaType);
        }
    }

    /**
     * Resolve a pending_identity alert â€” user has identified which cat it is.
     * @param {string} alertId
     * @param {string} catId - The cat_id selected by the user
     * @param {'user'|'auto'|'skipped'} [resolvedBy='user']
     */
    async resolveIdentity(alertId, catId, resolvedBy = 'user', resolvedCatName = null) {
        let resolved = null;
        const targetId = String(alertId);

        this.alerts = this.alerts.map(a => {
            const canResolveSkipped = a.type === 'pending_identity' && a.resolvedBy === 'skipped';
            const canEditResolved = a.type === 'pending_identity' && a.pendingIdentityConfirm !== true && !!a.resolvedBy;
            if (String(a.id) === targetId && (a.pendingIdentityConfirm === true || canResolveSkipped || canEditResolved)) {
                const chosenName = resolvedCatName || a.resolvedCatName || null;
                const resolutionNote = resolvedBy === 'skipped'
                    ? 'Marked as not your cat.'
                    : (chosenName
                        ? `Selected cat: ${chosenName}.`
                        : (catId ? `Selected cat ID: ${catId}.` : 'Identity confirmed.'));
                resolved = {
                    ...a,
                    pendingIdentityConfirm: false,
                    isRead: true, // Mark as read since user interacted with it
                    resolvedCatId: catId,
                    resolvedCatName: chosenName,
                    resolvedAt: new Date().toISOString(),
                    resolvedBy,
                    resolutionText: resolutionNote,
                };
                return resolved;
            }
            return a;
        });

        if (resolved) {
            this._recalculateState(); // Emit UI update immediately
            await this._saveAlerts();
            this.emitter.emit(AlertEvents.IDENTITY_RESOLVED, resolved);
            console.log(`AlertEngine: Identity resolved for alert [${alertId}] -> cat [${catId}]`);
        }
    }

    /**
     * Mark that an alert's feedback has been consumed by the backend for training.
     * Called by AlertRepository.syncFeedbackUsed() after backend confirms receipt.
     * @param {string} alertId
     */
    async markFeedbackUsed(alertId) {
        let changed = false;
        this.alerts = this.alerts.map(a => {
            if (a.id === alertId && a.feedbackUsedForTraining === false) {
                changed = true;
                return { ...a, feedbackUsedForTraining: true };
            }
            return a;
        });
        if (changed) {
            await this._saveAlerts();
            console.log(`AlertEngine: Marked feedback as used for training [${alertId}]`);
        }
    }



    /**
     * Attach remote review id from DB row to an existing local alert.
     * @param {string} alertId
     * @param {string} remoteReviewId
     */
    async attachRemoteReviewId(alertId, remoteReviewId) {
        let changed = false;
        this.alerts = this.alerts.map(a => {
            if (a.id === alertId && !a.remoteReviewId && remoteReviewId) {
                changed = true;
                return { ...a, remoteReviewId };
            }
            return a;
        });
        if (changed) {
            await this._saveAlerts();
        }
    }

    async markAllAsRead() {
        let changed = false;
        this.alerts = this.alerts.map(a => {
            if (!a.isRead) {
                changed = true;
                return { ...a, isRead: true };
            }
            return a;
        });

        if (changed) {
            await this._saveAlerts();
        }
    }

    /**
     * Delete a specific alert (Soft delete)
     */
    async deleteAlert(alertId) {
        let changed = false;
        this.alerts = this.alerts.map(a => {
            if (a.id === alertId && !a.isDeleted) {
                changed = true;
                return { ...a, isDeleted: true, deletedAt: new Date().toISOString() };
            }
            return a;
        });
        if (changed) await this._saveAlerts();
    }

    /**
     * Soft delete all alerts tied to a session or review id.
     */
    async deleteIdentityGroup(sessionId, reviewId) {
        const sid = sessionId ? String(sessionId) : null;
        const rid = reviewId ? String(reviewId) : null;
        let changed = false;
        this.alerts = this.alerts.map(a => {
            if (a.isDeleted) return a;
            const matchSession = sid && String(a.sessionId || '') === sid;
            const matchReview = rid && (String(a.remoteReviewId || '') === rid || String(a.id || '') === rid);
            if (matchSession || matchReview) {
                changed = true;
                return { ...a, isDeleted: true, deletedAt: new Date().toISOString() };
            }
            return a;
        });
        if (changed) await this._saveAlerts();
    }

    /**
     * Soft delete multiple alerts
     */
    async deleteMultipleAlerts(alertIds) {
        let changed = false;
        this.alerts = this.alerts.map(a => {
            if (alertIds.includes(a.id) && !a.isDeleted) {
                changed = true;
                return { ...a, isDeleted: true, deletedAt: new Date().toISOString() };
            }
            return a;
        });
        if (changed) await this._saveAlerts();
    }

    /**
     * Permanently delete multiple alerts
     */
    async permanentlyDeleteMultipleAlerts(alertIds) {
        const before = this.alerts.length;
        this.alerts = this.alerts.filter(a => !alertIds.includes(a.id));
        if (this.alerts.length !== before) {
            await this._saveAlerts();
        }
    }

    /**
     * Delete all non-pending alerts (Soft delete)
     */
    async deleteAllAlerts() {
        let changed = false;
        this.alerts = this.alerts.map(a => {
            if (a.pendingIdentityConfirm !== true && !a.isDeleted) {
                changed = true;
                return { ...a, isDeleted: true, deletedAt: new Date().toISOString() };
            }
            return a;
        });
        if (changed) await this._saveAlerts();
    }

    /**
     * Toggle Pin status
     */
    async togglePin(alertId) {
        let changed = false;
        this.alerts = this.alerts.map(a => {
            if (a.id === alertId) {
                changed = true;
                return { ...a, isPinned: !a.isPinned };
            }
            return a;
        });
        if (changed) await this._saveAlerts();
    }

    async markAsRead(alertId) {
        let changed = false;
        const targetId = String(alertId);
        this.alerts = this.alerts.map(a => {
            if (String(a.id) === targetId && !a.isRead) {
                changed = true;
                return { ...a, isRead: true };
            }
            return a;
        });

        if (changed) {
            await this._saveAlerts();
            this._recalculateState(); // Emit UPDATED event
        }
    }


    /**
     * Clear all alerts from local storage and memory.
     */
    async clearAll() {
        this.alerts = [];
        this.unreadCount = 0;
        this.cameraUnreadCount = 0;
        this.activeCriticalAlerts = false;
        this.pendingIdentityCount = 0;
        this.lastEmitByKey = {};
        this._emitUpdate();
        try {
            const keys = await AsyncStorage.getAllKeys();
            const alertKeys = keys.filter((k) => String(k || '').startsWith(`${ALERT_STORAGE_KEY_PREFIX}:`));
            if (alertKeys.length > 0) {
                await AsyncStorage.multiRemove(alertKeys);
            } else {
                await AsyncStorage.removeItem(this._storageKey());
            }
        } catch (e) {
            console.error("AlertEngine: Failed to clear alerts", e);
        }
    }

    /**
     * Patch an alert in place (e.g., update snapshots after user removes a bad image).
     */
    async patchAlert(alertId, patch = {}) {
        let changed = false;
        const targetId = String(alertId);
        this.alerts = this.alerts.map(a => {
            const matchById = String(a.id) === targetId;
            const matchByRemote = String(a.remoteReviewId || '') === targetId;
            if (matchById || matchByRemote) {
                changed = true;
                return { ...a, ...patch };
            }
            return a;
        });
        if (changed) {
            await this._saveAlerts();
        }
    }

    /**
     * Remove all alerts past their expiresAt timestamp.
     * Call on app boot or periodically to keep storage clean.
     */
    async purgeExpired() {
        const now = Date.now();
        const before = this.alerts.length;
        const fallbackTtlMs = {
            critical: 48 * 60 * 60 * 1000,
            warning: 24 * 60 * 60 * 1000,
            success: 6 * 60 * 60 * 1000,
            info: 6 * 60 * 60 * 1000,
        };
        this.alerts = this.alerts.filter((a) => {
            if (a.expiresAt) {
                return new Date(a.expiresAt).getTime() > now;
            }
            const ts = new Date(a.timestamp || 0).getTime();
            if (!Number.isFinite(ts)) return true;
            const sev = String(a.severity || 'info').toLowerCase();
            const ttl = fallbackTtlMs[sev] ?? fallbackTtlMs.info;
            return (now - ts) <= ttl;
        });
        if (this.alerts.length !== before) {
            await this._saveAlerts();
            console.log(`AlertEngine: Purged ${before - this.alerts.length} expired alert(s)`);
        }
    }

    getHistory() {
        return this.alerts.filter(a => !a.isDeleted);
    }

    getDeletedHistory() {
        return this.alerts.filter(a => a.isDeleted);
    }

    getUnreadCount() {
        return this.unreadCount;
    }

    getCameraUnreadCount() {
        return this.cameraUnreadCount;
    }

    hasActiveCritical() {
        return this.activeCriticalAlerts;
    }
}

// Export as Singleton
const AlertEngine = new AlertEngineService();
export default AlertEngine;
