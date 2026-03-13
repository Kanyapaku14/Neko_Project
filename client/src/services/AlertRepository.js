import AsyncStorage from '@react-native-async-storage/async-storage';
import AlertEngine, { AlertEvents } from './AlertEngine';
import supabase from '../screens/config/supabaseClient';

const CAMERA_ID_KEY = 'camera_id';
const RESOLVED_REVIEW_IDS_KEY_PREFIX = 'resolved_identity_review_ids';

const isUuid = (value) =>
    typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const ABNORMAL_BEHAVIOR_SET = new Set(['vomiting', 'head_pressing', 'abnormal']);

const isAbnormalBehavior = (label) => ABNORMAL_BEHAVIOR_SET.has(
    String(label || '').toLowerCase().trim()
);

const normalizeBehaviorLabel = (label) => {
    const v = String(label || '').toLowerCase().trim();
    if (['eat', 'eating', 'food', 'feeding'].includes(v)) return 'eat';
    if (['litter', 'toilet', 'toileting', 'urine', 'stool'].includes(v)) return 'litter';
    if (['sleep', 'rest', 'resting'].includes(v)) return 'sleep';
    if (['activity', 'active', 'play', 'playing', 'grooming'].includes(v)) return 'activity';
    if (['vomiting', 'vomit'].includes(v)) return 'vomiting';
    if (['head_pressing', 'head-pressing', 'head pressing'].includes(v)) return 'head_pressing';
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
        isForeignCatAlert: alert.isForeignCatAlert === true,
        multiSnapshots: Array.isArray(alert.multiSnapshots) ? alert.multiSnapshots : null,
        identityRule: alert.identityRule || null,
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
    cameraId: row.camera_id || null,
    source: row.source || null,
    sessionId: row.session_id || (row?.metadata?.pendingIdentityConfirm ? row.id : null),
    pendingIdentityConfirm: row?.metadata?.pendingIdentityConfirm === true,
    behaviorLabel: row?.metadata?.behaviorLabel || null,
    behaviorDetail: row?.metadata?.behavior_detail || row?.metadata?.behaviorDetail || null,
    confidence: row?.metadata?.confidence ?? null,
    cropSnapshot: row?.metadata?.cropSnapshot || null,
    isAbnormal: row?.metadata?.isAbnormal === true,
    resolvedBy: row?.metadata?.resolvedBy || null,
    resolvedAt: row?.metadata?.resolvedAt || null,
    resolvedCatName: row?.metadata?.resolvedCatName || null,
    resolutionText: row?.metadata?.resolutionText || row?.metadata?.resolution_text || null,
    resolvedCatId: row.cat_id || null,
    _fromRemote: true,
});

