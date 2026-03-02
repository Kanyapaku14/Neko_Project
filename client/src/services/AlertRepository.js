import AsyncStorage from '@react-native-async-storage/async-storage';
import AlertEngine, { AlertEvents } from './AlertEngine';
import supabase from '../screens/config/supabaseClient';

const CAMERA_ID_KEY = 'camera_id';

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
        resolvedBy: alert.resolvedBy || null,
        resolvedAt: alert.resolvedAt || null,
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

    async push(alert) {
        try {
            const { userId, cameraId } = await this._getContext();
            if (!userId) return null;

            const payload = mapAlertToDb(alert, userId, cameraId);
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

            const localIds = new Set(AlertEngine.getHistory().map((a) => String(a.id)));

            const { data: dbAlerts, error: alertsError } = await supabase
                .from('alerts')
                .select('*')
                .eq('owner_id', userId)
                .eq('is_deleted', false)
                .order('timestamp', { ascending: false })
                .limit(100);
            if (alertsError) throw alertsError;

            for (const row of (dbAlerts || [])) {
                if (localIds.has(String(row.id))) continue;
                await AlertEngine.logEvent(mapDbAlertToLocal(row));
            }

            if (cameraId) {
                const { data: reviews, error: reviewErr } = await supabase
                    .from('ai_cat_identity_review')
                    .select('*')
                    .eq('camera_id', cameraId)
                    .eq('reviewed', false)
                    .order('occurred_at', { ascending: false })
                    .limit(100);
                if (reviewErr) throw reviewErr;

                for (const row of (reviews || [])) {
                    if (localIds.has(String(row.id))) continue;
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
            return true;
        } catch (err) {
            console.warn(`AlertRepository.resolveIdentityOnRemote failed: ${err?.message || err}`);
            return false;
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
