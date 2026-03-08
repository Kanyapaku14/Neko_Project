import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import supabase from '../screens/config/supabaseClient';
import { analyzeHealthLog } from '../utils/healthLogic';
import AlertEngine from '../services/AlertEngine';

const CAMERA_ID_KEY = 'camera_id';
const VIDEO_SERVER_BASE = 'http://192.168.1.100:5000';

const normalizeBehavior = (value) => {
  const v = String(value || '').toLowerCase();
  if (['eat', 'eating', 'food', 'feeding'].includes(v)) return 'eat';
  if (['litter', 'toilet', 'toileting', 'urine', 'stool'].includes(v)) return 'litter';
  if (['sleep', 'rest', 'resting'].includes(v)) return 'sleep';
  if (['abnormal', 'warning', 'critical'].includes(v)) return 'abnormal';
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

export default function useCameraData(session, cameraStatus) {
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
        abnormal: { percent: 0, name: 'None' },
        normal: { percent: 100, name: 'Normal' }
      },
      behaviorAnalytics: {
        energy: { active: 0, resting: 100 },
        routine: { score: 0, status: 'No Data' },
        wellness: { score: 0, status: 'No Data' }
      },
      settings: { monitoringMode: 'multi', selectedCats: [] },
      recentActivities: [],
    };

    try {
      const [mode, savedCats, storedCameraId] = await Promise.all([
        AsyncStorage.getItem('camera_monitoringMode'),
        AsyncStorage.getItem('camera_selectedCats'),
        AsyncStorage.getItem(CAMERA_ID_KEY),
      ]);

      newData.settings = {
        monitoringMode: mode || 'multi',
        selectedCats: savedCats ? JSON.parse(savedCats) : []
      };

      if (session?.user) {
        const { data: catsData, error: catError } = await supabase
          .from('cats')
          .select('id')
          .eq('owner_id', session.user.id);

        if (!catError && Array.isArray(catsData)) {
          const catIds = catsData.map((c) => c.id);
          newData.cats = catIds.length;

          const selectedIds = newData.settings.selectedCats?.length
            ? newData.settings.selectedCats.filter((id) => catIds.includes(id))
            : catIds;

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
                .select('id, cat_id, camera_id, behavior_label, confidence, abnormal, occurred_at')
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

                const bins = [0, 0, 0, 0];
                let eatCount = 0;
                let litterCount = 0;
                let abnormalCount = 0;

                // การนับ รูบแบบ unique cat_id ที่พบใน events
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

                // กรณี DB มี cat_id ที่ events บอกว่าไม่ใช่แมวของ user
                const unknownCatEvents = aiEventsAll.filter((e) => e.cat_id && !selectedIds.includes(e.cat_id));
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
                if (selectedIds.length > 0 && unknownCatEvents.length > 0) {
                  const unknownIds = [...new Set(unknownCatEvents.map((e) => e.cat_id))];
                  // ดึง snapshot จาก ai_cat_identity_review
                  if (
                    (selectedIds.length === 1 && unknownIds.length >= 2) ||
                    (selectedIds.length >= 2 && unknownIds.length >= selectedIds.length)
                  ) {
                    // กรณี DB มี 1 แมวแต่กล้องตรวจได้ 2+ cat_id
                    // ขึ้น popup เดียวแสดง 2 รูปพร้อมกัน ให้เลือกว่าตัวไหนคือแมวเรา
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
                    const pairDedupeKey = `identity_pair:${storedCameraId}:${unknownIds.slice(0, 4).sort().join('|')}:${selectedIds.length}`;
                    AlertEngine.logPendingIdentity({
                      behaviorLabel: (selectedIds.length >= 2 && unknownIds.length === selectedIds.length) ? 'identity_map' : 'unknown',
                      confidence: 0.5,
                      cropSnapshot: multiSnapshots[0]?.snapshot_url || `${VIDEO_SERVER_BASE}/api/latest_frame.jpg?t=${Date.now()}`,
                      multiSnapshots,   // ← field ใหม่: array ของ 2 รูป
                      sessionId: pairDedupeKey,
                      source: (selectedIds.length >= 2 && unknownIds.length === selectedIds.length) ? 'identity_map_exact' : 'useCameraData_dual',
                      isAbnormal: false,
                      dedupeKey: pairDedupeKey,
                      cooldownMs: 15 * 60 * 1000,
                    });
                  } else {
                    // กรณี DB มี 2+ แมว: ขึ้น popup แยกตาม cat_id
                    unknownIds.slice(0, 3).forEach((unknownId) => {
                      const sample = unknownCatEvents.find((e) => e.cat_id === unknownId);
                      const snap = reviewSnaps?.find((r) =>
                        !r.pred_cat_id || !selectedIds.includes(r.pred_cat_id)
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

                // กรณี litter เยอะมาก (ตั้งแต่ 5 ครั้ง/วัน) → ถามว่าแมวตัวไหนใช้มากสุด
                const LITTER_ALERT_THRESHOLD = 5;
                if (litterCount >= LITTER_ALERT_THRESHOLD) {
                  const top = Object.entries(litterEventsByCat).sort((a, b) => b[1] - a[1])[0];
                  const topCatId = top?.[0] || null;
                  const topCount = Number(top?.[1] || 0);
                  const topLabel = topCatId && selectedIds.includes(topCatId) ? `cat ${topCatId.slice(0, 6)}` : 'unknown cat';
                  // ai_cat_events ไม่มี snapshot_url — ใช้ null หรือดึงจาก identity_review
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

                // สร้าง recentActivities ด้วย icon/color ที่ถูกต้อง ครบทุก behavior
                const behaviorDisplay = (b) => {
                  switch (normalizeBehavior(b)) {
                    case 'eat': return { label: 'Eating', icon: 'food-apple', color: '#81C784' };
                    case 'litter': return { label: 'Litter Box', icon: 'emoticon-poop', color: '#BA68C8' };
                    case 'sleep': return { label: 'Sleeping', icon: 'sleep', color: '#90A4AE' };
                    case 'abnormal': return { label: 'Alert', icon: 'alert-circle', color: '#EF4444' };
                    default: return { label: 'Activity', icon: 'run', color: '#FFB74D' };
                  }
                };
                newData.recentActivities = aiEventsAll.slice(0, 8).map((e, idx) => {
                  const disp = behaviorDisplay(e.behavior_label);
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
          if (!usedAiData && catIds.length > 0) {
            const { data: logs, error: logsError } = await supabase
              .from('daily_logs')
              .select(`
                *,
                normal_logs(*),
                something_off_logs(*)
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
                totalFood += Number(unifiedLog.total_food_grams || 0);

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
              energy: { active: 0, resting: 100 },
              routine: { score: 0, status: 'No Data' },
              wellness: { score: 0, status: 'No Data' },
            };
            newData.activity = [0, 0, 0, 0, 0];
            newData.food = 0;
            newData.litter = 0;
            newData.posture = {
              normal: { percent: 100, name: 'No Data' },
              abnormal: { percent: 0, name: 'None' },
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
  }, [session, cameraStatus]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, lastUpdated, refetch: fetchData };
}
