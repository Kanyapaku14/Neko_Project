import AsyncStorage from '@react-native-async-storage/async-storage';
import AlertEngine, { AlertEvents } from './AlertEngine';
import supabase from '../screens/config/supabaseClient';

const CAMERA_ID_KEY = 'camera_id';
const RESOLVED_REVIEW_IDS_KEY_PREFIX = 'resolved_identity_review_ids';

const isUuid = (value) =>
    typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const normalizeBehaviorLabel = (label) => {
    const v = String(label || '').toLowerCase().trim();
    if (['eat', 'eating', 'food', 'feeding'].includes(v)) return 'eat';
    if (['litter', 'toilet', 'toileting', 'urine', 'stool'].includes(v)) return 'litter';
    if (['sleep', 'rest', 'resting'].includes(v)) return 'sleep';
    if (['activity', 'active', 'play', 'playing', 'grooming'].includes(v)) return 'activity';
    if (['abnormal', 'warning', 'critical'].includes(v)) return 'abnormal';
    return 'activity';
};

const mapSeverity = (s) => {
    const v = String(s || 'info').toLowerCase();
    if (v === 'critical') return 'critical';
    if (v === 'warning') return 'warning';
    if (v === 'success') return 'success';
    return 'info';
};

const mapAlertToDb = (alert, ownerId, cameraId) => ({
    id: isUuid(alert.id) ? alert.id : undefined,
    owner_id: ownerId,
    camera_id: isUuid(alert.cameraId) ? alert.cameraId : (isUuid(cameraId) ? cameraId : null),
    cat_id: isUuid(alert.resolvedCatId) ? alert.resolvedCatId : null,
    type: alert.type || 'system',
    severity: mapSeverity(alert.severity),
    title: alert.title || 'Notification',
    description: alert.desc || '',
    details: alert.details || '',
    is_read: !!alert.isRead,
    is_deleted: !!alert.isDeleted,
    resolved: !!alert.resolved,
    timestamp: alert.timestamp || new Date().toISOString(),
    expires_at: alert.expiresAt || null,
    source: alert.source || null,
    session_id: alert.sessionId || null,
    metadata: {
        behaviorLabel: alert.behaviorLabel || null,
        confidence: alert.confidence ?? null,
        pendingIdentityConfirm: alert.pendingIdentityConfirm === true,
        isAbnormal: alert.isAbnormal === true,
        cropSnapshot: alert.cropSnapshot || null,
        remoteReviewId: alert.remoteReviewId || null,
        resolvedBy: alert.resolvedBy || null,
        resolvedAt: alert.resolvedAt || null,
        resolvedCatName: alert.resolvedCatName || null,
        resolutionText: alert.resolutionText || null,
    },
});

const mapDbAlertToLocal = (row) => ({
    id: row.id,
    type: row.type,
    severity: row.severity,
    title: row.title,
    desc: row.description || row.desc || '',
    details: row.details || '',
    timestamp: row.timestamp || row.created_at || new Date().toISOString(),
    expiresAt: row.expires_at || undefined,
    isRead: row.is_read === true,
    isDeleted: row.is_deleted === true,
    resolved: row.resolved === true,
    source: row.source || null,
    sessionId: row.session_id || null,
    pendingIdentityConfirm: row?.metadata?.pendingIdentityConfirm === true,
    behaviorLabel: row?.metadata?.behaviorLabel || null,
    confidence: row?.metadata?.confidence ?? null,
    cropSnapshot: row?.metadata?.cropSnapshot || null,
    isAbnormal: row?.metadata?.isAbnormal === true,
    resolvedBy: row?.metadata?.resolvedBy || null,
    resolvedAt: row?.metadata?.resolvedAt || null,
    resolvedCatName: row?.metadata?.resolvedCatName || null,
    resolutionText: row?.metadata?.resolutionText || null,
    resolvedCatId: row.cat_id || null,
    _fromRemote: true,
});

const mapIdentityReviewToLocalAlert = (row) => {
    const confidencePct = row.confidence != null ? Math.round(Number(row.confidence) * 100) : null;
    const confidenceStr = confidencePct != null ? ` (${confidencePct}% confidence)` : '';
    const behavior = normalizeBehaviorLabel(row.behavior_label);
    return {
        id: row.id,
        type: 'pending_identity',
        severity: behavior === 'abnormal' ? 'warning' : 'info',
        title: behavior === 'abnormal'
            ? 'Abnormal behavior detected - Please identify the cat'
            : 'Behavior detected - Please identify the cat',
        desc: `Detected "${behavior}"${confidenceStr}, but the system is not sure which cat it is. Please identify the cat.`,
        details: row.source ? `From model: ${row.source}` : '',
        timestamp: row.occurred_at || row.created_at || new Date().toISOString(),
        pendingIdentityConfirm: row.reviewed !== true,
        behaviorLabel: behavior,
        confidence: row.confidence ?? null,
        cropSnapshot: row.snapshot_url || null,
        sessionId: row.session_id || null,
        source: row.source || null,
        cameraId: row.camera_id || null,
        resolvedCatId: row.resolved_cat_id || null,
        resolvedBy: row.resolved_by || null,
        resolvedAt: row.reviewed_at || null,
        remoteReviewId: row.id,
        isAbnormal: behavior === 'abnormal',
        _fromRemote: true,
    };
};

