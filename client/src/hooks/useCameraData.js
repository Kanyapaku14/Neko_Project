import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import supabase from '../screens/config/supabaseClient';
import { analyzeHealthLog } from '../utils/healthLogic';
import AlertEngine from '../services/AlertEngine';
import { CAMERA_API_BASE } from '../config/cameraApi';

const CAMERA_ID_KEY = 'camera_id';
const VIDEO_SERVER_BASE = CAMERA_API_BASE;

const normalizeBehavior = (value) => {
  const v = String(value || '').toLowerCase();
  if (['eat', 'eating', 'food', 'feeding'].includes(v)) return 'eat';
  if (['litter', 'toilet', 'toileting', 'urine', 'stool'].includes(v)) return 'litter';
  if (['sleep', 'rest', 'resting'].includes(v)) return 'sleep';
  if (['abnormal', 'warning', 'critical', 'vomiting', 'vomit', 'barf', 'head_pressing', 'head pressing'].includes(v)) return 'abnormal';
  if (['grooming', 'licking', 'licking_fur'].includes(v)) return 'activity';
  return 'activity';
};

const toLocalDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const startOfDayIso = (d = new Date()) => {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt.toISOString();
};

const hourBinIndex = (iso) => {
  const h = new Date(iso).getHours();
  if (h < 6) return 0;
  if (h < 12) return 1;
  if (h < 18) return 2;
  return 3;
};

