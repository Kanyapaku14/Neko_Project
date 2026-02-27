/**
 * AlertRepository.js
 *
 * Database bridge layer for the Alert system.
 * Sits between AlertEngine (local state) and a remote API/database.
 *
 * Design: local-first — AlertEngine is always the source of truth at runtime.
 * This repository syncs with the backend when available.
 *
 * Usage:
 *   await AlertRepository.push(alert);      // Send one alert to backend
 *   await AlertRepository.syncFromRemote(); // Pull from backend → AlertEngine
 *   await AlertRepository.syncToRemote();   // Push all local → backend
 */

import AlertEngine from './AlertEngine';

// ─── Config ──────────────────────────────────────────────────────────────────
// Replace BASE_URL with your actual API endpoint when ready
const BASE_URL = 'https://your-api.example.com/api';
const DEFAULT_TIMEOUT_MS = 8000;

// ─── Helpers ─────────────────────────────────────────────────────────────────
const timeoutPromise = (ms) =>
    new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), ms));

const apiFetch = (path, options = {}) => {
    const url = `${BASE_URL}${path}`;
    return Promise.race([
        fetch(url, {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            ...options,
        }),
        timeoutPromise(DEFAULT_TIMEOUT_MS),
    ]);
};

// ─── AlertRepository ─────────────────────────────────────────────────────────
const AlertRepository = {

    /**
     * Push a single alert to the remote database.
     * Call this from AlertEngine.logEvent() when you're ready to connect.
     *
     * @param {Object} alert - Full alert object from AlertEngine
     * @returns {Promise<Object|null>} Server response, or null on failure
     */
    async push(alert) {
        try {
            const res = await apiFetch('/alerts', {
                method: 'POST',
                body: JSON.stringify(alert),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const saved = await res.json();
            console.log(`AlertRepository: Pushed alert [${alert.id}]`);
            return saved;
        } catch (err) {
            console.warn(`AlertRepository: push failed — ${err.message}`);
            return null; // graceful degradation, still works offline
        }
    },

    /**
     * Pull alerts from remote and merge into AlertEngine.
     * Useful on app launch or when coming back online.
     *
     * @param {string} [userId] - Optional filter by user
     * @returns {Promise<boolean>} true if sync succeeded
     */
    async syncFromRemote(userId = null) {
        try {
            const query = userId ? `?userId=${userId}` : '';
            const res = await apiFetch(`/alerts${query}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const remoteAlerts = await res.json(); // expected: Alert[]

            // Merge remote alerts into the engine (skip duplicates by id)
            const localIds = new Set(AlertEngine.getHistory().map(a => a.id));
            let added = 0;
            for (const alert of remoteAlerts) {
                if (!localIds.has(alert.id)) {
                    // Inject directly (bypass duplicate check — remote is trusted)
                    await AlertEngine.logEvent({ ...alert, _fromRemote: true });
                    added++;
                }
            }
            console.log(`AlertRepository: Synced ${added} new alert(s) from remote`);
            return true;
        } catch (err) {
            console.warn(`AlertRepository: syncFromRemote failed — ${err.message}`);
            return false;
        }
    },

    /**
     * Push all local alerts to remote.
     * Useful for first-time sync after user logs in.
     *
     * @returns {Promise<number>} Count of successfully pushed alerts
     */
    async syncToRemote() {
        const local = AlertEngine.getHistory();
        let successCount = 0;
        for (const alert of local) {
            const result = await this.push(alert);
            if (result) successCount++;
        }
        console.log(`AlertRepository: Pushed ${successCount}/${local.length} local alerts to remote`);
        return successCount;
    },

    /**
     * Sync identity feedback that has been resolved (user identified the cat)
     * but not yet consumed for model training.
     *
     * Flow:
     *   1. Find all local alerts where resolvedCatId != null && feedbackUsedForTraining === false
     *   2. POST them to backend /feedback endpoint
     *   3. On success, call AlertEngine.markFeedbackUsed(alertId) to prevent double-sending
     *
     * Call this:
     *   - On app resume / network reconnect
     *   - After user resolves an identity confirmation
     *
     * @returns {Promise<number>} Count of successfully synced feedback items
     */
    async syncFeedbackUsed() {
        const candidates = AlertEngine.getHistory().filter(
            a => a.resolvedCatId != null && a.feedbackUsedForTraining === false
        );

        if (candidates.length === 0) return 0;

        let successCount = 0;
        for (const alert of candidates) {
            try {
                const res = await apiFetch('/feedback', {
                    method: 'POST',
                    body: JSON.stringify({
                        alertId: alert.id,
                        behaviorLabel: alert.behaviorLabel,
                        resolvedCatId: alert.resolvedCatId,
                        confidence: alert.confidence,
                        source: alert.source,
                        sessionId: alert.sessionId,
                        resolvedAt: alert.resolvedAt,
                        resolvedBy: alert.resolvedBy,
                    }),
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                await AlertEngine.markFeedbackUsed(alert.id);
                successCount++;
            } catch (err) {
                // Non-fatal: will retry next time syncFeedbackUsed() is called
                console.warn(`AlertRepository: syncFeedbackUsed failed for [${alert.id}] — ${err.message}`);
            }
        }

        console.log(`AlertRepository: Synced ${successCount}/${candidates.length} feedback item(s) for training`);
        return successCount;
    },

    /**
     * Mark an alert as resolved on the remote.
     * @param {string} alertId
     */
    async resolveOnRemote(alertId) {
        try {
            const res = await apiFetch(`/alerts/${alertId}/resolve`, { method: 'PATCH' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            console.log(`AlertRepository: Resolved [${alertId}] on remote`);
        } catch (err) {
            console.warn(`AlertRepository: resolveOnRemote failed — ${err.message}`);
        }
    },
};

export default AlertRepository;
