import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Minimal EventEmitter â€” replaces Node's `events` module which is
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

const ALERT_STORAGE_KEY = 'global_alerts';

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
        this.activeCriticalAlerts = false;
        this.pendingIdentityCount = 0;
        this.isReady = false;
        this.emitter = new SimpleEmitter();

        // Load persistency on boot
        this._loadAlerts();
    }

    // Public subscription API â€” clean and testable
    on(event, cb) { this.emitter.on(event, cb); }
    off(event, cb) { this.emitter.off(event, cb); }

    async _loadAlerts() {
        try {
            const stored = await AsyncStorage.getItem(ALERT_STORAGE_KEY);
            if (stored) {
                this.alerts = JSON.parse(stored);
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
            await AsyncStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(this.alerts));
        } catch (e) {
            console.error("AlertEngine: Failed to save alerts", e);
        }
    }

    _recalculateState() {
        this.unreadCount = this.alerts.filter(a => !a.isRead && !a.isDeleted).length;
        this.activeCriticalAlerts = this.alerts.some(a => a.severity === 'critical' && !a.resolved && !a.isDeleted);
        this.pendingIdentityCount = this.alerts.filter(a => a.pendingIdentityConfirm === true && !a.isDeleted).length;
        this._emitUpdate();
    }

    _emitUpdate() {
        this.emitter.emit(AlertEvents.UPDATED, {
            alerts: this.alerts,
            unreadCount: this.unreadCount,
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
        const normalizedSeverity = (alertData.severity || 'info').toLowerCase();

        // Prevent duplicate spam of the same un-resolved critical event type
        if (normalizedSeverity === 'critical') {
            const hasExisting = this.alerts.some(a => a.type === alertData.type && !a.resolved);
            if (hasExisting) {
                console.log(`AlertEngine: Ignored duplicate critical event for [${alertData.type}]`);
                return;
            }
        }

        // Duplicate guard for pending_identity:
        // If the same (sessionId + behaviorLabel) is already waiting for confirmation, skip.
        if (alertData.pendingIdentityConfirm === true) {
            const isDuplicate = this.alerts.some(
                a => a.pendingIdentityConfirm === true
                    && a.sessionId === alertData.sessionId
                    && a.behaviorLabel === alertData.behaviorLabel
            );
            if (isDuplicate) {
                console.log(`AlertEngine: Ignored duplicate pending_identity for [${alertData.behaviorLabel}] in session [${alertData.sessionId}]`);
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

        const newAlert = {
            id: alertData.id || (Date.now().toString() + Math.random().toString(36).substr(2, 5)),
            type: alertData.type || 'system',
            severity: normalizedSeverity,
            title: alertData.title,
            desc: alertData.desc,
            details: alertData.details || '',
            timestamp: alertData.timestamp || new Date().toISOString(),
            expiresAt,
            isRead: false,
            resolved: normalizedSeverity !== 'critical',
            _fromRemote: alertData._fromRemote === true,
            remoteReviewId: alertData.remoteReviewId || null,

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
                sessionId: alertData.sessionId || null,
                source: alertData.source || null,
                resolvedCatId: null,
                resolvedAt: null,
                resolvedBy: null,
                feedbackUsedForTraining: false,
                isAbnormal: alertData.isAbnormal || false,
            }),
        };

        this.alerts.unshift(newAlert);

        // Keep history manageable (e.g., last 50 alerts)
        if (this.alerts.length > 50) {
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
     * @param {Object} payload - { behaviorLabel, confidence, cropSnapshot, sessionId, source, isAbnormal }
     */
    async logPendingIdentity(payload) {
        const { behaviorLabel, confidence, cropSnapshot, sessionId, source, isAbnormal } = payload;
        if (!behaviorLabel) return;

        const confidencePct = confidence != null ? Math.round(confidence * 100) : null;
        const confidenceStr = confidencePct != null ? ` (${confidencePct}% confidence)` : '';
        const titleText = isAbnormal
            ? 'Abnormal behavior detected - Please identify the cat'
            : 'Behavior detected - Please identify the cat';

        await this.logEvent({
            type: 'pending_identity',
            severity: isAbnormal ? 'warning' : 'info',
            title: titleText,
            desc: `Detected "${behaviorLabel}"${confidenceStr}, but the system is not sure which cat it is. Please identify the cat.`,
            details: source ? `From model: ${source}` : '',
            pendingIdentityConfirm: true,
            behaviorLabel,
            confidence: confidence ?? null,
            cropSnapshot: cropSnapshot || null,
            sessionId: sessionId || null,
            source: source || null,
            isAbnormal: isAbnormal || false,
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
        this.alerts = this.alerts.map(a => {
            if (a.id === alertId && !a.isRead) {
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
     * Remove all alerts past their expiresAt timestamp.
     * Call on app boot or periodically to keep storage clean.
     */
    async purgeExpired() {
        const now = Date.now();
        const before = this.alerts.length;
        this.alerts = this.alerts.filter(a => !a.expiresAt || new Date(a.expiresAt).getTime() > now);
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

    hasActiveCritical() {
        return this.activeCriticalAlerts;
    }
}

// Export as Singleton
const AlertEngine = new AlertEngineService();
export default AlertEngine;

