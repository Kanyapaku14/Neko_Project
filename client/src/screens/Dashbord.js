import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity, ActivityIndicator, Platform, DeviceEventEmitter, useWindowDimensions, Animated } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from 'expo-linear-gradient';
import BottomNav from "../components/BottomNav";
import HealthTrendsChart from "../components/HealthTrendsChart";
import HomeHeader from "../components/HomeHeader";
import CatHealthMeter from "../components/CatHealthMeter";
import supabase from "./config/supabaseClient";
import AsyncStorage from '@react-native-async-storage/async-storage';

import { analyzeHealthLog, analyzeHealthTrend7d, getRiskStatus } from "../utils/healthLogic";


import AlertEngine from '../services/AlertEngine';

import * as Print from 'expo-print';
import { shareAsync } from 'expo-sharing';
import Svg, { Line, Circle, Path, Text as SvgText } from 'react-native-svg';

const uuidv4 = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0;
  const v = c === 'x' ? r : (r & 0x3) | 0x8;
  return v.toString(16);
});
const lowScoreAlertInFlight = new Set();

// ==========================================
// 🐾 Paw Progress Bar Component
// ==========================================
const PawProgressBar = ({ label, percent, icon }) => {
  const clampedPercent = Math.max(0, Math.min(100, percent));

  // Custom colors for specific labels to match CameraScreen
  const getBarColor = (label) => {
    if (label.includes('Abnormal')) return '#EF5350';
    if (label.includes('Rest')) return '#7E57C2';
    if (label.includes('Eat')) return '#FFAB40';
    if (label.includes('Activity')) return '#FFAB40'; // Energy orange
    if (label.includes('Litter')) return '#64B5F6'; // Routine blue
    return '#81C784'; // Wellness green
  };

  const getIconColor = (label) => {
    if (label.includes('Abnormal')) return '#C62828';
    if (label.includes('Rest')) return '#5E35B1';
    if (label.includes('Eat')) return '#EF6C00';
    if (label.includes('Activity')) return '#FF6D00';
    if (label.includes('Litter')) return '#0D47A1';
    return '#1B5E20';
  };

  const barColor = getBarColor(label);
  const iconColor = getIconColor(label);

  return (
    <View style={styles.insightRow}>
      <View style={styles.insightHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <MaterialCommunityIcons name={icon || "paw"} size={16} color={iconColor} style={{ marginRight: 6 }} />
          <Text style={styles.insightLabel} numberOfLines={1}>{label}</Text>
        </View>
        <Text style={[styles.insightValue, { color: iconColor }]}>{clampedPercent}%</Text>
      </View>
      <View style={styles.progressBarBg}>
        <View style={styles.progressBarGray} />
        <View style={[styles.progressBarFill, { width: `${clampedPercent}%` }]}>
          <View style={[styles.progressBarColor, { backgroundColor: barColor }]} />
          <MaterialCommunityIcons name="paw" size={24} color={iconColor} style={styles.progressPaw} />
        </View>
      </View>
    </View>
  );
};

// Removed pawStyles as it's merged into main styles


export default function Dashboard({ onBack, onNavigate, session }) {
  const { width: screenWidth } = useWindowDimensions();
  const isNarrowScreen = screenWidth < 390;
  const radarAnim = useRef(new Animated.Value(0)).current;
  const [currentScore, setCurrentScore] = useState(null);
  const statusScore = Number.isFinite(currentScore) ? currentScore : 100;
  const [riskStatusInfo, setRiskStatusInfo] = useState(() => getRiskStatus(0, false));
  const status = riskStatusInfo || getRiskStatus(100 - statusScore, false);

  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState("7 DAY");
  const [selectedTrendSeries, setSelectedTrendSeries] = useState(null);
  const [userProfile, setUserProfile] = useState(null);

  const [catDetails, setCatDetails] = useState(null);
  const [rawLogs, setRawLogs] = useState([]);
  const [latestAlerts, setLatestAlerts] = useState([]);
  const [latestRedFlags, setLatestRedFlags] = useState(0);
  const [latestEmergencyAlerts, setLatestEmergencyAlerts] = useState([]);
  const [latestClusters, setLatestClusters] = useState([]);
  const [latestDiseases, setLatestDiseases] = useState([]);
  const [isFirstLog, setIsFirstLog] = useState(false);

  const [pawStats, setPawStats] = useState({ activity: 0, litter: 0, wellness: 0 });

  const [eventSummary, setEventSummary] = useState({
    all: { eat: 0, litter: 0, sleep: 0, activity: 0, abnormal: 0, total: 0 },
    d7: { eat: 0, litter: 0, sleep: 0, activity: 0, abnormal: 0, total: 0 },
    d30: { eat: 0, litter: 0, sleep: 0, activity: 0, abnormal: 0, total: 0 },
  });
  const [metricSummary, setMetricSummary] = useState({
    hydration: 0,
    digestion: 0,
    urinary: 0,
    overall: 0,
  });
  const [alertSummary, setAlertSummary] = useState({ unread: 0, critical: 0, warning: 0, info: 0 });
  const [cameraSummary, setCameraSummary] = useState({ total: 0, online: 0, offline: 0, primaryName: '--', sourceType: '--', brand: '--' });
  const [latestAssessment, setLatestAssessment] = useState(null);
  const [latestAlertItem, setLatestAlertItem] = useState(null);
  const [selectedCatId, setSelectedCatId] = useState(null);
  const healthCacheKey = (userId, catId) => (userId && catId ? `health_status_cache:${userId}:${catId}` : null);

  const getSelectedCatIdFromStorage = async () => {
    const scopedKey = session?.user?.id ? `selectedCatId:${session.user.id}` : 'selectedCatId';
    return (await AsyncStorage.getItem(scopedKey)) || (await AsyncStorage.getItem('selectedCatId'));
  };

  useEffect(() => {
    let mounted = true;
    const loadSelectedCat = async () => {
      if (!session?.user?.id) return;
      const stored = await getSelectedCatIdFromStorage();
      if (mounted) setSelectedCatId(stored || null);
    };
    loadSelectedCat();

    const sub = DeviceEventEmitter.addListener('catChanged', (cat) => {
      const nextId = cat?.id ? String(cat.id) : null;
      setSelectedCatId(nextId);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, [session?.user?.id]);


  useEffect(() => {
    if (session?.user) {
      fetchDashboardData();
    } else {
      setLoading(false);
    }
  }, [session?.user?.id, selectedPeriod, selectedCatId]);

  useEffect(() => {
    const persistHealthCache = async () => {
      try {
        if (!session?.user?.id || !catDetails?.id || !Number.isFinite(currentScore)) return;
        const riskNow = Math.max(0, 100 - currentScore);
        const statusNow = getRiskStatus(riskNow, false);
        const key = healthCacheKey(session.user.id, catDetails.id);
        if (!key) return;
        await AsyncStorage.setItem(key, JSON.stringify({
          score: currentScore,
          color: statusNow.color,
          label: statusNow.label,
          text: statusNow.text,
          at: new Date().toISOString(),
        }));
        await AsyncStorage.setItem(`health_status_cache_last:${session.user.id}`, JSON.stringify({
          catId: catDetails.id,
          score: currentScore,
          color: statusNow.color,
          label: statusNow.label,
          text: statusNow.text,
          at: new Date().toISOString(),
        }));
      } catch (_) { }
    };
    persistHealthCache();
  }, [session?.user?.id, catDetails?.id, currentScore]);

  const notifyLowScoreIfNeeded = async (score, catId, catName) => {
    if (!session?.user?.id || !catId) return;
    if (!Number.isFinite(score)) return;
    const today = new Date().toISOString().slice(0, 10);
    const key = `dashboard_low_score_alert:${session.user.id}:${catId}`;
    if (lowScoreAlertInFlight.has(key)) return;
    lowScoreAlertInFlight.add(key);
    const lastDateKey60 = `${key}:date:60`;
    const lastDateKey40 = `${key}:date:40`;
    const lastDate60 = await AsyncStorage.getItem(lastDateKey60);
    const lastDate40 = await AsyncStorage.getItem(lastDateKey40);

    try {
      if (score >= 60) {
        // reset both levels when user recovers to 60+
        await AsyncStorage.multiRemove([lastDateKey60, lastDateKey40]);
        return;
      }

      if (score >= 40) {
        // reset 40-level when user recovers to 40+
        await AsyncStorage.removeItem(lastDateKey40);
      }

      const level = score < 40 ? '40' : '60';
      const type = level === '40' ? 'dashboard_low_score_40' : 'dashboard_low_score_60';
      const severity = level === '40' ? 'critical' : 'warning';
      if (level === '60' && lastDate60 === today) return;
      if (level === '40' && lastDate40 === today) return;

      if (level === '40' && AlertEngine.resolveActiveAlerts) {
        await AlertEngine.resolveActiveAlerts('dashboard_low_score_40');
      }
      await AlertEngine.logEvent({
        id: uuidv4(),
        type,
        severity,
        title: level === '40' ? 'Health score is very low' : 'Health score is low',
        desc: `Your dashboard score dropped to ${score}.`,
        catId,
        catName: catName || null,
        timestamp: new Date().toISOString(),
        dedupeKey: `${key}:${level}`,
        cooldownMs: 0,
      });
      if (level === '60') await AsyncStorage.setItem(lastDateKey60, today);
      if (level === '40') await AsyncStorage.setItem(lastDateKey40, today);
    } finally {
      lowScoreAlertInFlight.delete(key);
    }
  };

  // Fetch paw stats whenever the active cat changes
  useEffect(() => {
    if (catDetails?.id) {
      const days = selectedPeriod === "1 MONTH" ? 30 : 7;
      fetchPawStats(catDetails.id, days);
    }
  }, [catDetails, selectedPeriod]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [{ data: profile }, { data: catsData, error: catsError }] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single(),
        supabase
          .from("cats")
          .select("*")
          .eq("owner_id", session.user.id)
          .order('created_at', { ascending: true }),
      ]);
      setUserProfile(profile || null);

      const allCats = Array.isArray(catsData) ? catsData : [];
      if (catsError || allCats.length === 0) {
        console.log("No cat found");
        await fetchOwnerSummaryOnly();
        setLoading(false);
        setCurrentScore(100);
        return;
      }
      const storedSelectedCatId = selectedCatId || await getSelectedCatIdFromStorage();
      const effectiveCat =
        allCats.find((c) => String(c.id) === String(storedSelectedCatId || '')) ||
        allCats[0];
      setCatDetails(effectiveCat);
      if (!storedSelectedCatId || String(storedSelectedCatId) !== String(effectiveCat.id)) {
        setSelectedCatId(String(effectiveCat.id));
        const scopedKey = session?.user?.id ? `selectedCatId:${session.user.id}` : 'selectedCatId';
        await AsyncStorage.setItem(scopedKey, String(effectiveCat.id));
        await AsyncStorage.setItem('selectedCatId', String(effectiveCat.id));
      }

      const daysLimit = selectedPeriod === "1 MONTH" ? 30 : 7;
      const logsPromise = supabase
        .from("daily_logs")
        .select("*, normal_logs(*), something_off_logs(*), meal_logs(*)")
        .eq("cat_id", effectiveCat.id)
        .order("log_date", { ascending: false })
        .limit(daysLimit);

      const [, , , , logsResult] = await Promise.all([
        fetchAccumulatedEventSummary(effectiveCat.id),
        fetchOwnerSummaryOnly(),
        fetchLatestAssessment(effectiveCat.id),
        fetchMetricSummary(effectiveCat.id),
        logsPromise,
      ]);

      const { data: logsData, error: logsError } = logsResult || {};

      if (logsError) throw logsError;

      const unifiedLogs = (logsData || []).map(log => {
        const details = log.log_type === 'something_off'
          ? (log.something_off_logs?.[0] || log.something_off_logs)
          : (log.normal_logs?.[0] || log.normal_logs);

        return {
          ...log,
          ...(details || {})
        };
      });

      setRawLogs(unifiedLogs);

      if (unifiedLogs.length > 0) {
        // ==========================================
        // ✅ Two-Tier Analysis
        // Tier 1: 3-Day Immediate Check (สถานะหลัก)
        // Tier 2: 7-Day Trend Detection (Alert พิเศษ)
        // ==========================================
        const catWeightKg = Number(effectiveCat?.weight);
        const safeCatWeightKg = Number.isFinite(catWeightKg) && catWeightKg > 0 ? catWeightKg : 4;
        const analyses = unifiedLogs.map((log, idx) =>
          analyzeHealthLog(log, safeCatWeightKg, idx === 0 ? unifiedLogs.slice(1) : null)
        );

        // Tier 1: latest 3 days (Immediate)
        const recentAnalyses = analyses.slice(0, 3);
        const recentCount = Math.max(1, recentAnalyses.length);
        const avg3Score = Math.round(
          recentAnalyses.reduce((sum, a) => sum + (Number(a?.score) || 0), 0) / recentCount
        );
        const hasEmergencyIn3Days = recentAnalyses.some((a) => Boolean(a?.meta?.isEmergency));

        // หากเจอ Red Flag รุนแรงใน 3 วันนี้ ให้ดีดสถานะเป็น Critical ทันที
        const effectiveScore = hasEmergencyIn3Days ? Math.min(avg3Score, 19) : avg3Score;
        setCurrentScore(effectiveScore);
        const avg3Risk = Math.round(
          recentAnalyses.reduce((sum, a) => sum + (Number(a?.riskScore) || (100 - (Number(a?.score) || 0))), 0) / recentCount
        );
        const latest = analyses[0] || null;
        setIsFirstLog(Boolean(latest?.isFirstLog));
        if (latest?.isFirstLog) {
          setRiskStatusInfo(getRiskStatus(Number(latest?.riskScore) || avg3Risk, hasEmergencyIn3Days, latest?.riskStatus));
        } else {
          setRiskStatusInfo(getRiskStatus(avg3Risk, hasEmergencyIn3Days));
        }
        await notifyLowScoreIfNeeded(effectiveScore, effectiveCat.id, effectiveCat.name);

        // Tier 2: 7-day trend alerts (special alerts)
        const trend7d = analyzeHealthTrend7d(unifiedLogs.slice(0, 7), safeCatWeightKg);
        const trendAlerts = Array.isArray(trend7d?.alerts) ? trend7d.alerts : [];

        // รวม alert พิเศษ (trend) + alert ปกติ (per-day) แล้วค่อย dedupe
        const allAlerts = [
          ...trendAlerts,
          ...analyses.flatMap((a) => (Array.isArray(a?.alerts) ? a.alerts : [])),
        ];

        // เก็บ alerts ล่าสุดไม่เกิน 4 รายการ (ไม่ซ้ำ) และให้ trend alerts มาก่อน

        setLatestAlerts([...new Set(allAlerts)].slice(0, 4));

        // red flags (สรุปในช่วง 3 วันล่าสุด เพื่อให้ตรงกับสถานะหลัก)
        const redFlags3d = recentAnalyses.reduce((sum, a) => sum + (Number(a?.redFlags) || 0), 0);
        setLatestRedFlags(redFlags3d);

        setLatestEmergencyAlerts(
          Array.isArray(latest?.meta?.emergencyAlerts) ? latest.meta.emergencyAlerts.slice(0, 4) : []
        );
        setLatestClusters(Array.isArray(latest?.clusters) ? latest.clusters : []);
        setLatestDiseases(Array.isArray(latest?.diseases) ? latest.diseases : []);
      } else {
        setCurrentScore(100);
        setRiskStatusInfo(getRiskStatus(0, false));
        setLatestAlerts([]);
        setLatestRedFlags(0);
        setLatestEmergencyAlerts([]);
        setLatestClusters([]);
        setLatestDiseases([]);
        setIsFirstLog(false);
      }

      const chartLogs = [...unifiedLogs].reverse();

      const labels = chartLogs.map((log) => {
        const raw = log?.log_date;
        if (typeof raw === 'string') {
          const isoDate = raw.split('T')[0];
          const parts = isoDate.split('-');
          if (parts.length === 3) {
            const month = Number(parts[1]);
            const day = Number(parts[2]);
            if (Number.isFinite(month) && Number.isFinite(day)) return `${day}/${month}`;
          }
        }
        const date = raw ? new Date(raw) : new Date();
        return `${date.getDate()}/${date.getMonth() + 1}`;
      });

      const foodData = chartLogs.map((log) => {
        const meals = log.meal_logs || [];
        return meals.reduce((sum, meal) => sum + (Number(meal.amount_grams) || 0), 0);
      });
      const waterData = chartLogs.map((log) => {
        const direct = Number(log?.water_ml_per_day);
        if (Number.isFinite(direct)) return direct;

        const nested = log?.normal_logs;
        const candidate = Array.isArray(nested) ? nested?.[0]?.water_ml_per_day : nested?.water_ml_per_day;
        const parsed = Number(candidate);
        return Number.isFinite(parsed) ? parsed : 0;
      });

      setChartData({
        labels: labels,
        foodData: foodData,
        waterData: waterData,
      });

    } catch (error) {
      console.warn("Dashboard fetch warning:", error?.message || error);
      setAlertSummary({ unread: 0, critical: 0, warning: 0, info: 0 });
      setCameraSummary((prev) => ({ ...prev, total: 0, online: 0, offline: 0, primaryName: '--', sourceType: '--' }));
    } finally {
      setLoading(false);
    }
  };


  // ==========================================
  // 🐾 Fetch Paw Progress Stats from Supabase
  // ==========================================
  const fetchPawStats = async (catId, daysWindow = 7) => {
    try {
      const windowDays = Number.isFinite(Number(daysWindow)) && Number(daysWindow) > 0 ? Math.floor(Number(daysWindow)) : 7;
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - (windowDays - 1));
      const startIso = start.toISOString();
      const startDate = startIso.slice(0, 10);
      const nowIso = new Date().toISOString();
      const today = new Date().toISOString().split('T')[0];

      const ACTIVITY_GOAL = 20; // target movements per day
      const LITTER_GOAL = 4; // target litter visits per day

      let activityPercent = 0;
      let litterPercent = 0;

      // --- Activity & Litter (Primary) from ai_daily_summary over selected window ---
      const { data: summaryRows, error: summaryError } = await supabase
        .from('ai_daily_summary')
        .select('count_00_06, count_06_12, count_12_18, count_18_24, total_litter, summary_date')
        .eq('cat_id', catId)
        .gte('summary_date', startDate)
        .lte('summary_date', today)
        .order('summary_date', { ascending: false });

      if (!summaryError && Array.isArray(summaryRows) && summaryRows.length > 0) {
        const totals = summaryRows.reduce(
          (acc, row) => {
            acc.activity +=
              (row.count_00_06 || 0) +
              (row.count_06_12 || 0) +
              (row.count_12_18 || 0) +
              (row.count_18_24 || 0);
            acc.litter += (row.total_litter || 0);
            return acc;
          },
          { activity: 0, litter: 0 }
        );

        activityPercent = Math.min(100, Math.round((totals.activity / (ACTIVITY_GOAL * windowDays)) * 100));
        litterPercent = Math.min(100, Math.round((totals.litter / (LITTER_GOAL * windowDays)) * 100));
      } else {
        // --- Fallback: derive from ai_cat_events (in case ai_daily_summary isn't populated) ---
        const [activityRes, litterRes] = await Promise.all([
          supabase
            .from('ai_cat_events')
            .select('id', { head: true, count: 'exact' })
            .eq('cat_id', catId)
            .eq('behavior_label', 'activity')
            .gte('occurred_at', startIso)
            .lt('occurred_at', nowIso),
          supabase
            .from('ai_cat_events')
            .select('id', { head: true, count: 'exact' })
            .eq('cat_id', catId)
            .eq('behavior_label', 'litter')
            .gte('occurred_at', startIso)
            .lt('occurred_at', nowIso),
        ]);

        const activityCount = !activityRes?.error && Number.isFinite(activityRes?.count) ? activityRes.count : 0;
        const litterCount = !litterRes?.error && Number.isFinite(litterRes?.count) ? litterRes.count : 0;

        activityPercent = Math.min(100, Math.round((activityCount / (ACTIVITY_GOAL * windowDays)) * 100));
        litterPercent = Math.min(100, Math.round((litterCount / (LITTER_GOAL * windowDays)) * 100));
      }

      // --- Wellness from assessments (latest record) ---
      const { data: assessmentData, error: assessmentError } = await supabase
        .from('assessments')
        .select('overall_risk_score')
        .eq('cat_id', catId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      let wellnessPercent = 0;
      if (!assessmentError && assessmentData) {
        wellnessPercent = Math.max(0, 100 - (assessmentData.overall_risk_score || 0));
      }

      setPawStats({
        activity: activityPercent,
        litter: litterPercent,
        wellness: wellnessPercent,
      });
    } catch (err) {
      console.warn('fetchPawStats error:', err);
      setPawStats({ activity: 0, litter: 0, wellness: 0 });
    }
  };


  const fetchAccumulatedEventSummary = async (catId) => {
    const mkIsoDaysAgo = (days) => new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString();
    const behaviors = ['eat', 'litter', 'sleep', 'activity', 'abnormal'];
    const windows = {
      all: null,
      d7: mkIsoDaysAgo(7),
      d30: mkIsoDaysAgo(30),
    };

    const nextSummary = {
      all: { eat: 0, litter: 0, sleep: 0, activity: 0, abnormal: 0, total: 0 },
      d7: { eat: 0, litter: 0, sleep: 0, activity: 0, abnormal: 0, total: 0 },
      d30: { eat: 0, litter: 0, sleep: 0, activity: 0, abnormal: 0, total: 0 },
    };

    await Promise.all(
      Object.entries(windows).flatMap(([windowKey, sinceIso]) =>
        behaviors.map(async (behavior) => {
          let q = supabase
            .from('ai_cat_events')
            .select('id', { head: true, count: 'exact' })
            .eq('cat_id', catId)
            .eq('behavior_label', behavior);
          if (sinceIso) q = q.gte('occurred_at', sinceIso);
          const { count, error } = await q;
          if (error) return;
          const safeCount = Number.isFinite(count) ? count : 0;
          nextSummary[windowKey][behavior] = safeCount;
          nextSummary[windowKey].total += safeCount;
        })
      )
    );

    setEventSummary(nextSummary);
  };

  const fetchMetricSummary = async (catId) => {
    const sinceIso = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('metrics_daily')
      .select('hydration_score, digestion_score, urinary_score, overall_score, metric_date')
      .eq('cat_id', catId)
      .gte('metric_date', sinceIso)
      .order('metric_date', { ascending: false });

    if (error || !data || !data.length) {
      // Fallback: Compute from raw daily logs if metrics_daily hasn't been synced
      const { data: fallbackLogs } = await supabase
        .from('daily_logs')
        .select('*, normal_logs(*), something_off_logs(*)')
        .eq('cat_id', catId)
        .gte('log_date', sinceIso);

      if (!fallbackLogs || !fallbackLogs.length) {
        setMetricSummary({ hydration: 0, digestion: 0, urinary: 0, overall: 0 });
        return;
      }

      let hSum = 0, dSum = 0, uSum = 0, oSum = 0;
      fallbackLogs.forEach(log => {
        let h = 100, d = 100, u = 100;
        const norm = log.normal_logs?.[0] || log.normal_logs || {};
        const off = log.something_off_logs?.[0] || log.something_off_logs || {};

        // Custom Radar mapping algorithm natively matching healthLogic score deductions
        const water = Number(norm.water_ml_per_day) || 0;
        if (water < 20) h -= 50;
        if (water === 0) h -= 30;

        if (off.has_vomit || off.has_diarrhea) d -= 40;
        if (norm.stool_level === 'very_low' || norm.stool_level === 'very_high') d -= 20;

        if (norm.urine_level === 'very_low' || norm.urine_level === 'very_high') u -= 30;

        const o = Math.round((h + d + u) / 3);
        hSum += h; dSum += d; uSum += u; oSum += o;
      });

      const count = fallbackLogs.length;
      setMetricSummary({
        hydration: Math.max(0, Math.round(hSum / count)),
        digestion: Math.max(0, Math.round(dSum / count)),
        urinary: Math.max(0, Math.round(uSum / count)),
        overall: Math.max(0, Math.round(oSum / count)),
      });
      return;
    }

    // Primary source
    const avg = (arr, key) => {
      const nums = arr.map((x) => Number(x?.[key])).filter((n) => Number.isFinite(n));
      if (!nums.length) return 0;
      return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
    };
    setMetricSummary({
      hydration: avg(data, 'hydration_score'),
      digestion: avg(data, 'digestion_score'),
      urinary: avg(data, 'urinary_score'),
      overall: avg(data, 'overall_score'),
    });
  };

  const fetchOwnerSummaryOnly = async () => {
    const ownerId = session?.user?.id;
    if (!ownerId) return;
    try {
      const { data: cams } = await supabase
        .from('cameras')
        .select('id, name, brand, is_primary, ai_connection_status, stream_source_type')
        .eq('owner_id', ownerId);

      const selectedCameraId =
        (await AsyncStorage.getItem(`camera_id:${ownerId}`)) ||
        (await AsyncStorage.getItem('camera_id'));
      const totalCam = (cams || []).length;
      const onlineCam = (cams || []).filter((c) => c.ai_connection_status === 'online').length;
      const offlineCam = Math.max(0, totalCam - onlineCam);
      const activeCam =
        (cams || []).find((c) => c.id === selectedCameraId) ||
        (cams || []).find((c) => c.is_primary) ||
        (cams || [])[0];
      const activeCamId = activeCam?.id || null;
      const resolvedBrand = String(activeCam?.brand || '').trim();
      const resolvedName = String(activeCam?.name || '').trim();
      const displayCameraName = resolvedBrand || resolvedName || '--';

      const mkAlertBaseQuery = (selectColumns, options = {}) => {
        let q = supabase
          .from('alerts')
          .select(selectColumns, options)
          .eq('owner_id', ownerId)
          .eq('is_deleted', false);
        if (activeCamId) q = q.eq('camera_id', activeCamId);
        return q;
      };

      const [unreadRes, criticalRes, warningRes, infoRes, latestAlertRes] = await Promise.all([
        mkAlertBaseQuery('id', { head: true, count: 'exact' })
          .eq('is_read', false),
        mkAlertBaseQuery('id', { head: true, count: 'exact' })
          .eq('severity', 'critical'),
        mkAlertBaseQuery('id', { head: true, count: 'exact' })
          .eq('severity', 'warning'),
        mkAlertBaseQuery('id', { head: true, count: 'exact' })
          .eq('severity', 'info'),
        mkAlertBaseQuery('title, severity, timestamp, is_read')
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      setCameraSummary({
        total: totalCam,
        online: onlineCam,
        offline: offlineCam,
        primaryName: displayCameraName,
        sourceType: activeCam?.stream_source_type || '--',
        brand: resolvedBrand || '--',
      });
      setAlertSummary({
        unread: Number.isFinite(unreadRes?.count) ? unreadRes.count : 0,
        critical: Number.isFinite(criticalRes?.count) ? criticalRes.count : 0,
        warning: Number.isFinite(warningRes?.count) ? warningRes.count : 0,
        info: Number.isFinite(infoRes?.count) ? infoRes.count : 0,
      });
      setLatestAlertItem(latestAlertRes?.data || null);
    } catch (error) {
      console.warn('fetchOwnerSummaryOnly warning:', error?.message || error);
      setCameraSummary({ total: 0, online: 0, offline: 0, primaryName: '--', sourceType: '--', brand: '--' });
      setAlertSummary({ unread: 0, critical: 0, warning: 0, info: 0 });
      setLatestAlertItem(null);
    }
  };

  const fetchLatestAssessment = async (catId) => {
    const { data } = await supabase
      .from('assessments')
      .select('assessment_date, overall_risk_level, overall_risk_score')
      .eq('cat_id', catId)
      .order('assessment_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    setLatestAssessment(data || null);
  };


  const calculateAge = (birthdate) => {
    if (!birthdate) return 'N/A';
    const birth = new Date(birthdate);
    const today = new Date();
    let years = today.getFullYear() - birth.getFullYear();
    let months = today.getMonth() - birth.getMonth();
    if (months < 0) {
      years--;
      months += 12;
    }
    return `${years} yrs ${months} mos`;
  };

  const handleExportPDF = async () => {
    const privacyRaw = await AsyncStorage.getItem('privacy_enabled');
    if (privacyRaw === 'false') {
      alert("Data export is disabled in Privacy settings.");
      return;
    }

    if (!catDetails || rawLogs.length === 0) {
      alert("No data available to export");
      return;
    }

    try {
      const { data: exportLogs, error: exportError } = await supabase
        .from('daily_logs')
        .select('log_date, normal_logs(*), something_off_logs(*), meal_logs(*)')
        .eq('cat_id', catDetails.id)
        .order('log_date', { ascending: false })
        .limit(7);

      if (exportError) throw exportError;

      const logsForExport = exportLogs || [];
      if (logsForExport.length === 0) {
        alert("No data available to export");
        return;
      }

      const toArray = (value) => (Array.isArray(value) ? value : (value ? [value] : []));
      const formatList = (value) => toArray(value).filter(Boolean).join(', ');
      const sanitize = (text) => String(text ?? '-')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      const rowsHTML = logsForExport.map((log) => {
        const dateObj = new Date(log.log_date);
        const dateStr = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}/${dateObj.getFullYear()}`;

        const normal = toArray(log.normal_logs)[0];
        const off = toArray(log.something_off_logs)[0];

        const mealLogs = toArray(log.meal_logs);
        const totalFoodGrams = mealLogs.reduce((sum, meal) => sum + (Number(meal.amount_grams) || 0), 0);

        const normalSummary = normal
          ? [
            `Meals/day: ${normal.meals_per_day ?? '-'}`,
            `Food total: ${totalFoodGrams} g`,
            `Water/day: ${normal.water_ml_per_day ?? 0} ml`,
            `Urine level: ${normal.urine_level ?? '-'}`,
            `Stool level: ${normal.stool_level ?? '-'}`,
          ].join(', ')
          : '-';

        const offIssues = [];
        if (off?.has_vomit) {
          offIssues.push(`Vomit${off?.vomit_type ? ` (${off.vomit_type})` : ''}`);
        }
        if (off?.has_diarrhea) {
          offIssues.push(`Diarrhea${off?.diarrhea_type ? ` (${off.diarrhea_type})` : ''}`);
        }
        const behaviorEnergy = formatList(off?.behavior_energy);
        if (behaviorEnergy) offIssues.push(`Behavior/Energy: ${behaviorEnergy}`);
        const respiratoryPhysical = formatList(off?.respiratory_physical);
        if (respiratoryPhysical) offIssues.push(`Respiratory/Physical: ${respiratoryPhysical}`);
        const offSummary = off ? (offIssues.join(', ') || '-') : '-';
        const noteText = off?.notes || normal?.notes || '-';

        return `
          <tr>
            <td style="text-align: center;">${dateStr}</td>
            <td>${sanitize(normalSummary)}</td>
            <td>${sanitize(offSummary)}</td>
            <td>${sanitize(noteText)}</td>
          </tr>
        `;
      }).join('');

      const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap');
              body {
                font-family: 'Sarabun', sans-serif;
                padding: 40px;
                color: #333;
              }
              h1 {
                text-align: center;
                color: #2D4A47;
                margin-bottom: 5px;
              }
              .subtitle {
                text-align: center;
                color: #5F7671;
                margin-bottom: 30px;
              }
              .info-box {
                background: #f4f8f7;
                padding: 15px 25px;
                border-radius: 12px;
                border: 1px solid #d1e2e0;
                margin-bottom: 30px;
              }
              .info-box h2 {
                margin-top: 0;
                color: #2D4A47;
                font-size: 18px;
                border-bottom: 2px solid #2D4A47;
                padding-bottom: 5px;
              }
              .info-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px 20px;
                font-size: 14px;
              }
              .info-row span.label {
                font-weight: bold;
                color: #5F7671;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 10px;
                font-size: 14px;
              }
              th, td {
                border: 1px solid #d1e2e0;
                padding: 12px;
                text-align: left;
              }
              th {
                background-color: #2D4A47;
                color: white;
                text-align: center;
              }
              tr:nth-child(even) {
                background-color: #f9fbfb;
              }
            </style>
          </head>
          <body>
            <h1>Cat Health Report</h1>
            <div class="subtitle">Summary of the last 7 days</div>
            
            <div class="info-box">
              <h2>Cat Profile</h2>
              <div class="info-grid">
                <div class="info-row"><span class="label">Name:</span> ${catDetails.name || 'Unknown'}</div>
                <div class="info-row"><span class="label">Breed:</span> ${catDetails.breed || 'Unknown'}</div>
                <div class="info-row"><span class="label">Age:</span> ${calculateAge(catDetails.birthdate)}</div>
                <div class="info-row"><span class="label">Gender:</span> ${catDetails.gender === 'M' ? 'Male' : catDetails.gender === 'F' ? 'Female' : 'Unknown'}</div>
                <div class="info-row"><span class="label">Weight:</span> ${catDetails.weight ? catDetails.weight + ' kg' : 'Unknown'}</div>
                <div class="info-row"><span class="label">Spayed/Neutered:</span> ${catDetails.spayed_neutered ? 'Yes' : 'No'}</div>
              </div>
            </div>
 
            <h2>Health Logs (Last 7 Days)</h2>
            <table>
              <tr>
                <th width="15%">Date</th>
                <th width="30%">Normal</th>
                <th width="30%">Something Off</th>
                <th width="25%">Notes</th>
              </tr>
              ${rowsHTML}
            </table>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      await shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });

    } catch (error) {
      console.error("Error creating PDF:", error);
      alert("Failed to create PDF");
    }
  };

  const periods = ["7 DAY", "1 MONTH"];
  const weeklyBehavior = eventSummary.d7 || { eat: 0, litter: 0, sleep: 0, abnormal: 0 };

  const activityBreakdownData = [
    { key: 'eat', label: 'Eat', icon: 'food-drumstick', value: weeklyBehavior.eat || 0, color: '#FF8F00' },
    { key: 'litter', label: 'Litter', icon: 'emoticon-poop', value: weeklyBehavior.litter || 0, color: '#0288D1' },
    { key: 'sleep', label: 'Resting', icon: 'sleep', value: weeklyBehavior.sleep || 0, color: '#7E57C2' },
    { key: 'abnormal', label: 'Abnormal', icon: 'alert-circle', value: weeklyBehavior.abnormal || 0, color: '#D32F2F' },
  ];
  const breakdownTotal = Math.max(1, activityBreakdownData.reduce((s, x) => s + x.value, 0));
  const breakdownWithPct = activityBreakdownData.map((x) => ({ ...x, pct: Math.round((x.value / breakdownTotal) * 100) }));
  const riskPct = {
    eat: breakdownWithPct.find((x) => x.key === 'eat')?.pct || 0,
    rest: breakdownWithPct.find((x) => x.key === 'sleep')?.pct || 0,
    abnormal: breakdownWithPct.find((x) => x.key === 'abnormal')?.pct || 0,
  };
  const weeklyTotalForLegacy = Math.max(
    1,
    (weeklyBehavior.eat || 0) + (weeklyBehavior.litter || 0) + (weeklyBehavior.sleep || 0) + (weeklyBehavior.abnormal || 0) + (eventSummary?.d7?.activity || 0)
  );
  const legacyRiskPct = {
    activity: Math.round(((eventSummary?.d7?.activity || 0) / weeklyTotalForLegacy) * 100),
    litter: breakdownWithPct.find((x) => x.key === 'litter')?.pct || 0,
    wellness: Number.isFinite(currentScore) ? currentScore : 0,
  };

  const RADAR_SIZE = Math.max(210, Math.min(screenWidth - 82, 320));
  const RADAR_CENTER = RADAR_SIZE / 2;
  const RADAR_R = RADAR_SIZE * 0.30;

  const getMetricQual = (score, key) => {
    if (score >= 80) return { t: 'Excellent', d: key === 'overall' ? 'Great condition' : 'Healthy levels', c: '#10B981' };
    if (score >= 60) return { t: 'Good', d: key === 'overall' ? 'Generally fine' : 'Normal ranges', c: '#3B82F6' };
    if (score >= 40) return { t: 'Fair', d: key === 'overall' ? 'Needs monitoring' : 'Below optimal', c: '#F59E0B' };
    return { t: 'Attention', d: key === 'overall' ? 'Consult vet' : 'Action needed', c: '#EF4444' };
  };

  const radarAxes = [
    { key: 'hydration', label: 'Hydration', angle: -90, value: metricSummary.hydration || 0, ...getMetricQual(metricSummary.hydration || 0, 'hydration') },
    { key: 'digestion', label: 'Digestion', angle: 0, value: metricSummary.digestion || 0, ...getMetricQual(metricSummary.digestion || 0, 'digestion') },
    { key: 'urinary', label: 'Urinary', angle: 90, value: metricSummary.urinary || 0, ...getMetricQual(metricSummary.urinary || 0, 'urinary') },
    { key: 'overall', label: 'Overall', angle: 180, value: metricSummary.overall || 0, ...getMetricQual(metricSummary.overall || 0, 'overall') },
  ];
  const polarPoint = (deg, scale = 1) => {
    const rad = (deg * Math.PI) / 180;
    return {
      x: RADAR_CENTER + Math.cos(rad) * RADAR_R * scale,
      y: RADAR_CENTER + Math.sin(rad) * RADAR_R * scale,
    };
  };
  const radarPath = radarAxes
    .map((a, idx) => {
      const p = polarPoint(a.angle, Math.max(0, Math.min(100, a.value)) / 100);
      return `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`;
    })
    .join(' ') + ' Z';

  const radarLabels = radarAxes.map((a) => {
    const p = polarPoint(a.angle, 1.16);
    const isRight = a.angle === 0;
    const isLeft = a.angle === 180;
    return {
      key: a.key,
      label: a.label,
      x: p.x,
      y: p.y + (a.angle === -90 ? -2 : a.angle === 90 ? 10 : 4),
      anchor: isRight ? 'start' : isLeft ? 'end' : 'middle',
    };
  });

  useEffect(() => {
    Animated.timing(radarAnim, {
      toValue: 1,
      duration: 550,
      useNativeDriver: true,
    }).start();
  }, [metricSummary.hydration, metricSummary.digestion, metricSummary.urinary, metricSummary.overall]);

  // ==========================================
  // 🎨 RENDER
  // ==========================================
  return (
    <LinearGradient colors={['#FFFFFF', '#B2E1DB']} locations={[0.42, 1]} style={styles.gradientBg}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>

          {/* Header */}
          <HomeHeader
            onNotify={() => onNavigate && onNavigate('Alert')}
            onSetting={() => onNavigate && onNavigate('Setting')}
          />

          {/* ===== 🐾 Health Score Circle ===== */}
          <View style={styles.scoreSection}>
            {loading || currentScore === null ? (
              <ActivityIndicator size="large" color="#00695C" style={{ marginVertical: 40 }} />
            ) : (
              <>
                {/* Decorative paws around circle */}
                <MaterialCommunityIcons name="paw" size={38} color="rgba(0,105,92,0.15)" style={{ position: 'absolute', top: 5, right: 30, transform: [{ rotate: '25deg' }] }} />
                <MaterialCommunityIcons name="paw" size={30} color="rgba(0,105,92,0.12)" style={{ position: 'absolute', top: 40, left: 20, transform: [{ rotate: '-20deg' }] }} />
                <MaterialCommunityIcons name="paw" size={34} color="rgba(0,105,92,0.1)" style={{ position: 'absolute', bottom: 25, right: 45, transform: [{ rotate: '40deg' }] }} />
                <MaterialCommunityIcons name="paw" size={26} color="rgba(0,105,92,0.08)" style={{ position: 'absolute', bottom: 15, left: 40, transform: [{ rotate: '-30deg' }] }} />

                <Text style={styles.scoreSectionLabel}>HEALTH STATUS</Text>

                <CatHealthMeter
                  size={260}
                  score={currentScore}
                  statusText={status.label}
                  statusColor={status.color}
                  note={status.text}
                />

                <Text style={[styles.scoreSubtitle, { color: status.color }]}>{status.text}</Text>

                {latestRedFlags > 0 && (
                  <View style={styles.redFlagRow}>
                    <Ionicons name="warning" size={14} color="#EB5757" />
                    <Text style={styles.redFlagRowText}>{latestRedFlags} Red Flag{latestRedFlags > 1 ? 's' : ''} detected</Text>
                  </View>
                )}

                <View style={styles.lastUpdateRow}>
                  <Ionicons name="time-outline" size={14} color="#90A4AE" />
                  <Text style={styles.lastUpdateText}>Last update today {new Date().getHours()}:{String(new Date().getMinutes()).padStart(2, '0')}</Text>
                </View>
              </>
            )}
          </View>

          {/* ===== Latest Health Assessment ===== */}
          <View style={styles.assessmentCard}>
            <View style={styles.assessmentCardRow}>
              <MaterialCommunityIcons name="paw" size={32} color="rgba(12,90,88,0.16)" style={{ marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.assessmentTitle}>Latest Health Assessment</Text>
                  <MaterialCommunityIcons name="clipboard-text-outline" size={20} color="#5F7671" />
                </View>
                <Text style={styles.assessmentDate}>
                  {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • {status.label}
                </Text>
              </View>
            </View>
            <View style={styles.assessmentButtons}>
	              <TouchableOpacity
	                style={styles.viewResultBtn}
	                onPress={() => onNavigate?.('Result', { source: 'db', catId: catDetails?.id || null })}
	              >
	                <Text style={styles.viewResultBtnText}>View Result</Text>
	                <Ionicons name="chevron-forward" size={16} color="#0C5A58" style={{marginLeft: 4}} />
	              </TouchableOpacity>
              <TouchableOpacity
                style={styles.viewHistoryBtn}
                onPress={() => onNavigate?.('Timeline')}
              >
                <Text style={styles.viewHistoryBtnText}>View History</Text>
                <Ionicons name="time-outline" size={16} color="#0C5A58" style={{marginLeft: 6}} />
              </TouchableOpacity>
            </View>
            {latestAssessment && (
              <View style={styles.riskSnapshotInline}>
                <Text style={styles.summaryCardTitle}>Latest Risk Snapshot</Text>
                <View style={styles.inlineMetricRow}>
                  <Text style={styles.inlineMetric}>
                    Level {String(latestAssessment.overall_risk_level || '--').toUpperCase()}
                  </Text>
                  <Text style={styles.inlineMetric}>
                    Date {latestAssessment.assessment_date || '--'}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* หมายเหตุ: First log จะบังคับสถานะขั้นต่ำเป็น Monitor และเพิ่มคำเตือนเพื่อความปลอดภัย */}
          {isFirstLog && (
            <View style={[styles.summaryCard, styles.firstLogCard]}>
              <Text style={styles.summaryCardTitle}>First Log Notification</Text>
              <Text style={styles.signalItem}>• First health log recorded. More data will improve health assessment accuracy.</Text>
            </View>
          )}

          {/* ===== Veterinary Safety Signals ===== */}
          {!loading && (
            <>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardTitle}>🚨 Emergency Alerts</Text>
                {latestEmergencyAlerts.length > 0 ? (
                  latestEmergencyAlerts.map((msg, idx) => (
                    <Text key={`em-${idx}`} style={styles.signalItem}>• {msg}</Text>
                  ))
                ) : (
                  <Text style={styles.signalEmpty}>No emergency alerts.</Text>
                )}
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardTitle}>🔬 Symptom Clusters</Text>
                {latestClusters.length > 0 ? (
                  latestClusters.map((name, idx) => (
                    <Text key={`cl-${idx}`} style={styles.signalItem}>• {name}</Text>
                  ))
                ) : (
                  <Text style={styles.signalEmpty}>No clusters detected.</Text>
                )}
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardTitle}>🧬 Possible Conditions</Text>
                {latestDiseases.length > 0 ? (
                  latestDiseases.map((d, idx) => (
                    <Text key={`dz-${idx}`} style={styles.signalItem}>
                      • {d?.disease}{d?.risk ? ` (${String(d.risk).charAt(0).toUpperCase()}${String(d.risk).slice(1)} risk)` : ''}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.signalEmpty}>No disease patterns detected.</Text>
                )}
              </View>
            </>
          )}

          {/* ===== 🐾 System Risk Analysis (Paw Progress) ===== */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <MaterialCommunityIcons name="shield-check-outline" size={22} color="#00695C" />
              <Text style={styles.sectionTitle}>System Risk Analysis</Text>
            </View>
            <TouchableOpacity onPress={() => console.log('View Detail pressed')}>
              <Text style={styles.viewDetailLink}>View Detail</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.riskCard}>
            <PawProgressBar
              label="Activity Level"
              percent={pawStats.activity}
              icon="lightning-bolt"
            />
            <PawProgressBar
              label="Litter Box Usage"
              percent={pawStats.litter}
              icon="cat"
            />
            <PawProgressBar
              label="Overall Wellness"
              percent={pawStats.wellness}
              icon="heart-pulse"
            />
            <View style={styles.riskFooter}>
              <MaterialCommunityIcons name="clock-outline" size={14} color="#90A4AE" />
              <Text style={styles.riskFooterText}>Based on the last {selectedPeriod === '1 MONTH' ? '30' : '7'} days of activity</Text>
            </View>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryCardTitle}>Health Score</Text>
            <Text style={styles.summarySubTitle}>Based on latest hydration, digestion, urinary and overall metrics</Text>
            <View style={styles.healthScoreWrap}>
              <Animated.View
                style={[
                  styles.chartMiniSurface,
                  {
                    opacity: radarAnim,
                    transform: [{
                      scale: radarAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.9, 1],
                      }),
                    }],
                  },
                ]}
              >
                <Svg width={RADAR_SIZE} height={RADAR_SIZE} viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}>
                  {[0.25, 0.5, 0.75, 1].map((s) => {
                    const pts = [-90, 0, 90, 180].map((a) => polarPoint(a, s));
                    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
                    return <Path key={`grid-${s}`} d={d} stroke="#E9D5FF" fill="none" strokeWidth="1" />;
                  })}
                  {radarAxes.map((a) => {
                    const p = polarPoint(a.angle, 1);
                    return <Line key={`axis-${a.key}`} x1={RADAR_CENTER} y1={RADAR_CENTER} x2={p.x} y2={p.y} stroke="#D8B4FE" strokeWidth="1" />;
                  })}
                  <Path d={radarPath} fill="rgba(168, 85, 247, 0.28)" stroke="#A855F7" strokeWidth="2.8" />
                  {radarAxes.map((a) => {
                    const p = polarPoint(a.angle, Math.max(0, Math.min(100, a.value)) / 100);
                    return <Circle key={`radar-dot-${a.key}`} cx={p.x} cy={p.y} r={4.5} fill="#C084FC" stroke="#FFFFFF" strokeWidth={1.5} />;
                  })}
                  {radarLabels.map((l) => (
                    <SvgText
                      key={`radar-label-${l.key}`}
                      x={l.x}
                      y={l.y}
                      fontSize={isNarrowScreen ? '10' : '11'}
                      fontWeight="700"
                      fill="#6B21A8"
                      textAnchor={l.anchor}
                    >
                      {l.label}
                    </SvgText>
                  ))}
                </Svg>
              </Animated.View>
              <View style={styles.metricList}>
                {radarAxes.map((m) => (
                  <View key={m.key} style={styles.metricRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.metricLabel}>{m.label}</Text>
                      <Text style={styles.metricDesc} numberOfLines={1} ellipsizeMode="tail">{m.d}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.metricValue, { color: m.c }]}>{m.t}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryCardTitle}>Health Trends</Text>
            <View style={styles.chartHeader}>
              <View style={styles.tagsContainer}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSelectedTrendSeries((prev) => (prev === 'food' ? null : 'food'))}
                  style={[
                    styles.tag,
                    styles.tagFood,
                    selectedTrendSeries && selectedTrendSeries !== 'food' && styles.tagInactive,
                  ]}
                >
                  <MaterialCommunityIcons name="food-drumstick" size={14} color="#FF8F00" style={{ marginRight: 4 }} />
                  <Text style={styles.tagText}>Food</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSelectedTrendSeries((prev) => (prev === 'water' ? null : 'water'))}
                  style={[
                    styles.tag,
                    styles.tagWater,
                    selectedTrendSeries && selectedTrendSeries !== 'water' && styles.tagInactive,
                  ]}
                >
                  <MaterialCommunityIcons name="water" size={14} color="#0288D1" style={{ marginRight: 4 }} />
                  <Text style={styles.tagText}>Water</Text>
                </TouchableOpacity>
              </View>
            </View>

            {loading ? (
              <ActivityIndicator size="large" color="#00695C" style={{ marginVertical: 24 }} />
            ) : (
              <HealthTrendsChart
                data={chartData}
                selectedSeries={selectedTrendSeries}
                onSelectSeries={(next) => setSelectedTrendSeries(next)}
              />
            )}

            <View style={styles.periodContainer}>
              {periods.map((period) => (
                <TouchableOpacity
                  key={period}
                  style={[
                    styles.periodButton,
                    selectedPeriod === period && styles.periodButtonActive,
                  ]}
                  onPress={() => setSelectedPeriod(period)}
                >
                  <Text
                    style={[
                      styles.periodText,
                      selectedPeriod === period && styles.periodTextActive,
                    ]}
                  >
                    {period}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>



          {/* ===== 🔘 Action Buttons ===== */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryCardTitle}>Camera & Alerts</Text>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Camera Online</Text>
                <Text style={styles.summaryValue}>{cameraSummary.online}/{cameraSummary.total}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Camera Offline</Text>
                <Text style={[styles.summaryValue, { color: '#607D8B' }]}>{cameraSummary.offline}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Unread Alerts</Text>
                <Text style={styles.summaryValue}>{alertSummary.unread}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Info</Text>
                <Text style={[styles.summaryValue, { color: '#0288D1' }]}>{alertSummary.info}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Critical</Text>
                <Text style={[styles.summaryValue, { color: '#D32F2F' }]}>{alertSummary.critical}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Warning</Text>
                <Text style={[styles.summaryValue, { color: '#ED6C02' }]}>{alertSummary.warning}</Text>
              </View>
            </View>
            <Text style={styles.summaryFootnote} numberOfLines={1}>
              Active: {cameraSummary.primaryName} | Source: {cameraSummary.sourceType}
            </Text>
            <Text style={styles.summaryFootnote} numberOfLines={2}>
              Latest Alert: {latestAlertItem?.title || '--'}
            </Text>
            <Text style={styles.summaryFootnote}>
              {latestAlertItem?.timestamp ? latestAlertItem.timestamp.replace('T', ' ').substring(0, 19) : '--'}
              {latestAlertItem?.severity ? ` | ${String(latestAlertItem.severity).toUpperCase()}` : ''}
            </Text>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.actionButtonNew}
              onPress={() => onNavigate && onNavigate('Timeline')}
              activeOpacity={0.8}
            >
              <View style={styles.actionInner}>
                <MaterialCommunityIcons name="chart-timeline-variant" size={22} color="#00695C" />
                <Text style={styles.actionTextNew}>Timeline</Text>
                <Ionicons name="chevron-forward" size={18} color="#90A4AE" style={{ marginLeft: 'auto' }} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButtonNew}
              onPress={handleExportPDF}
              activeOpacity={0.8}
            >
              <View style={styles.actionInner}>
                <MaterialCommunityIcons name="file-export-outline" size={22} color="#00695C" />
                <Text style={styles.actionTextNew}>Export PDF</Text>
                <Ionicons name="chevron-forward" size={18} color="#90A4AE" style={{ marginLeft: 'auto' }} />
              </View>
            </TouchableOpacity>
          </View>



        </ScrollView>

        {/* Bottom Nav */}
        <BottomNav
          current="Overview"
          onNavigate={onNavigate}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

// ===== Styles =====
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  gradientBg: {
    flex: 1,
  },
  scrollContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingBottom: 100,
    paddingTop: 8,
  },

  // ===== Score Circle Section =====
  scoreSection: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 18,
    position: 'relative',
    paddingVertical: 6,
  },
  scoreSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8A9A98',
    letterSpacing: 1.2,
    marginBottom: 10,
    fontFamily: Platform.OS === 'ios' ? 'Inter-Bold' : 'sans-serif-medium',
  },
  mainCircle: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 5,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#546E7A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  catEarContainer: {
    width: 170,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: -10,
    paddingHorizontal: 20,
    zIndex: 2,
  },
  catEar: {
    width: 28,
    height: 22,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  catEarLeft: {
    transform: [{ rotate: '-18deg' }],
  },
  catEarRight: {
    transform: [{ rotate: '18deg' }],
  },
  mainCircleInner: {
    width: 146,
    height: 146,
    borderRadius: 73,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainCircleStatus: {
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  mainCircleScore: {
    fontSize: 40,
    fontWeight: '900',
    marginTop: 0,
  },
  mainCirclePawBadge: {
    position: 'absolute',
    bottom: 10,
    right: 12,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  scoreSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  redFlagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  redFlagRowText: {
    fontSize: 13,
    color: '#D32F2F',
    fontWeight: '700',
  },
  lastUpdateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E1F5FE',
  },
  lastUpdateText: {
    fontSize: 11,
    color: '#90A4AE',
    fontWeight: '600',
  },

  // ===== Assessment Card =====
  assessmentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E7EFEA',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 1,
  },
  assessmentCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  assessmentTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#37474F',
  },
  assessmentDate: {
    fontSize: 12,
    color: '#78909C',
    fontWeight: '600',
    marginTop: 2,
  },
  assessmentButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  riskSnapshotInline: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEF5F3',
  },
  viewResultBtn: {
    flex: 1,
    backgroundColor: '#138A7B',
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  viewResultBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  viewHistoryBtn: {
    flex: 1,
    backgroundColor: '#EAF4F1',
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DCEAE6',
  },
  viewHistoryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A6D67',
  },

  // ===== Section Headers =====
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 2,
    paddingHorizontal: 4,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1F3B37',
    fontFamily: Platform.OS === 'ios' ? 'Inter-Bold' : 'sans-serif-medium',
  },
  viewDetailLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#00897B',
    textDecorationLine: 'underline',
  },

  // ===== Risk Card =====
  riskCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E6EFEB',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 1,
  },
  riskFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F5',
  },
  riskSubDivider: {
    height: 1,
    backgroundColor: '#EDF3F1',
    marginVertical: 8,
  },
  riskFooterText: {
    fontSize: 11,
    color: '#90A4AE',
    fontWeight: '500',
    fontStyle: 'italic',
  },

  // ===== Chart =====
  chartCard: {
    backgroundColor: '#ffffffff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E6EFEB',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 1,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  tagsContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#F1F8F6',
  },
  tagInactive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E3ECE9',
    opacity: 0.6,
  },
  tagFood: {
    borderColor: '#FFD6A8',
    borderWidth: 1,
  },
  tagWater: {
    borderColor: '#B3DCF8',
    borderWidth: 1,
  },
  tagText: {
    color: '#37474F',
    fontSize: 11,
    fontWeight: '700',
  },
  periodContainer: {
    flexDirection: 'row',
    backgroundColor: '#EEF4F2',
    borderRadius: 12,
    padding: 4,
    marginTop: 12,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 9,
  },
  periodButtonActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DBE9E4',
  },
  periodText: {
    fontSize: 11,
    color: '#62807B',
    fontWeight: '800',
  },
  periodTextActive: {
    color: '#0C5A58',
  },

  // ===== Action Row =====
  actionRow: {
    flexDirection: 'column',
    gap: 10,
    marginBottom: 14,
  },
  actionButtonNew: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E6EFEB',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.04,
    shadowRadius: 11,
    elevation: 1,
  },
  actionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionTextNew: {
    fontSize: 14,
    fontWeight: '700',
    color: '#37474F',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E6EFEB',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 1,
  },
  firstLogCard: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
  },
  summaryCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1F3B37',
    marginBottom: 12,
  },
  summarySubTitle: {
    fontSize: 11,
    color: '#6B8B93',
    marginTop: -6,
    marginBottom: 10,
    fontWeight: '600',
  },
  signalItem: {
    fontSize: 13,
    color: '#2D4A47',
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 6,
  },
  signalEmpty: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '700',
  },
  summaryCardHeadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
  },
  summaryItem: {
    width: '48.5%',
    backgroundColor: '#F7FBFA',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4EFEB',
    paddingVertical: 11,
    paddingHorizontal: 11,
  },
  summaryLabel: {
    fontSize: 10,
    color: '#6E8680',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  summaryValue: {
    marginTop: 4,
    fontSize: 17,
    color: '#0C5A58',
    fontWeight: '800',
  },
  inlineMetricRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  inlineMetric: {
    fontSize: 11,
    color: '#00695C',
    fontWeight: '700',
    backgroundColor: '#ECF8F5',
    borderWidth: 1,
    borderColor: '#D7ECE5',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  summaryFootnote: {
    marginTop: 10,
    fontSize: 11,
    color: '#607D8B',
    fontWeight: '600',
  },
  weeklyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF3F1',
  },
  weeklyLabel: {
    marginLeft: 8,
    flex: 1,
    fontSize: 12,
    color: '#455A64',
    fontWeight: '700',
  },
  weeklyValue: {
    fontSize: 12,
    color: '#004D40',
    fontWeight: '800',
  },
  healthScoreWrap: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
  },
  breakdownWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  metricList: {
    width: '100%',
    gap: 6,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F7FBFA',
    borderWidth: 1,
    borderColor: '#E4EFEB',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  metricLabel: {
    fontSize: 12,
    color: '#37474F',
    fontWeight: '800',
  },
  metricDesc: {
    fontSize: 9,
    color: '#8A9A98',
    marginTop: 2,
    fontWeight: '600',
  },
  metricValue: {
    fontSize: 12,
    fontWeight: '800',
  },
  chartMiniSurface: {
    borderWidth: 1,
    borderColor: '#EDF3F1',
    borderRadius: 14,
    backgroundColor: '#FBFEFD',
    padding: 8,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  donutChartBox: {
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E4EFEB',
    borderRadius: 16,
    backgroundColor: '#FBFEFD',
    padding: 6,
  },
  donutCenterLabel: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  donutCenterValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F766E',
    lineHeight: 18,
  },
  donutCenterText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#78909C',
    marginTop: 1,
  },
  chipButton: {
    backgroundColor: '#ECF8F5',
    borderWidth: 1,
    borderColor: '#D7ECE5',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipButtonActive: {
    backgroundColor: '#0F766E',
    borderColor: '#0F766E',
  },
  chipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0C5A58',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  eventBarRow: {
    marginBottom: 10,
  },
  eventBarHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  eventBarLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#37474F',
  },
  eventBarValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#004D40',
  },
  eventBarTrack: {
    width: '100%',
    height: 8,
    backgroundColor: '#ECF1F0',
    borderRadius: 999,
    overflow: 'hidden',
  },
  eventBarFill: {
    height: '100%',
    borderRadius: 999,
  },
  eventLineChartWrap: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E7F1EE',
    backgroundColor: '#FCFFFE',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },

  // Paw Progress / Behavior Insight Styles (Merged from CameraScreen)
  insightRow: {
    marginBottom: 16,
  },
  insightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  insightLabel: {
    fontSize: 13,
    color: '#455A64',
    fontWeight: '600',
  },
  insightValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  progressBarBg: {
    height: 24,
    justifyContent: 'center',
    overflow: 'visible',
    marginVertical: 4,
  },
  progressBarGray: {
    height: 8,
    backgroundColor: '#ECEFF1',
    borderRadius: 5,
    width: '100%',
    position: 'absolute',
  },
  progressBarFill: {
    height: 24,
    minWidth: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'visible',
  },
  progressBarColor: {
    height: 8,
    borderRadius: 5,
    width: '100%',
    position: 'absolute',
  },
  progressPaw: {
    marginRight: -8,
    textShadowColor: 'rgba(0,0,0,0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    zIndex: 10,
  },
});