const AlertRepository = {
    _isInit: false,
    _resolvedReviewIdsKey: `${RESOLVED_REVIEW_IDS_KEY_PREFIX}:anonymous`,

    init() {
        if (this._isInit) return;
        this._isInit = true;
        AlertEngine.on(AlertEvents.ALERT_ADDED, (alert) => {
            if (!alert || alert._fromRemote) return;
            this.push(alert);
        });
    },

    async _getContext() {
        const [{ data: userRes }, storedCameraId] = await Promise.all([
            supabase.auth.getUser(),
            AsyncStorage.getItem(CAMERA_ID_KEY),
        ]);
        const userId = userRes?.user?.id || null;
        return {
            userId,
            cameraId: isUuid(storedCameraId) ? storedCameraId : null,
        };
    },

    async _getResolvedReviewIds() {
        try {
            const raw = await AsyncStorage.getItem(this._resolvedReviewIdsKey);
            if (!raw) return new Set();
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) return new Set();
            return new Set(arr.map((v) => String(v)));
        } catch (e) {
            return new Set();
        }
    },

    async _markResolvedReviewId(reviewId) {
        if (!reviewId) return;
        try {
            const set = await this._getResolvedReviewIds();
            set.add(String(reviewId));
            await AsyncStorage.setItem(this._resolvedReviewIdsKey, JSON.stringify(Array.from(set)));
        } catch (e) {
            // no-op
        }
    },

    async push(alert, targetUserId = null) {
        try {
            const { userId: currentUserId, cameraId } = await this._getContext();
            const ownerId = targetUserId || currentUserId;
            if (!ownerId) return null;

            const payload = mapAlertToDb(alert, ownerId, cameraId);
            const { data, error } = await supabase
                .from('alerts')
                .upsert(payload, { onConflict: 'id' })
                .select('id')
                .single();
            if (error) throw error;

            if (alert.pendingIdentityConfirm === true) {
                const reviewPayload = {
                    camera_id: isUuid(alert.cameraId) ? alert.cameraId : cameraId,
                    snapshot_url: alert.cropSnapshot || null,
                    pred_cat_id: null,
                    confidence: alert.confidence ?? null,
                    behavior_label: normalizeBehaviorLabel(alert.behaviorLabel),
                    occurred_at: alert.timestamp || new Date().toISOString(),
                    reviewed: false,
                    source: alert.source || null,
                    session_id: alert.sessionId || null,
                    metadata: { local_alert_id: alert.id },
                };

                if (reviewPayload.camera_id) {
                    const { data: review, error: reviewError } = await supabase
                        .from('ai_cat_identity_review')
                        .insert(reviewPayload)
                        .select('id')
                        .single();
                    if (!reviewError && review?.id) {
                        await AlertEngine.attachRemoteReviewId(alert.id, review.id);
                    }
                }
            }
            return data || null;
        } catch (err) {
            console.warn(`AlertRepository.push failed: ${err?.message || err}`);
            return null;
        }
    },

    async syncFromRemote() {
        try {
            const { userId, cameraId } = await this._getContext();
            if (!userId) return false;
            this._resolvedReviewIdsKey = `${RESOLVED_REVIEW_IDS_KEY_PREFIX}:${userId}:${cameraId || 'no_camera'}`;

            const localIds = new Set(AlertEngine.getHistory().map((a) => String(a.id)));
            const localRemoteReviewIds = new Set(
                AlertEngine.getHistory()
                    .map((a) => a?.remoteReviewId)
                    .filter(Boolean)
                    .map((v) => String(v))
            );
            const resolvedReviewIds = await this._getResolvedReviewIds();

            const { data: dbAlerts, error: alertsError } = await supabase
                .from('alerts')
                .select('*')
                .eq('owner_id', userId)
                .eq('is_deleted', false)
                .order('timestamp', { ascending: false })
                .limit(100);
            if (alertsError) throw alertsError;

            for (const row of (dbAlerts || [])) {
                // Pending identity is sourced from ai_cat_identity_review below.
                // Skip here to prevent duplicate popup entries on app relaunch.
                if (row?.metadata?.pendingIdentityConfirm === true) continue;
                if (localIds.has(String(row.id))) continue;
                await AlertEngine.logEvent(mapDbAlertToLocal(row));
            }

            if (cameraId) {
                const recentIso = new Date(Date.now() - (2 * 60 * 60 * 1000)).toISOString();
                const { data: reviews, error: reviewErr } = await supabase
                    .from('ai_cat_identity_review')
                    .select('*')
                    .eq('camera_id', cameraId)
                    .eq('reviewed', false)
                    .gte('occurred_at', recentIso)
                    .order('occurred_at', { ascending: false })
                    .limit(100);
                if (reviewErr) throw reviewErr;

                // Keep only newest row per (session + behavior) group to avoid duplicate popups on app relaunch.
                const latestByGroup = new Map();
                for (const row of (reviews || [])) {
                    const gk = `${row.session_id || row.id}|${normalizeBehaviorLabel(row.behavior_label)}`;
                    const prev = latestByGroup.get(gk);
                    const rowTs = new Date(row.occurred_at || row.created_at || 0).getTime();
                    const prevTs = prev ? new Date(prev.occurred_at || prev.created_at || 0).getTime() : -1;
                    if (!prev || rowTs >= prevTs) latestByGroup.set(gk, row);
                }

                for (const row of latestByGroup.values()) {
                    if (resolvedReviewIds.has(String(row.id))) continue;
                    if (localIds.has(String(row.id))) continue;
                    if (localRemoteReviewIds.has(String(row.id))) continue;
                    await AlertEngine.logEvent(mapIdentityReviewToLocalAlert(row));
                }
            }

            return true;
        } catch (err) {
            console.warn(`AlertRepository.syncFromRemote failed: ${err?.message || err}`);
            return false;
        }
    },

    async syncToRemote() {
        const local = AlertEngine.getHistory();
        let ok = 0;
        for (const a of local) {
            const res = await this.push(a);
            if (res) ok += 1;
        }
        return ok;
    },

    async resolveIdentityOnRemote(alert, catId, resolvedBy = 'user') {
        try {
            const reviewId = alert?.remoteReviewId || (isUuid(alert?.id) ? alert.id : null);
            if (!reviewId) return false;
            await this._markResolvedReviewId(reviewId);

            const payload = {
                reviewed: true,
                reviewed_at: new Date().toISOString(),
                resolved_by: resolvedBy,
                resolved_cat_id: isUuid(catId) ? catId : null,
            };

            const { error } = await supabase
                .from('ai_cat_identity_review')
                .update(payload)
                .eq('id', reviewId);
            if (error) throw error;

            // Resolve all pending rows in same session to avoid repetitive popups.
            if (alert?.sessionId) {
                await supabase
                    .from('ai_cat_identity_review')
                    .update(payload)
                    .eq('camera_id', alert.cameraId || (await this._getContext()).cameraId)
                    .eq('session_id', alert.sessionId)
                    .eq('reviewed', false);
            }

            // Resolve every local alert that points to this same remote review.
            const history = AlertEngine.getHistory();
            const matches = history.filter((a) =>
                (String(a?.remoteReviewId || '') === String(reviewId) || String(a?.id || '') === String(reviewId))
                && a?.pendingIdentityConfirm === true
            );
            for (const a of matches) {
                await AlertEngine.resolveIdentity(a.id, catId, resolvedBy);
            }

            // Keep alerts table in sync as resolved/read to avoid duplicate popup after re-sync.
            const { userId } = await this._getContext();
            if (userId) {
                const alertResolvedPayload = {
                    resolved: true,
                    is_read: true,
                    updated_at: new Date().toISOString(),
                    cat_id: isUuid(catId) ? catId : null,
                };

                if (isUuid(alert?.id)) {
                    await supabase
                        .from('alerts')
                        .update(alertResolvedPayload)
                        .eq('owner_id', userId)
                        .eq('id', alert.id);
                }

                await supabase
                    .from('alerts')
                    .update(alertResolvedPayload)
                    .eq('owner_id', userId)
                    .contains('metadata', { remoteReviewId: reviewId });

                if (alert?.sessionId) {
                    await supabase
                        .from('alerts')
                        .update(alertResolvedPayload)
                        .eq('owner_id', userId)
                        .eq('session_id', alert.sessionId)
                        .eq('resolved', false);
                }
            }
            return true;
        } catch (err) {
            console.warn(`AlertRepository.resolveIdentityOnRemote failed: ${err?.message || err}`);
            return false;
        }
    },

    async resolveLocalIdentityGroup(alert, catId, resolvedBy = 'user', resolvedCatName = null) {
        const history = AlertEngine.getHistory();
        const sessionId = alert?.sessionId || null;
        const reviewId = String(alert?.remoteReviewId || alert?.id || '');
        const targets = history.filter((a) => {
            if (a?.type !== 'pending_identity') return false;
            if (sessionId && a?.sessionId === sessionId) return true;
            const aid = String(a?.remoteReviewId || a?.id || '');
            return reviewId && aid === reviewId;
        });
        for (const t of targets) {
            await AlertEngine.resolveIdentity(t.id, catId, resolvedBy, resolvedCatName);
        }
    },

    async syncFeedbackUsed() {
        // Kept for compatibility with existing calls
        return 0;
    },

    async resolveOnRemote(alertId) {
        try {
            const { error } = await supabase
                .from('alerts')
                .update({ resolved: true, updated_at: new Date().toISOString() })
                .eq('id', alertId);
            if (error) throw error;
        } catch (err) {
            console.warn(`AlertRepository.resolveOnRemote failed: ${err?.message || err}`);
        }
    },
};

export default AlertRepository;