export default function useCameraData(session, cameraStatus, selectedCatId = null, options = {}) {
  const cameraOnly = options?.cameraOnly === true;
  const [data, setData] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = useCallback(async () => {
    let newData = {
      connectedAt: Date.now(),
      cats: 0,
      food: 0,
      litter: 0,
      activity: [0, 0, 0, 0, 0],
      posture: {
        abnormal: { percent: 0, name: cameraOnly ? 'No Data' : 'None' },
        normal: { percent: cameraOnly ? 0 : 100, name: cameraOnly ? 'No Data' : 'Normal' }
      },
      behaviorAnalytics: {
        energy: { active: 0, resting: cameraOnly ? 0 : 100 },
        routine: { score: 0, status: 'No Data' },
        wellness: { score: 0, status: 'No Data' }
      },
      meta: {
        source: 'none',
        hasCameraDetections: false,
        lastDetectedAt: null,
      },
      settings: { monitoringMode: 'multi', selectedCats: [] },
      recentActivities: [],
    };

    try {
      const selectedCatsScopedKey = session?.user?.id ? `camera_selectedCats:${session.user.id}` : 'camera_selectedCats';
      const scopedModeKey = session?.user?.id ? `camera_monitoringMode:${session.user.id}` : 'camera_monitoringMode';
      const [mode, savedCats, storedCameraId, suppressPendingRaw] = await Promise.all([
        AsyncStorage.getItem(scopedModeKey),
        AsyncStorage.getItem(selectedCatsScopedKey),
        AsyncStorage.getItem(CAMERA_ID_KEY),
        AsyncStorage.getItem('alerts_suppress_pending'),
      ]);
      const suppressPending = suppressPendingRaw === '1';

      const [legacyMode, legacySavedCats] = await Promise.all([
        AsyncStorage.getItem('camera_monitoringMode'),
        AsyncStorage.getItem('camera_selectedCats'),
      ]);
      const effectiveMode = mode || legacyMode;
      const effectiveSavedCats = savedCats || legacySavedCats;

      let dbMode = null;
      let dbSelectedCats = null;
      let resolvedCameraId = storedCameraId;

      if (session?.user) {
        try {
          if (!resolvedCameraId) {
            const { data: cams } = await supabase
              .from('cameras')
              .select('id, is_primary, created_at')
              .eq('owner_id', session.user.id)
              .order('is_primary', { ascending: false })
              .order('created_at', { ascending: true })
              .limit(1);
            resolvedCameraId = cams?.[0]?.id || null;
          }
          if (resolvedCameraId) {
            const { data: camRow } = await supabase
              .from('cameras')
              .select('mode, ai_mode')
              .eq('id', resolvedCameraId)
              .maybeSingle();
            const rawMode = String(camRow?.ai_mode || camRow?.mode || '').toLowerCase();
            if (rawMode) dbMode = rawMode.includes('single') ? 'single' : 'multi';

            const { data: camCats } = await supabase
              .from('camera_cats')
              .select('cat_id, is_primary, assigned_at')
              .eq('camera_id', resolvedCameraId)
              .order('is_primary', { ascending: false })
              .order('assigned_at', { ascending: true });
            if (Array.isArray(camCats) && camCats.length > 0) {
              dbSelectedCats = camCats.map((r) => r.cat_id);
            }
          }
        } catch (_) { }
      }

      const finalMode = dbMode || effectiveMode || 'multi';
      const finalSelectedCats = Array.isArray(dbSelectedCats)
        ? dbSelectedCats
        : (effectiveSavedCats ? JSON.parse(effectiveSavedCats) : []);

      newData.settings = {
        monitoringMode: finalMode,
        selectedCats: finalSelectedCats,
      };

      if (session?.user && resolvedCameraId) {
        try {
          await AsyncStorage.setItem(scopedModeKey, finalMode);
          await AsyncStorage.setItem('camera_monitoringMode', finalMode);
          await AsyncStorage.setItem(selectedCatsScopedKey, JSON.stringify(finalSelectedCats));
          await AsyncStorage.setItem('camera_selectedCats', JSON.stringify(finalSelectedCats));
          await AsyncStorage.setItem(CAMERA_ID_KEY, resolvedCameraId);
        } catch (_) { }
      }

      if (session?.user) {
        const { data: catsData, error: catError } = await supabase
          .from('cats')
          .select('id')
          .eq('owner_id', session.user.id);

        if (!catError && Array.isArray(catsData)) {
          const catIds = catsData.map((c) => c.id);
          newData.cats = catIds.length;
          if (catIds.length === 1) {
            // Do not force single mode here; let the UI/Banner handle the prompt.
            // But ensure at least the single cat is selected if nothing else is.
            if (!newData.settings.selectedCats?.length) {
              newData.settings.selectedCats = [catIds[0]];
            }
          }

          const selectedIds = selectedCatId
            ? [selectedCatId].filter((id) => catIds.includes(id))
            : (newData.settings.selectedCats?.length
              ? newData.settings.selectedCats.filter((id) => catIds.includes(id))
              : catIds);
          const alertCatIds = catIds;

          const today = toLocalDate();
          const dayStartIso = startOfDayIso();

          let usedAiData = false;
          let usedFallbackData = false;
          if (storedCameraId && selectedIds.length > 0) {
            const [{ data: summaries, error: summaryErr }, { data: events, error: eventErr }] = await Promise.all([
              supabase
                .from('ai_daily_summary')
                .select('*')
                .in('cat_id', selectedIds)
                .eq('summary_date', today),
              supabase
                .from('ai_cat_events')
                .select('id, cat_id, camera_id, behavior_label, behavior_detail, confidence, abnormal, occurred_at')
                .eq('camera_id', storedCameraId)
                .gte('occurred_at', dayStartIso)
                .order('occurred_at', { ascending: false })
                .limit(500),
            ]);

            if (!summaryErr && !eventErr && (Array.isArray(summaries) || Array.isArray(events))) {
              const aiEventsAll = Array.isArray(events) ? events : [];
              const aiEvents = aiEventsAll.filter((e) => e?.cat_id && selectedIds.includes(e.cat_id));
              const aiSummaries = Array.isArray(summaries) ? summaries : [];

              if (aiEvents.length > 0 || aiSummaries.length > 0) {
                usedAiData = true;
                const lastDetectedAt = aiEventsAll[0]?.occurred_at || null;
                newData.meta = {
                  source: 'camera',
                  hasCameraDetections: aiEvents.length > 0,
                  lastDetectedAt,
                };

                const bins = [0, 0, 0, 0];
                let eatCount = 0;
                let litterCount = 0;
                let abnormalCount = 0;

                // à¸à¸²à¸£à¸™à¸±à¸š à¸£à¸¹à¸šà¹à¸šà¸š unique cat_id à¸—à¸µà¹ˆà¸žà¸šà¹ƒà¸™ events
                const detectedCatIds = new Set();
                const litterEventsByCat = {};

                aiEvents.forEach((e) => {
                  const behavior = normalizeBehavior(e.behavior_label);
                  bins[hourBinIndex(e.occurred_at)] += 1;
                  if (behavior === 'eat') eatCount += 1;
                  if (behavior === 'litter') {
                    litterCount += 1;
                    const cid = e.cat_id || 'unknown';
                    litterEventsByCat[cid] = (litterEventsByCat[cid] || 0) + 1;
                  }
                  if (behavior === 'abnormal' || e.abnormal === true) abnormalCount += 1;
                  if (e.cat_id) detectedCatIds.add(e.cat_id);
                });

                // Over-capacity: detected cats exceed the number registered in the account
                const allCatIds = aiEventsAll.map((e) => e?.cat_id).filter(Boolean);
                const uniqueAllCatIds = new Set(allCatIds);
                const observedCount = uniqueAllCatIds.size;
                const allowedCount = alertCatIds.length;
                if (allowedCount > 0 && observedCount > allowedCount) {
                  const unknownIds = [...uniqueAllCatIds].filter((cid) => !alertCatIds.includes(cid));
                  const dedupeKey = `over_capacity:${storedCameraId || 'unknown'}:${toLocalDate()}`;
                  const details = unknownIds.length > 0
                    ? `Unknown IDs: ${unknownIds.slice(0, 3).map((id) => String(id).slice(0, 6)).join(', ')}`
                    : '';
                  AlertEngine.logEvent({
                    type: 'camera_over_capacity',
                    severity: 'warning',
                    title: 'More cats detected than registered',
                    desc: `Detected ${observedCount} cat(s) but the account has ${allowedCount}. Please verify camera assignment.`,
                    details,
                    dedupeKey,
                    cooldownMs: 10 * 60 * 1000,
                  });
                }

                // à¸à¸£à¸“à¸µ DB à¸¡à¸µ cat_id à¸—à¸µà¹ˆ events à¸šà¸­à¸à¸§à¹ˆà¸²à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆà¹à¸¡à¸§à¸‚à¸­à¸‡ user
                const unknownCatEvents = aiEventsAll.filter((e) => e.cat_id && !alertCatIds.includes(e.cat_id));
                let reviewSnaps = [];
                if (storedCameraId) {
                  const { data } = await supabase
                    .from('ai_cat_identity_review')
                    .select('snapshot_url, pred_cat_id, occurred_at')
                    .eq('camera_id', storedCameraId)
                    .not('snapshot_url', 'is', null)
                    .order('occurred_at', { ascending: false })
                    .limit(20);
                  reviewSnaps = Array.isArray(data) ? data : [];
                }
                if (!suppressPending && alertCatIds.length > 0) {
                  const RECENT_IDENTITY_WINDOW_MIN = 60;
                  const recentWindowStart = Date.now() - (RECENT_IDENTITY_WINDOW_MIN * 60 * 1000);
                  const eatLitterEvents = aiEventsAll.filter((e) => {
                    const behavior = normalizeBehavior(e?.behavior_label);
                    if (behavior !== 'eat' && behavior !== 'litter') return false;
                    const cid = e?.cat_id;
                    if (!cid || !alertCatIds.includes(cid)) return false;
                    const ts = new Date(e?.occurred_at || 0).getTime();
                    return Number.isFinite(ts) && ts >= recentWindowStart;
                  });

                  eatLitterEvents.forEach((e) => {
                    const behavior = normalizeBehavior(e?.behavior_label);
                    const eventId = e?.id;
                    if (!eventId) return;
                    const dedupeKey = `identity_event:${storedCameraId || 'unknown'}:${eventId}`;
                    const pendingExists = AlertEngine.getPendingIdentities().some(
                      (a) => String(a?.dedupeKey || '') === dedupeKey || String(a?.sessionId || '') === dedupeKey
                    );
                    if (pendingExists) return;
                    const snap =
                      reviewSnaps?.find((r) => r?.pred_cat_id && String(r.pred_cat_id) === String(e?.cat_id))
                      || reviewSnaps?.[0]
                      || null;
                    AlertEngine.logPendingIdentity({
                      behaviorLabel: behavior,
                      confidence: e?.confidence ?? 0.6,
                      cropSnapshot: snap?.snapshot_url || `${VIDEO_SERVER_BASE}/api/latest_frame.jpg?t=${Date.now()}`,
                      sessionId: dedupeKey,
                      source: 'useCameraData_eat_litter',
                      isAbnormal: false,
                      dedupeKey,
                      cooldownMs: 0,
                      cameraId: storedCameraId || null,
                    });
                  });
                }
                if (!suppressPending && alertCatIds.length > 0 && unknownCatEvents.length > 0) {
                  const unknownIds = [...new Set(unknownCatEvents.map((e) => e.cat_id))];
                  // à¸”à¸¶à¸‡ snapshot à¸ˆà¸²à¸ ai_cat_identity_review
                  if (
                    (alertCatIds.length === 1 && unknownIds.length >= 2) ||
                    (alertCatIds.length >= 2 && unknownIds.length >= alertCatIds.length)
                  ) {
                    // à¸à¸£à¸“à¸µ DB à¸¡à¸µ 1 à¹à¸¡à¸§à¹à¸•à¹ˆà¸à¸¥à¹‰à¸­à¸‡à¸•à¸£à¸§à¸ˆà¹„à¸”à¹‰ 2+ cat_id
                    // à¸‚à¸¶à¹‰à¸™ popup à¹€à¸”à¸µà¸¢à¸§à¹à¸ªà¸”à¸‡ 2 à¸£à¸¹à¸›à¸žà¸£à¹‰à¸­à¸¡à¸à¸±à¸™ à¹ƒà¸«à¹‰à¹€à¸¥à¸·à¸­à¸à¸§à¹ˆà¸²à¸•à¸±à¸§à¹„à¸«à¸™à¸„à¸·à¸­à¹à¸¡à¸§à¹€à¸£à¸²
                    const multiSnapshots = unknownIds.slice(0, 2).map((uid) => {
                      const evt = unknownCatEvents.find((e) => e.cat_id === uid);
                      const snap = reviewSnaps?.find((r) => !r.pred_cat_id || r.pred_cat_id === uid);
                      return {
                        unknownCatId: uid,
                        behaviorLabel: evt?.behavior_label || 'activity',
                        confidence: evt?.confidence ?? 0.5,
                        snapshot_url: snap?.snapshot_url || null,
                      };
                    });
                    const pairDedupeKey = `identity_pair:${storedCameraId}:${unknownIds.slice(0, 4).sort().join('|')}:${alertCatIds.length}`;
                    AlertEngine.logPendingIdentity({
                      behaviorLabel: (alertCatIds.length >= 2 && unknownIds.length === alertCatIds.length) ? 'identity_map' : 'unknown',
                      confidence: 0.5,
                      cropSnapshot: multiSnapshots[0]?.snapshot_url || `${VIDEO_SERVER_BASE}/api/latest_frame.jpg?t=${Date.now()}`,
                      multiSnapshots,   // â† field à¹ƒà¸«à¸¡à¹ˆ: array à¸‚à¸­à¸‡ 2 à¸£à¸¹à¸›
                      sessionId: pairDedupeKey,
                      source: (alertCatIds.length >= 2 && unknownIds.length === alertCatIds.length) ? 'identity_map_exact' : 'useCameraData_dual',
                      isAbnormal: false,
                      dedupeKey: pairDedupeKey,
                      cooldownMs: 15 * 60 * 1000,
                    });
                  } else {
                    // à¸à¸£à¸“à¸µ DB à¸¡à¸µ 2+ à¹à¸¡à¸§: à¸‚à¸¶à¹‰à¸™ popup à¹à¸¢à¸à¸•à¸²à¸¡ cat_id
                    unknownIds.slice(0, 3).forEach((unknownId) => {
                      const sample = unknownCatEvents.find((e) => e.cat_id === unknownId);
                      const snap = reviewSnaps?.find((r) =>
                        !r.pred_cat_id || !alertCatIds.includes(r.pred_cat_id)
                      );
                      const behaviorNorm = normalizeBehavior(sample?.behavior_label);
                      const isAbnormalUnknown = behaviorNorm === 'abnormal';
                      const unknownDedupeKey = `identity_unknown:${storedCameraId}:${unknownId}:${behaviorNorm}`;
                      AlertEngine.logPendingIdentity({
                        behaviorLabel: sample?.behavior_label || 'activity',
                        confidence: sample?.confidence ?? 0.5,
                        cropSnapshot: snap?.snapshot_url || `${VIDEO_SERVER_BASE}/api/latest_frame.jpg?t=${Date.now()}`,
                        sessionId: unknownDedupeKey,
                        source: 'useCameraData_unknown',
                        isAbnormal: isAbnormalUnknown,
                        dedupeKey: unknownDedupeKey,
                        cooldownMs: isAbnormalUnknown ? 60 * 1000 : 10 * 60 * 1000,
                      });
                    });
                  }
                }

                // Multi-cat zone/session confirm:
                // If 2+ cats have eat/litter events in the same recent session window,
                // raise one confirmation alert (with the top 2 cats by count).
                if (!suppressPending && alertCatIds.length >= 2) {
                  const SESSION_WINDOW_MIN = 10;
                  const MIN_SESSION_EVENTS = 3;
                  const windowStartMs = Date.now() - (SESSION_WINDOW_MIN * 60 * 1000);

                  ['eat', 'litter'].forEach((targetBehavior) => {
                    const sessionEvents = aiEventsAll.filter((e) => {
                      const cid = e?.cat_id;
                      if (!cid || !alertCatIds.includes(cid)) return false;
                      if (normalizeBehavior(e?.behavior_label) !== targetBehavior) return false;
                      const ts = new Date(e?.occurred_at || 0).getTime();
                      return Number.isFinite(ts) && ts >= windowStartMs;
                    });

                    if (sessionEvents.length < MIN_SESSION_EVENTS) return;

                    const byCat = {};
                    sessionEvents.forEach((e) => {
                      byCat[e.cat_id] = (byCat[e.cat_id] || 0) + 1;
                    });
                    const ranked = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
                    if (ranked.length < 2) return;

                    const topThree = ranked.slice(0, 3).map(([cid, count]) => ({ cid, count }));
                    const latestTs = Math.max(...sessionEvents.map((e) => new Date(e.occurred_at || 0).getTime()));
                    const sessionBucket = Math.floor(latestTs / (SESSION_WINDOW_MIN * 60 * 1000));
                    const dedupeKey = `identity_zone_session:${storedCameraId}:${targetBehavior}:${sessionBucket}`;

                    const multiSnapshots = topThree.map(({ cid, count }) => {
                      const evt = sessionEvents.find((e) => e?.cat_id === cid);
                      const snap = reviewSnaps?.find((r) => !r.pred_cat_id || r.pred_cat_id === cid);
                      return {
                        unknownCatId: cid,
                        behaviorLabel: targetBehavior,
                        confidence: evt?.confidence ?? 0.5,
                        snapshot_url: snap?.snapshot_url || null,
                        metadata: { session_count: count },
                        count,
                      };
                    });

                    const catCounts = {};
                    ranked.forEach(([cid, count]) => { catCounts[cid] = count; });

                    AlertEngine.logPendingIdentity({
                      behaviorLabel: targetBehavior === 'eat' ? 'feeding_session' : 'litter_session',
                      confidence: 0.5,
                      cropSnapshot: multiSnapshots[0]?.snapshot_url || `${VIDEO_SERVER_BASE}/api/latest_frame.jpg?t=${Date.now()}`,
                      multiSnapshots,
                      sessionId: dedupeKey,
                      source: 'useCameraData_zone_session',
                      isAbnormal: false,
                      dedupeKey,
                      cooldownMs: SESSION_WINDOW_MIN * 60 * 1000,
                      catCounts,
                      identityRule: 'session_count',
                    });
                  });
                }

                // Abnormal behaviors (e.g., vomiting) should prompt identity selection when detected.
                if (!suppressPending) {
                  const RECENT_ABNORMAL_WINDOW_MIN = 60;
                  const nowMs = Date.now();
                  const abnormalEvent = aiEventsAll.find((e) => {
                    const raw = String(e?.behavior_label || '').toLowerCase();
                    const detail = String(e?.behavior_detail || '').toLowerCase();
                    const isAb = normalizeBehavior(raw) === 'abnormal'
                      || ['vomiting', 'vomit', 'barf', 'head_pressing', 'head pressing', 'abnormal'].includes(raw)
                      || ['vomiting', 'vomit', 'barf', 'head_pressing', 'head pressing'].includes(detail);
                    if (!isAb) return false;
                    const ts = new Date(e?.occurred_at || 0).getTime();
                    return Number.isFinite(ts) && (nowMs - ts) <= (RECENT_ABNORMAL_WINDOW_MIN * 60 * 1000);
                  });

                  if (abnormalEvent) {
                    const lastKey = session?.user?.id
                      ? `last_abnormal_event_ts:${session.user.id}:${storedCameraId || 'unknown'}`
                      : `last_abnormal_event_ts:${storedCameraId || 'unknown'}`;
                    const lastTs = Number(await AsyncStorage.getItem(lastKey) || 0);
                    const raw = String(abnormalEvent?.behavior_label || '').toLowerCase();
                    const detail = String(abnormalEvent?.behavior_detail || '').toLowerCase();
                    const behaviorLabel = detail || raw || 'abnormal';
                    
                    const tsMs = new Date(abnormalEvent?.occurred_at || 0).getTime();
                    if (!Number.isFinite(tsMs)) return;
                    const currentTs = tsMs;
                    const cooldownMs = RECENT_ABNORMAL_WINDOW_MIN * 60 * 1000;
                    const lastSeenMs = Number.isFinite(lastTs) ? lastTs : 0;
                    const elapsedMs = nowMs - lastSeenMs;
                    const shouldFire = (currentTs > lastSeenMs) || (elapsedMs >= cooldownMs);

                    if (shouldFire) {
                      const snap = reviewSnaps?.find((r) => !r.pred_cat_id) || reviewSnaps?.[0] || null;
                      const dedupeKey = `abnormal_event:${storedCameraId || 'unknown'}:${currentTs}`;
                      const pendingExists = AlertEngine.getPendingIdentities().some(
                        (a) => String(a?.dedupeKey || '') === dedupeKey || String(a?.sessionId || '') === dedupeKey
                      );
                      if (pendingExists) {
                        await AsyncStorage.setItem(lastKey, String(currentTs));
                        return;
                      }
                      AlertEngine.logPendingIdentity({
                        behaviorLabel,
                        confidence: abnormalEvent?.confidence ?? 0.6,
                        cropSnapshot: snap?.snapshot_url || `${VIDEO_SERVER_BASE}/api/latest_frame.jpg?t=${Date.now()}`,
                        sessionId: dedupeKey,
                        source: 'useCameraData_abnormal',
                        isAbnormal: true,
                        dedupeKey,
                        cooldownMs: RECENT_ABNORMAL_WINDOW_MIN * 60 * 1000,
                        cameraId: storedCameraId || null,
                      });
                      await AsyncStorage.setItem(lastKey, String(currentTs));
                    }
                  }
                }

                // à¸à¸£à¸“à¸µ litter à¹€à¸¢à¸­à¸°à¸¡à¸²à¸ (à¸•à¸±à¹‰à¸‡à¹à¸•à¹ˆ 5 à¸„à¸£à¸±à¹‰à¸‡/à¸§à¸±à¸™) â†’ à¸–à¸²à¸¡à¸§à¹ˆà¸²à¹à¸¡à¸§à¸•à¸±à¸§à¹„à¸«à¸™à¹ƒà¸Šà¹‰à¸¡à¸²à¸à¸ªà¸¸à¸”
                const LITTER_ALERT_THRESHOLD = 5;
                if (litterCount >= LITTER_ALERT_THRESHOLD) {
                  const top = Object.entries(litterEventsByCat).sort((a, b) => b[1] - a[1])[0];
                  const topCatId = top?.[0] || null;
                  const topCount = Number(top?.[1] || 0);
                  const topLabel = topCatId && selectedIds.includes(topCatId) ? `cat ${topCatId.slice(0, 6)}` : 'unknown cat';
                  // ai_cat_events à¹„à¸¡à¹ˆà¸¡à¸µ snapshot_url â€” à¹ƒà¸Šà¹‰ null à¸«à¸£à¸·à¸­à¸”à¸¶à¸‡à¸ˆà¸²à¸ identity_review
                  AlertEngine.logEvent({
                    type: 'litter_summary',
                    severity: 'info',
                    title: 'Litter activity summary',
                    desc: `High litter activity detected today. Most frequent: ${topLabel} (${topCount} events).`,
                    details: 'Summary alert (batched) to reduce repeated prompts.',
                    source: 'litter_anomaly_summary',
                    dedupeKey: `litter_summary:${storedCameraId}:${toLocalDate()}`,
                    cooldownMs: 20 * 60 * 1000,
                  });
                }

                const maxBin = Math.max(1, ...bins);
                const normalizedBins = bins.map((v) => Math.round((v / maxBin) * 100));
                // 5 points for chart labels [00,06,12,18,24], keep last point as normalized closing value.
                newData.activity = [...normalizedBins, normalizedBins[3]];
                newData.food = eatCount;
                newData.litter = litterCount;

                const summaryAbnormal = aiSummaries.reduce((sum, s) => sum + (s.total_abnormal || 0), 0);
                const totalSignals = Math.max(aiEventsAll.length, eatCount + litterCount + summaryAbnormal);
                const abnormalPct = Math.min(100, Math.round(((abnormalCount + summaryAbnormal) / Math.max(1, totalSignals)) * 100));
                const normalPct = 100 - abnormalPct;

                newData.posture = {
                  normal: {
                    percent: normalPct,
                    name: normalPct >= 80 ? 'Normal' : 'Low Activity'
                  },
                  abnormal: {
                    percent: abnormalPct,
                    name: abnormalPct > 0 ? 'At Risk' : 'None'
                  }
                };

                const totalFeedSummary = aiSummaries.reduce((sum, s) => sum + (s.total_feeding || 0), 0);
                const totalLitterSummary = aiSummaries.reduce((sum, s) => sum + (s.total_litter || 0), 0);
                const totalFeed = totalFeedSummary > 0 ? totalFeedSummary : eatCount;
                const totalLitter = totalLitterSummary > 0 ? totalLitterSummary : litterCount;
                const routineScore = Math.max(55, 100 - abnormalPct);
                const wellnessScore = Math.max(45, Math.round((routineScore + normalPct) / 2));

                newData.behaviorAnalytics = {
                  energy: { active: Math.max(10, normalPct), resting: Math.max(0, 100 - Math.max(10, normalPct)) },
                  routine: { score: routineScore, status: routineScore >= 85 ? 'Ideal' : routineScore >= 70 ? 'Stable' : 'Watch' },
                  wellness: { score: wellnessScore, status: wellnessScore >= 80 ? 'Healthy' : wellnessScore >= 60 ? 'Monitor' : 'At Risk' },
                  totals: { feeding: totalFeed, litter: totalLitter },
                };

                // à¸ªà¸£à¹‰à¸²à¸‡ recentActivities à¸”à¹‰à¸§à¸¢ icon/color à¸—à¸µà¹ˆà¸–à¸¹à¸à¸•à¹‰à¸­à¸‡ à¸„à¸£à¸šà¸—à¸¸à¸ behavior
                const behaviorDisplay = (b, detail) => {
                  const raw = String(b || '').toLowerCase();
                  const det = String(detail || '').toLowerCase();
                  const hint = det || raw;
                  if (hint === 'head_pressing' || hint === 'head pressing') return { label: 'Head Pressing', icon: 'alert', color: '#EF4444' };
                  if (raw === 'grooming') return { label: 'Grooming', icon: 'cat', color: '#4DB6AC' };
                  if (raw === 'vomiting' || raw === 'vomit' || raw === 'barf') return { label: 'Vomiting', icon: 'emoticon-sick', color: '#EF4444' };
                  if (det === 'grooming') return { label: 'Grooming', icon: 'cat', color: '#4DB6AC' };
                  if (det === 'vomiting' || det === 'vomit' || det === 'barf') return { label: 'Vomiting', icon: 'emoticon-sick', color: '#EF4444' };
                  switch (normalizeBehavior(raw)) {
                    case 'eat': return { label: 'Eating', icon: 'food-apple', color: '#81C784' };
                    case 'litter': return { label: 'Litter Box', icon: 'emoticon-poop', color: '#BA68C8' };
                    case 'sleep': return { label: 'Sleeping', icon: 'sleep', color: '#90A4AE' };
                    case 'abnormal': return { label: 'Alert', icon: 'alert-circle', color: '#EF4444' };
                    default: return { label: 'Activity', icon: 'run', color: '#FFB74D' };
                  }
                };
                newData.recentActivities = aiEventsAll.slice(0, 8).map((e, idx) => {
                  const disp = behaviorDisplay(e.behavior_label, e.behavior_detail);
                  return {
                    id: e.id || `evt_${idx}`,
                    type: disp.label,
                    time: new Date(e.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    icon: disp.icon,
                    color: disp.color,
                  };
                });
              }
            }
          }

          // Fallback: previous local daily_logs analytics if AI tables are not populated yet
          if (!usedAiData && !cameraOnly && catIds.length > 0) {
            const { data: logs, error: logsError } = await supabase
              .from('daily_logs')
              .select(`
                *,
                normal_logs(*),
                something_off_logs(*),
                meal_logs(*)
              `)
              .in('cat_id', catIds)
              .eq('log_date', today);

            if (!logsError && logs && logs.length > 0) {
              usedFallbackData = true;
              let totalFood = 0;
              let totalLitter = 0;
              let worstAnalysis = null;
              let latestLogForPosture = null;

              logs.forEach((log) => {
                const details = log.log_type === 'something_off'
                  ? (log.something_off_logs?.[0] || log.something_off_logs)
                  : (log.normal_logs?.[0] || log.normal_logs);

                const unifiedLog = { ...log, ...(details || {}) };
                
                const mealLogs = log.meal_logs ? (Array.isArray(log.meal_logs) ? log.meal_logs : [log.meal_logs]) : [];
                const calcFood = mealLogs.length > 0 
                  ? mealLogs.reduce((sum, meal) => sum + (Number(meal.amount_grams) || 0), 0)
                  : (unifiedLog.total_food_grams || 0);

                totalFood += Number(calcFood);

                if (unifiedLog.urine_level || unifiedLog.stool_level) {
                  totalLitter += 1;
                }

                const analysis = analyzeHealthLog(unifiedLog);
                if (!worstAnalysis || analysis.redFlags > worstAnalysis.redFlags || analysis.score < worstAnalysis.score) {
                  worstAnalysis = analysis;
                  latestLogForPosture = unifiedLog;
                }
              });

              newData.food = totalFood;
              newData.litter = totalLitter;

              if (worstAnalysis && latestLogForPosture) {
                if (worstAnalysis.redFlags > 0) {
                  newData.posture.abnormal = {
                    percent: worstAnalysis.score < 50 ? 80 : 40,
                    name: latestLogForPosture.behavior || worstAnalysis.alerts[0] || 'At Risk',
                  };
                  newData.posture.normal = {
                    percent: 100 - newData.posture.abnormal.percent,
                    name: 'Low Activity',
                  };
                } else {
                  newData.posture.normal = {
                    percent: worstAnalysis.score,
                    name: latestLogForPosture.behavior === 'normal' ? 'Active' : (latestLogForPosture.behavior || 'Normal'),
                  };
                  newData.posture.abnormal = {
                    percent: 100 - worstAnalysis.score,
                    name: 'None',
                  };
                }
              }
            }
          }

          if (!usedAiData && !usedFallbackData) {
            newData.recentActivities = [];
            newData.behaviorAnalytics = {
              energy: { active: 0, resting: cameraOnly ? 0 : 100 },
              routine: { score: 0, status: 'No Data' },
              wellness: { score: 0, status: 'No Data' },
            };
            newData.activity = [0, 0, 0, 0, 0];
            newData.food = 0;
            newData.litter = 0;
            newData.posture = {
              normal: { percent: cameraOnly ? 0 : 100, name: 'No Data' },
              abnormal: { percent: 0, name: cameraOnly ? 'No Data' : 'None' },
            };
          }
        }
      }

      setData(newData);
      setLastUpdated(new Date());
    } catch (e) {
      console.error('Error fetching camera data:', e);
      setData((prev) => prev || newData);
    }
  }, [session, cameraStatus, selectedCatId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, lastUpdated, refetch: fetchData };
}