const mapIdentityReviewToLocalAlert = (row) => {
    const confidencePct = row.confidence != null ? Math.round(Number(row.confidence) * 100) : null;
    const confidenceStr = confidencePct != null ? ` (${confidencePct}% confidence)` : '';
    const behavior = normalizeBehaviorLabel(row.behavior_detail || row.behavior_label);
    const abnormal = isAbnormalBehavior(behavior)
        || isAbnormalBehavior(row?.behavior_detail)
        || row?.metadata?.is_abnormal === true;
    return {
        id: row.id,
        type: 'pending_identity',
        // Use 'critical' for abnormal behaviors so GlobalAlertQueue Tier-1 fires immediately
        severity: abnormal ? 'critical' : 'info',
        title: abnormal
            ? 'Abnormal behavior detected - Please identify the cat'
            : 'Behavior detected - Please identify the cat',
        desc: `Detected "${behavior}"${confidenceStr}, but the system is not sure which cat it is. Please identify the cat.`,
        details: row.source ? `From model: ${row.source}` : '',
        timestamp: row.occurred_at || row.created_at || new Date().toISOString(),
        pendingIdentityConfirm: row.reviewed !== true,
        behaviorLabel: behavior,
        behaviorDetail: row?.behavior_detail || null,
        confidence: row.confidence ?? null,
        cropSnapshot: row.snapshot_url || null,
        // cat_vote_counts from Python backend — {cat_uuid: count} — used for detection count badges
        catCounts: (row?.metadata?.cat_vote_counts && typeof row.metadata.cat_vote_counts === 'object')
            ? row.metadata.cat_vote_counts : null,
        multiSnapshots: Array.isArray(row?.metadata?.multi_snapshots)
            ? row.metadata.multi_snapshots.map((s) => (typeof s === 'string' ? { path: s } : s))
            : null,
        isForeignCatAlert: row?.metadata?.is_foreign_cat_alert === true,
        identityRule: row?.metadata?.rule || null,
        sessionId: row.session_id || row.id || null,
        source: row.source || null,
        cameraId: row.camera_id || null,
        resolvedCatId: row.resolved_cat_id || null,
        resolvedBy: row.resolved_by || null,
        resolvedCatName: row?.metadata?.resolved_cat_name || null,
        resolvedAt: row.reviewed_at || null,
        remoteReviewId: row.id,
        isAbnormal: abnormal,
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

    // Derives a stable AsyncStorage key for resolved review IDs using only userId.
    // IMPORTANT: do NOT include cameraId — it may be null on first sync causing key mismatch.
    async _resolvedKey() {
        const { userId } = await this._getContext();
        if (!userId) return null;
        return `${RESOLVED_REVIEW_IDS_KEY_PREFIX}:user:${userId}`;
    },

    async _getResolvedReviewIds() {
        try {
            const key = await this._resolvedKey();
            if (!key) return new Set();
            const raw = await AsyncStorage.getItem(key);
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
            const key = await this._resolvedKey();
            if (!key) return;
            const set = await this._getResolvedReviewIds();
            set.add(String(reviewId));
            // Cap to 500 entries to keep AsyncStorage lean (oldest entries drop off).
            const arr = Array.from(set);
            const capped = arr.length > 500 ? arr.slice(arr.length - 500) : arr;
            await AsyncStorage.setItem(key, JSON.stringify(capped));
        } catch (e) {
            // no-op
        }
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

            // --- CRITICAL: Sync remote UUID back to local alert ID ---
            // This prevents duplicate entries on the next syncFromRemote cycle.
            if (data?.id && String(alert.id) !== String(data.id)) {
                console.log(`AlertRepository: Syncing local ID [${alert.id}] to remote UUID [${data.id}]`);
                if (AlertEngine.patchAlert) {
                    await AlertEngine.patchAlert(alert.id, { id: data.id, _fromRemote: true });
                }
            }

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
            // NOTE: do NOT set _resolvedReviewIdsKey here — key is now derived lazily in _resolvedKey().
            const suppressPending = (await AsyncStorage.getItem('alerts_suppress_pending')) === '1';

            let cameraOnline = true;
            if (cameraId) {
                try {
                    const { data: camRow } = await supabase
                        .from('cameras')
                        .select('ai_connection_status')
                        .eq('id', cameraId)
                        .maybeSingle();
                    const status = String(camRow?.ai_connection_status || '').toLowerCase();
                    if (status && status !== 'online') cameraOnline = false;
                } catch (_) { }
            }

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

            // Process ascending so unshift puts newest alerts at the top instead of oldest
            for (const row of (dbAlerts || []).slice().reverse()) {
                if (!cameraOnline && cameraId && String(row?.camera_id || '') === String(cameraId || '')) {
                    // Ignore camera alerts while camera server is offline/disconnected.
                    continue;
                }
                if (row?.metadata?.pendingIdentityConfirm === true) continue;
                
                // Let AlertEngine.logEvent handle deduplication and merging (including isRead status)
                await AlertEngine.logEvent(mapDbAlertToLocal(row));

                // Fallback: abnormal alerts should open identity picker even if no review row exists.
                const isAbnormalAlert = String(row?.type || '').toLowerCase() === 'behavior_abnormal';
                const rawBehavior = String(row?.metadata?.behavior || row?.metadata?.behaviorLabel || row?.metadata?.behavior_label || '');
                const behavior = normalizeBehaviorLabel(rawBehavior);
                if (!suppressPending && isAbnormalAlert && behavior) {
                    const sid = `abnormal_alert:${row.id}`;
                    const already = AlertEngine.getPendingIdentities().some((a) => a?.sessionId === sid);
                    if (!already) {
                        await AlertEngine.logPendingIdentity({
                            behaviorLabel: behavior,
                            confidence: row?.metadata?.confidence ?? null,
                            cropSnapshot: row?.metadata?.cropSnapshot || null,
                            multiSnapshots: row?.metadata?.multi_snapshots || null,
                            sessionId: sid,
                            source: row?.source || 'alerts_table',
                            isAbnormal: true,
                            dedupeKey: `abnormal_identity:${row.id}`,
                            cooldownMs: 48 * 60 * 60 * 1000,
                        });
                    }
                }
            }

            if (cameraId && cameraOnline && !suppressPending) {
                const recentIso = new Date(Date.now() - (48 * 60 * 60 * 1000)).toISOString();
                const { data: reviews, error: reviewErr } = await supabase
                    .from('ai_cat_identity_review')
                    .select('*')
                    .eq('camera_id', cameraId)
                    .eq('reviewed', false)
                    .gte('occurred_at', recentIso)
                    .order('occurred_at', { ascending: false })
                    .limit(200);
                if (reviewErr) throw reviewErr;

                // --- Session-based deduplication ---
                // Group rows by session_id. If no session_id, treat each row as its own session.
                // Pick the NEWEST row per session as the representative.
                const sessionMap = new Map(); // sessionKey → representative row
                for (const row of (reviews || [])) {
                    const sessionKey = row.session_id
                        ? `session:${row.session_id}`
                        : `row:${row.id}`;
                    
                    // Specific check: if this session/row is already in unresolved review IDs set, skip
                    if (resolvedReviewIds.has(String(row.id))) continue;

                    const prev = sessionMap.get(sessionKey);
                    const rowTs = new Date(row.occurred_at || row.created_at || 0).getTime();
                    const prevTs = prev ? new Date(prev.occurred_at || prev.created_at || 0).getTime() : -1;
                    if (!prev || rowTs >= prevTs) sessionMap.set(sessionKey, row);
                }

                // Filter out already-handled sessions.
                let newSessions = [];
                for (const row of sessionMap.values()) {
                    if (localIds.has(String(row.id))) continue;
                    if (localRemoteReviewIds.has(String(row.id))) continue;
                    
                    // Also check if ANY row of this session is already in local engine.
                    if (row.session_id) {
                        const sessionAlreadyLocal = AlertEngine.getHistory().some(
                            (a) => String(a?.sessionId) === String(row.session_id) || String(a?.remoteReviewId) === String(row.id)
                        );
                        if (sessionAlreadyLocal) continue;
                    }
                    newSessions.push(row);
                }

                // Import at most 2 new sessions per sync cycle to avoid notification bursts.
                const toImport = newSessions.slice(0, 2);
                for (const row of toImport) {
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

    async resolveIdentityOnRemote(alert, catId, resolvedBy = 'user', resolvedCatName = null) {
        try {
            const reviewId = alert?.remoteReviewId || (isUuid(alert?.id) ? alert.id : null);
            const sessionId = alert?.sessionId || null;
            if (!reviewId && !sessionId) return false;
            await this._markResolvedReviewId(reviewId);

            const resolvedName = resolvedCatName || alert?.resolvedCatName || null;
            const resolvedLabel = resolvedBy === 'skipped'
                ? (resolvedName || (catId ? `Cat ${catId}` : 'Skipped'))
                : (resolvedName || (catId ? `Cat ${catId}` : 'Unknown cat'));
            const lowerLabel = String(resolvedLabel).toLowerCase();
            const resolutionText = resolvedBy === 'skipped'
                ? (lowerLabel.includes('not a cat')
                    ? 'Marked as not a cat.'
                    : (lowerLabel.includes('not your cat') || lowerLabel.includes('not my cat')
                        ? 'Marked as not your cat.'
                        : 'Marked as skipped.'))
                : (resolvedName ? `Selected cat: ${resolvedName}.` : (catId ? `Selected cat ID: ${catId}.` : 'Identity confirmed.'));

            const payload = {
                reviewed: true,
                reviewed_at: new Date().toISOString(),
                resolved_by: resolvedBy,
                resolved_cat_id: isUuid(catId) ? catId : null,
                metadata: {
                    ...(alert?.metadata || {}), // PRESERVE existing metadata like multiSnapshots
                    ...(resolvedName ? { resolved_cat_name: resolvedName } : {}),
                    resolution_text: resolutionText,
                    resolutionText,
                    resolved_by: resolvedBy,
                },
            };

            if (reviewId) {
                const { error } = await supabase
                    .from('ai_cat_identity_review')
                    .update(payload)
                    .eq('id', reviewId);
                if (error) throw error;
            }

            // Also mark the source alert row as read if it came from the 'alerts' table
            const alertTableId = alert?.id;
            if (alertTableId && isUuid(alertTableId)) {
                await supabase
                    .from('alerts')
                    .update({ is_read: true, reviewed: true, metadata: payload.metadata })
                    .eq('id', alertTableId);
            }

            // Resolve all pending rows in same session to avoid repetitive popups.
            if (sessionId) {
                await supabase
                    .from('ai_cat_identity_review')
                    .update(payload)
                    .eq('camera_id', alert.cameraId || (await this._getContext()).cameraId)
                    .eq('session_id', sessionId)
                    .eq('reviewed', false);
            }

            // Patch local alerts that point to this review.
            const history = AlertEngine.getHistory();
            const matches = history.filter((a) =>
                (String(a?.remoteReviewId || '') === String(reviewId) || String(a?.id || '') === String(reviewId))
                && (a?.pendingIdentityConfirm === true || a?.resolvedBy === 'skipped' || (a?.type === 'pending_identity' && !!a?.resolvedBy))
            );
            for (const a of matches) {
                await AlertEngine.resolveIdentity(a.id, catId, resolvedBy, resolvedCatName);
            }

            // --- RECOVERY: Insert Behavior Event into Analytics (ai_cat_events) ---
            // When a user manually identifies a cat, this behavior was likely NOT recorded in the detection loop 
            // (because it was tagged as "anonymous" or "unknown" at that time).
            // We insert it now so the Dashboard/Analytics shows this behavior for the correct cat.
            if (resolvedBy === 'user' && isUuid(catId)) {
                try {
                    const ctx = await this._getContext();
                    const cameraId = alert?.cameraId || ctx.cameraId;
                    const behavior = normalizeBehaviorLabel(alert?.behaviorLabel || 'activity');
                    const timestamp = alert?.timestamp || new Date().toISOString();
                    
                    if (cameraId) {
                        await supabase
                            .from('ai_cat_events')
                            .insert({
                                camera_id: cameraId,
                                cat_id: catId,
                                behavior: behavior,
                                behavior_detail: alert?.behaviorDetail || behavior,
                                confidence: alert?.confidence ?? 1.0,
                                occurred_at: timestamp,
                                metadata: {
                                    source: 'manual_resolution',
                                    original_review_id: reviewId,
                                    original_session_id: sessionId
                                }
                            });
                    }
                } catch (e) {
                    console.warn(`AlertRepository: failed to backfill behavior event: ${e?.message}`);
                }
            }

            // Keep alerts table in sync.
            const ctx = await this._getContext();
            const userId = ctx.userId;
            const cameraId = ctx.cameraId;
            if (userId) {
                const alertMetaUpdate = {
                    ...(alert?.metadata || {}),
                    ...(resolvedName ? { resolved_cat_name: resolvedName } : {}),
                    resolution_text: resolutionText,
                    resolutionText,
                    resolved_by: resolvedBy,
                    resolvedBy: resolvedBy,
                    resolvedAt: new Date().toISOString(),
                };

                const alertResolvedPayload = {
                    resolved: true,
                    is_read: true,
                    updated_at: new Date().toISOString(),
                    cat_id: isUuid(catId) ? catId : null,
                    metadata: alertMetaUpdate
                };

                const orFilters = [];
                if (isUuid(alert?.id)) orFilters.push(`id.eq.${alert.id}`);
                if (reviewId) orFilters.push(`metadata->>remoteReviewId.eq.${reviewId}`);
                if (alert?.sessionId) orFilters.push(`session_id.eq.${alert.sessionId}`);
                if (orFilters.length > 0) {
                    await supabase
                        .from('alerts')
                        .update(alertResolvedPayload)
                        .eq('owner_id', userId)
                        .or(orFilters.join(','));
                }
            }
            // Suppress re-prompting abnormal events after user resolves.
            try {
                const isAbnormal = alert?.isAbnormal === true
                    || String(alert?.behaviorLabel || '').toLowerCase() === 'abnormal'
                    || String(alert?.behaviorDetail || '').toLowerCase() === 'abnormal'
                    || String(alert?.severity || '').toLowerCase() === 'critical';
                if (resolvedBy === 'user' && isAbnormal) {
                    const tsMs = new Date(alert?.timestamp || Date.now()).getTime();
                    const key = userId
                        ? `last_abnormal_event_ts:${userId}:${alert?.cameraId || cameraId || 'unknown'}`
                        : `last_abnormal_event_ts:${alert?.cameraId || cameraId || 'unknown'}`;
                    await AsyncStorage.setItem(key, String(Number.isFinite(tsMs) ? tsMs : Date.now()));
                }
            } catch (_) { }
            return true;
        } catch (err) {
            console.warn(`AlertRepository.resolveIdentityOnRemote failed: ${err?.message || err}`);
            return false;
        }
    },

    async updateReviewSnapshots(alert, nextSnapshots = []) {
        try {
            const reviewId = alert?.remoteReviewId || (isUuid(alert?.id) ? alert.id : null);
            const sessionId = alert?.sessionId || null;
            if (!reviewId && !sessionId) return false;
            const { data: row, error } = await supabase
                .from('ai_cat_identity_review')
                .select('metadata')
                .eq('id', reviewId || '')
                .maybeSingle();
            if (error) throw error;
            const metadata = {
                ...(row?.metadata || {}),
                ...(alert?.remoteReviewId ? { remoteReviewId: alert.remoteReviewId } : {}),
                multi_snapshots: Array.isArray(nextSnapshots) ? nextSnapshots : [],
                user_filtered_snapshots: true,
                filtered_at: new Date().toISOString(),
            };
            if (reviewId) {
                await supabase
                    .from('ai_cat_identity_review')
                    .update({ metadata })
                    .eq('id', reviewId);
            }
            if (sessionId) {
                await supabase
                    .from('ai_cat_identity_review')
                    .update({ metadata })
                    .eq('camera_id', alert.cameraId || (await this._getContext()).cameraId)
                    .eq('session_id', sessionId);
            }
            const { userId, cameraId } = await this._getContext();
            if (userId) {
                await supabase
                    .from('alerts')
                    .update({ metadata })
                    .eq('owner_id', userId)
                    .or(`metadata->>remoteReviewId.eq.${reviewId || ''},session_id.eq.${sessionId || ''}`);
            }
            return true;
        } catch (err) {
            console.warn(`AlertRepository.updateReviewSnapshots failed: ${err?.message || err}`);
            return false;
        }
    },

    async discardSessionOnRemote(alert, reasonLabel = 'Not a cat') {
        try {
            const reviewId = alert?.remoteReviewId || (isUuid(alert?.id) ? alert.id : null);
            const sessionId = alert?.sessionId || null;
            if (!reviewId && !sessionId) return false;

            const nowIso = new Date().toISOString();
            const resolutionText = reasonLabel === 'Not your cat'
                ? 'Marked as not your cat.'
                : 'Marked as not a cat.';
            const payload = {
                reviewed: true,
                reviewed_at: nowIso,
                resolved_by: 'skipped',
                resolved_cat_id: null,
                metadata: {
                    ...(alert?.metadata || {}),
                    session_deleted: true,
                    resolution_text: resolutionText,
                    resolutionText,
                    resolved_by: 'skipped',
                },
            };

            if (reviewId) {
                await supabase
                    .from('ai_cat_identity_review')
                    .update(payload)
                    .eq('id', reviewId);
            }
            if (sessionId) {
                await supabase
                    .from('ai_cat_identity_review')
                    .update(payload)
                    .eq('camera_id', alert.cameraId || (await this._getContext()).cameraId)
                    .eq('session_id', sessionId);
            }

            const ctx = await this._getContext();
            if (ctx.userId) {
                await supabase
                    .from('alerts')
                    .update({
                        resolved: true,
                        is_read: true,
                        updated_at: nowIso,
                        metadata: {
                            ...(alert?.metadata || {}),
                            session_deleted: true,
                            resolution_text: resolutionText,
                            resolutionText,
                            resolved_by: 'skipped',
                        },
                    })
                    .eq('owner_id', ctx.userId)
                    .eq('session_id', sessionId || alert.sessionId || '');
            }

            // Mark in AsyncStorage so syncFromRemote won't re-import this review row.
            await this._markResolvedReviewId(reviewId);

            // Resolve locally (don't delete — keeps alert in localIds so syncFromRemote skips it).
            await this.resolveLocalIdentityGroup(alert, null, 'skipped', reasonLabel);

            // Clear local snapshots so Event Detail edit won't show stale images.
            if (AlertEngine.patchAlert) {
                const history = AlertEngine.getHistory();
                history.forEach((a) => {
                    const matchSession = sessionId && a?.sessionId === sessionId;
                    const matchReview = reviewId && (String(a?.remoteReviewId || '') === String(reviewId) || String(a?.id || '') === String(reviewId));
                    if (matchSession || matchReview) {
                        AlertEngine.patchAlert(a.id, {
                            cropSnapshot: null,
                            snapshotUrl: null,
                            multiSnapshots: [],
                            metadata: { ...(a?.metadata || {}), session_deleted: true },
                        });
                    }
                });
            }
            return true;
        } catch (err) {
            console.warn(`AlertRepository.discardSessionOnRemote failed: ${err?.message || err}`);
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

    async markReadOnRemote(alertId) {
        try {
            if (!alertId) return;
            const { error } = await supabase
                .from('alerts')
                .update({ is_read: true, updated_at: new Date().toISOString() })
                .eq('id', alertId);
            if (error) throw error;
        } catch (err) {
            console.warn(`AlertRepository.markReadOnRemote failed: ${err?.message || err}`);
        }
    },

    async markAllReadOnRemote() {
        try {
            const { userId } = await this._getContext();
            if (!userId) return;
            const { error } = await supabase
                .from('alerts')
                .update({ is_read: true, updated_at: new Date().toISOString() })
                .eq('owner_id', userId)
                .eq('is_read', false);
            if (error) throw error;
        } catch (err) {
            console.warn(`AlertRepository.markAllReadOnRemote failed: ${err?.message || err}`);
        }
    },
};

export default AlertRepository;
