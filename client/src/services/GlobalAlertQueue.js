/**
 * GlobalAlertQueue.js
 *
 * 2-tier alert UX:
 *
 * TIER 1 — Abnormal (vomiting / head_pressing / critical severity)
 *   → Full-screen RED modal on any screen + push notification (via NotificationService)
 *   → User MUST acknowledge (dismiss or identify)
 *
 * TIER 2 — Normal pending identity (eat / litter / activity etc.)
 *   → Orange banner is rendered only on CameraScreen
 *   → Tapping banner opens CatPickerModal
 */

import React, {
    createContext, useState, useEffect,
    useCallback, useMemo, useRef,
} from 'react';
import {
    Text, TouchableOpacity, View, ScrollView, Image, Modal, Pressable, StyleSheet, Platform, DeviceEventEmitter
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AlertEngine, { AlertEvents } from './AlertEngine';
import AlertRepository from './AlertRepository';
import CatPickerModal from '../components/alert/CatPickerModal';
import supabase from '../screens/config/supabaseClient';

// Expose for JS Debugger console during development only.
if (__DEV__) {
    global.AlertEngine = AlertEngine;
}

export const GlobalAlertQueueContext = createContext({
    pushAlert: () => { },
    openPendingQueue: () => { },
    pendingBannerAlerts: [],
    pendingCount: 0,
    criticalAlert: null,
    showCriticalBanner: false,
});

const ABNORMAL_BEHAVIORS = new Set(['vomiting', 'head_pressing', 'abnormal']);
const BANNER_BEHAVIORS = new Set(['eat', 'feeding_session', 'litter', 'litter_session', 'toileting', 'litter_box']);
const MAX_PENDING_QUEUE = 6;
const DISMISS_SNOOZE_MS = 5 * 60 * 1000;
const CRITICAL_AUTOPOP_FRESHNESS_MS = 10 * 60 * 1000;
const PENDING_BANNER_FRESHNESS_MS = 10 * 60 * 1000;

function isAlertAbnormal(alert) {
    if (!alert) return false;
    const bl = String(alert?.behaviorLabel || '').toLowerCase();
    const bd = String(alert?.behaviorDetail || alert?.metadata?.behavior_detail || alert?.metadata?.behaviorDetail || '').toLowerCase();
    return ABNORMAL_BEHAVIORS.has(bl) || ABNORMAL_BEHAVIORS.has(bd);
}

function normalizeBehaviorLabelLocal(label) {
    const v = String(label || '').toLowerCase().trim();
    if (['vomiting', 'vomit'].includes(v)) return 'vomiting';
    if (['head_pressing', 'head-pressing', 'head pressing'].includes(v)) return 'head_pressing';
    if (['abnormal', 'warning', 'critical'].includes(v)) return 'abnormal';
    if (['eat', 'eating', 'food', 'feeding'].includes(v)) return 'eat';
    if (['litter', 'toilet', 'toileting', 'urine', 'stool'].includes(v)) return 'litter';
    return v || 'activity';
}

function isBannerBehavior(label) {
    const v = normalizeBehaviorLabelLocal(label);
    return BANNER_BEHAVIORS.has(v);
}

function shouldNavigateAfterResolve(alert) {
    if (!alert) return false;
    if (isAlertAbnormal(alert)) return false;
    const raw = alert?.behaviorLabel || alert?.metadata?.behaviorLabel || alert?.metadata?.behavior || '';
    return isBannerBehavior(raw);
}

export function GlobalAlertQueueProvider({ children, session, activeScreen }) {
    const AUTO_POPUP_COOLDOWN_MS = 45 * 1000;

    const [queue, setQueue] = useState([]);
    const [currentAlert, setCurrentAlert] = useState(null);
    const [catsFromDb, setCatsFromDb] = useState([]);
    const [realtimeCameraId, setRealtimeCameraId] = useState(null);
    // Tier 1: abnormal / critical modal
    const [criticalAlert, setCriticalAlert] = useState(null);
    const [dismissedCriticalIds, setDismissedCriticalIds] = useState({});
    // Tier 2: normal pending identity queue (banner is rendered only on CameraScreen)
    const [pendingBannerAlerts, setPendingBannerAlerts] = useState([]);
    const [showCriticalBanner, setShowCriticalBanner] = useState(false);
    const [queuePaused, setQueuePaused] = useState(false);

    const [autoPoppedPendingIds, setAutoPoppedPendingIds] = useState({});
    const [snoozedGroupUntil, setSnoozedGroupUntil] = useState({});
    const [suppressPending, setSuppressPending] = useState(false);
    const appStartAtRef = useRef(Date.now());
    const lastAutoPopupAtRef = useRef(0);
<<<<<<< HEAD

    const syncLockRef = useRef(false);
    const realtimeChannelRef = useRef(null);
    const realtimeSyncTimerRef = useRef(null);
    const lastRealtimeAtRef = useRef(0);
    const lastSyncAtRef = useRef(0);
    const syncDebounceRef = useRef(null);
    const poppedAlertIdsRef = useRef(new Set());

    const criticalPopupInFlight = useRef(new Set());
=======
>>>>>>> origin/main


    const getAlertGroupKey = useCallback((alert) => {
        if (!alert) return null;
        return String(
            alert.sessionId
            || alert.remoteReviewId
            || alert.dedupeKey
            || `${alert.type || 'pending'}:${alert.behaviorLabel || 'unknown'}:${alert.cameraId || 'no_camera'}`
        );
    }, []);

    // Reset on user change
    useEffect(() => {
        const userScope = session?.user?.id || 'anonymous';
        AlertEngine.setScope(userScope);
        setQueue([]);
        setCurrentAlert(null);
        setCriticalAlert(null);
        setPendingBannerAlerts([]);
        setDismissedCriticalIds({});
        setAutoPoppedPendingIds({});
        setSnoozedGroupUntil({});
        lastAutoPopupAtRef.current = 0;
    }, [session?.user?.id]);


    // One-time local clear to stop alert loop.


<<<<<<< HEAD
    const shouldShowCriticalOncePerCat = useCallback(async (candidate) => {
        if (!candidate?.id) return false;
        const type = String(candidate?.type || '').toLowerCase();
        if (type !== 'dashboard_low_score_40') return true;
        const catId = String(candidate?.catId || '');
        if (!catId) return true;
        const today = new Date().toISOString().slice(0, 10);
        const key = `critical_popup_once:${type}:${catId}`;
        if (criticalPopupInFlight.current.has(key)) return false;
        criticalPopupInFlight.current.add(key);
        try {
            const last = await AsyncStorage.getItem(key);
            if (last === today) return false;
            await AsyncStorage.setItem(key, today);
            return true;
        } finally {
            criticalPopupInFlight.current.delete(key);
        }
    }, []);

=======
    const openCriticalIfNeeded = useCallback((candidate) => {
        if (!candidate?.id) return;
        if (dismissedCriticalIds[candidate.id]) return;
        if (currentAlert) return; // do not stack critical over identity modal
        setCriticalAlert((prev) => (prev?.id === candidate.id ? prev : candidate));
    }, [dismissedCriticalIds, currentAlert]);
>>>>>>> origin/main

    // 1. Fetch Cats from DB when session exists

    useEffect(() => {
        let mounted = true;
        const clearOnce = async () => {
            const userScope = session?.user?.id || 'anonymous';
            const key = `alerts_cleared_once:${userScope}`;
            try {
                const already = await AsyncStorage.getItem(key);
                if (already) return;
                await AlertEngine.clearAll();
                if (mounted) {
                    setQueue([]);
                    setCurrentAlert(null);
                    setCriticalAlert(null);
                    setPendingBannerAlerts([]);
                }
                await AsyncStorage.setItem(key, '1');
            } catch (_) {
                // no-op
            }
        };
        clearOnce();
        return () => { mounted = false; };
    }, [session?.user?.id]);

    // Force-enable pending once (to exit suppressed state).
    useEffect(() => {
        let mounted = true;
        const enableOnce = async () => {
            const userScope = session?.user?.id || 'anonymous';
            const key = `alerts_force_enable_pending_once:${userScope}`;
            try {
                const already = await AsyncStorage.getItem(key);
                if (already) return;
                const v = await AsyncStorage.getItem('alerts_suppress_pending');
                if (v === '1') {
                    await AsyncStorage.setItem('alerts_suppress_pending', '0');
                    if (mounted) setSuppressPending(false);
                }
                await AsyncStorage.setItem(key, '1');
            } catch (_) { }
        };
        enableOnce();
        return () => { mounted = false; };
    }, [session?.user?.id]);

    // Always enforce suppression flag (hard stop for pending loops).
    useEffect(() => {
        let mounted = true;
        const loadSuppress = async () => {
            try {
                const v = await AsyncStorage.getItem('alerts_suppress_pending');
                const on = v === '1';
                if (mounted) setSuppressPending(on);
                if (on) {
                    await AlertEngine.clearAll();
                    if (mounted) {
                        setQueue([]);
                        setCurrentAlert(null);
                        setCriticalAlert(null);
                        setPendingBannerAlerts([]);
                    }
                }
            } catch (_) { }
        };
        loadSuppress();
        return () => { mounted = false; };
    }, []);

    // Allow screens (e.g., CameraScreen) to toggle pending suppression on the fly.
    useEffect(() => {
        const sub = DeviceEventEmitter.addListener('alerts:suppress_pending', (value) => {
            const next = !!value;
            setSuppressPending(next);
            if (next) {
                setQueue([]);
                setCurrentAlert(null);
                setPendingBannerAlerts([]);
            }
        });
        return () => sub.remove();
    }, []);

    // Fetch cats for CatPickerModal
    const fetchCats = useCallback(async () => {
        let userId = session?.user?.id || null;
        if (!userId) {
            try {
                const { data: { session: authSession } } = await supabase.auth.getSession();
                userId = authSession?.user?.id || null;
            } catch (_) { }
        }
        if (!userId) return;
            try {
                const scopedCatsKey = `camera_selectedCats:${userId}`;
                const scopedCameraIdKey = `camera_id:${userId}`;
                const [savedCatsJson, savedMode] = await Promise.all([
                    AsyncStorage.getItem(scopedCatsKey),
                    AsyncStorage.getItem(`camera_monitoringMode:${userId}`),
                ]);
                let selectedIds = [];
                if (savedCatsJson) {
                    try {
                        const parsed = JSON.parse(savedCatsJson);
                        if (Array.isArray(parsed)) selectedIds = parsed.map((v) => String(v));
                    } catch (_) { }
                }
                const fallbackMode = String(savedMode || 'multi').toLowerCase();

                let storedCameraId =
                    (await AsyncStorage.getItem(scopedCameraIdKey)) ||
                    (await AsyncStorage.getItem('camera_id'));
                if (storedCameraId) {
                    const { data: camCats } = await supabase
                        .from('camera_cats')
                        .select('cat_id, is_primary, assigned_at')
                        .eq('camera_id', storedCameraId)
                        .order('is_primary', { ascending: false })
                        .order('assigned_at', { ascending: true });
                    if (Array.isArray(camCats) && camCats.length > 0) {
                        selectedIds = camCats.map((r) => String(r.cat_id));
                    }
                }

                let effectiveMode = fallbackMode;
                if (storedCameraId) {
                    const { data: camRow } = await supabase
                        .from('cameras')
                        .select('mode, ai_mode')
                        .eq('id', storedCameraId)
                        .maybeSingle();
                    const rawMode = String(camRow?.ai_mode || camRow?.mode || '').toLowerCase();
                    if (rawMode) {
                        effectiveMode = rawMode.includes('single') ? 'single' : 'multi';
                    }
                }

                const { data, error } = await supabase
                    .from('cats')
                    .select('id, name, image_url')
                    .eq('owner_id', userId);
                if (!error && data) {
                    let list = data || [];
                    if (selectedIds.length > 0) {
                        const indexById = new Map(selectedIds.map((id, idx) => [String(id), idx]));
                        list = list
                            .filter((c) => indexById.has(String(c.id)))
                            .sort((a, b) => (indexById.get(String(a.id)) ?? 0) - (indexById.get(String(b.id)) ?? 0));
                        if (list.length === 0 && data.length > 0) {
                            list = data;
                        }
                    }
                    if (effectiveMode === 'single' && list.length > 1) {
                        list = [list[0]];
                    }
                    // Keep local storage aligned with DB-derived settings.
                    if (storedCameraId) {
                        await AsyncStorage.setItem(`camera_monitoringMode:${userId}`, effectiveMode);
                        await AsyncStorage.setItem('camera_monitoringMode', effectiveMode);
                        if (selectedIds.length > 0) {
                            await AsyncStorage.setItem(scopedCatsKey, JSON.stringify(selectedIds));
                            await AsyncStorage.setItem('camera_selectedCats', JSON.stringify(selectedIds));
                        }
                    }
                    setCatsFromDb(list);
                }
            } catch (err) {
                console.error('GlobalAlertQueue: Failed to fetch cats', err);
            }
    }, [session?.user?.id]);

    useEffect(() => {
        fetchCats();
    }, [fetchCats]);

    useEffect(() => {
        if (currentAlert) fetchCats();
    }, [currentAlert?.id, fetchCats]);

    // Sync remote on login
    useEffect(() => {
        if (!session?.user?.id) return;
        AlertRepository.init();
        AlertRepository.syncFromRemote();
    }, [session?.user?.id]);

<<<<<<< HEAD

    const requestSync = useCallback(() => {
        if (syncDebounceRef.current) return;
        syncDebounceRef.current = setTimeout(async () => {
            syncDebounceRef.current = null;
            if (syncLockRef.current) return;
            syncLockRef.current = true;
            try {
                await AlertRepository.syncFromRemote();
                lastSyncAtRef.current = Date.now();
            } finally {
                syncLockRef.current = false;
            }
        }, 400);
    }, []);

    // Poll remote alerts as fallback. Skipped when realtime is fresh.
    useEffect(() => {
        if (!session?.user?.id) return;
        const poll = () => {
            const now = Date.now();
            const lastRt = lastRealtimeAtRef.current || 0;
            if (now - lastRt < 30000) return;
            requestSync();
        };
        // 60s fallback poll (primary source is realtime subscription)
        const t = setInterval(poll, 60000);
        return () => clearInterval(t);
    }, [session?.user?.id, requestSync]);

    // Track current camera id for realtime subscription refresh.
    useEffect(() => {
        if (!session?.user?.id) return;
        let mounted = true;
        const scopedCameraIdKey = `camera_id:${session.user.id}`;
        const loadCameraId = async () => {
            const stored =
                (await AsyncStorage.getItem(scopedCameraIdKey)) ||
                (await AsyncStorage.getItem('camera_id'));
            if (mounted) setRealtimeCameraId(stored || null);
        };
        loadCameraId();
        const t = setInterval(loadCameraId, 15000);
        return () => { mounted = false; clearInterval(t); };
    }, [session?.user?.id]);

    // Realtime subscription for alerts + identity review.
    useEffect(() => {
        if (!session?.user?.id) return;

        let active = true;
        const userId = session.user.id;
        const cameraId = realtimeCameraId || null;

        const scheduleSync = () => {
            lastRealtimeAtRef.current = Date.now();
            if (!active) return;
            requestSync();
        };

        const channelName = `alerts_realtime:${userId}:${cameraId || 'no_camera'}`;
        const channel = supabase.channel(channelName);
        channel.on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'alerts', filter: `owner_id=eq.${userId}` },
            scheduleSync
        );
        if (cameraId) {
            channel.on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'ai_cat_identity_review', filter: `camera_id=eq.${cameraId}` },
                scheduleSync
            );
        }
        channel.subscribe();
        realtimeChannelRef.current = channel;

        return () => {
            active = false;
            if (realtimeSyncTimerRef.current) {
                clearTimeout(realtimeSyncTimerRef.current);
                realtimeSyncTimerRef.current = null;
            }
            if (syncDebounceRef.current) {
                clearTimeout(syncDebounceRef.current);
                syncDebounceRef.current = null;
            }
            if (realtimeChannelRef.current) {
                supabase.removeChannel(realtimeChannelRef.current);
                realtimeChannelRef.current = null;
            }
        };
    }, [session?.user?.id, realtimeCameraId]);

    // --- Critical alert helpers ---
    const findTopCritical = useCallback(() => {
        const list = AlertEngine.getHistory().filter(
            (a) =>
                a?.severity === 'critical'
                && !a?.resolved
                && !a?.isDeleted
                && !(a?.type === 'pending_identity' && a?.pendingIdentityConfirm === true)
                && normalizeBehaviorLabelLocal(a?.behaviorLabel || a?.metadata?.behaviorLabel || a?.metadata?.behavior || '') !== 'activity'
        );
        return list[0] || null;
    }, []);

    const openCriticalIfNeeded = useCallback((candidate) => {
        if (!candidate?.id) return;
        if (candidate.isRead || candidate.resolved) return; // Persistent guard
        if (dismissedCriticalIds[candidate.id]) return;
        if (poppedAlertIdsRef.current.has(String(candidate.id))) return;
        if (currentAlert) return; 

        // CHECK SNOOZE
        const groupKey = getAlertGroupKey(candidate);
        if (groupKey && Number(snoozedGroupUntil[groupKey] || 0) > Date.now()) return;

        const tsMs = new Date(candidate.timestamp || 0).getTime();
        const isFresh = Number.isFinite(tsMs)
            ? (tsMs >= (appStartAtRef.current - CRITICAL_AUTOPOP_FRESHNESS_MS))
            : false;
        if (!isFresh) return;
        
        poppedAlertIdsRef.current.add(String(candidate.id));
        setCriticalAlert((prev) => (prev?.id === candidate.id ? prev : candidate));
        setShowCriticalBanner(true);
    }, [dismissedCriticalIds, currentAlert]);

    const findPendingForCritical = useCallback((alert) => {
        if (!alert?.id) return null;
        const sessionId = `abnormal_alert:${alert.id}`;
        const dedupeKey = `abnormal_identity:${alert.id}`;
        return AlertEngine.getPendingIdentities().find((a) =>
            String(a?.id || '') === String(alert.id)
            || String(a?.sessionId || '') === sessionId
            || String(a?.dedupeKey || '') === dedupeKey
        ) || null;
    }, []);

    // --- IDENTITY_PENDING listener ---

    // Background sync to keep unread badge up-to-date even if realtime misses
    useEffect(() => {
        if (!session?.user?.id) return;
        let cancelled = false;
        const tick = async () => {
            if (cancelled) return;
            await AlertRepository.syncFromRemote({ skipIdentityReview: true });
        };
        tick();
        const interval = setInterval(tick, 20000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [session?.user?.id]);

=======
>>>>>>> origin/main
    // 2. Listen for Auto-Popup events from AlertEngine

    useEffect(() => {
        const handleNewPendingAlert = (alert) => {
            if (!alert?.id) return;
            if (suppressPending) return;
            const tsMs = new Date(alert.timestamp || 0).getTime();
            const isAbnormal = isAlertAbnormal(alert);
            const freshnessWindow = isAbnormal ? 15 * 60 * 1000 : 5000; // 15m for abnormal, 5s for normal
            const isFresh = Number.isFinite(tsMs)
                ? (tsMs >= (appStartAtRef.current - freshnessWindow))
                : false;

            if (isAbnormal) {
                // Tier 1: abnormal → push to critical-style full-screen red popup immediately
                
                // Extra guard: If already read or resolved, do not pop again
                if (alert.isRead || alert.resolved) return;

                // Check for snooze
                const groupKey = getAlertGroupKey(alert);
                if (groupKey && Number(snoozedGroupUntil[groupKey] || 0) > Date.now()) return;

                setQueuePaused(false);

                // For abnormal pending_identity, prefer CatPicker modal and skip critical modal
                // Do not auto-open old alerts on app launch (prevents login popup loops)
                if (!isFresh) return;
                // Open picker immediately if idle; otherwise queue.
                if (!currentAlert) {
                    setCurrentAlert(alert);
                    setAutoPoppedPendingIds((prev) => ({ ...prev, [alert.id]: true }));
                    return;
                }
                setQueue((prev) => {
                    if (prev.some((a) => a.id === alert.id) || currentAlert?.id === alert.id) return prev;
                    return [alert, ...prev].slice(-MAX_PENDING_QUEUE);
                });
                setAutoPoppedPendingIds((prev) => ({ ...prev, [alert.id]: true }));
                return;
            }

            // Tier 2: normal identity → add to banner (not auto-popup)
            if (autoPoppedPendingIds[alert.id]) return;
            const groupKey = getAlertGroupKey(alert);
            if (groupKey && Number(snoozedGroupUntil[groupKey] || 0) > Date.now()) return;
            const bannerRaw = alert?.behaviorLabel || alert?.metadata?.behaviorLabel || alert?.metadata?.behavior || '';
            if (!isBannerBehavior(bannerRaw)) return;

            if (!currentAlert) {
                setCurrentAlert(alert);
                setAutoPoppedPendingIds((prev) => ({ ...prev, [alert.id]: true }));
                return;
            }
            setQueue((prev) => {
                if (prev.some((a) => a.id === alert.id) || currentAlert?.id === alert.id) return prev;
                return [alert, ...prev].slice(-MAX_PENDING_QUEUE);
            });
            setAutoPoppedPendingIds((prev) => ({ ...prev, [alert.id]: true }));
            return;
        };

        AlertEngine.on(AlertEvents.IDENTITY_PENDING, handleNewPendingAlert);
        return () => AlertEngine.off(AlertEvents.IDENTITY_PENDING, handleNewPendingAlert);
    }, [currentAlert, autoPoppedPendingIds, getAlertGroupKey, snoozedGroupUntil, openCriticalIfNeeded, suppressPending]);

    // Sync pending banner on app (re)launch so pending alerts show after reopen.
    useEffect(() => {
        const syncPendingFromEngine = () => {
            if (suppressPending) {
                setPendingBannerAlerts([]);
                return;
            }
            
            const allPending = AlertEngine.getPendingIdentities();
            
            // Auto-popup unread abnormal alerts if they are fresh
            if (!currentAlert) {
                const unreadAbnormal = allPending.find(a => {
                    if (!isAlertAbnormal(a)) return false;
                    if (a.isRead || a.resolved) return false;

                    // CHECK SNOOZE
                    const groupKey = getAlertGroupKey(a);
                    if (groupKey && Number(snoozedGroupUntil[groupKey] || 0) > Date.now()) return false;

                    const tsMs = new Date(a.timestamp || 0).getTime();
                    const freshnessWindow = 15 * 60 * 1000;
                    return tsMs >= (appStartAtRef.current - freshnessWindow);
                });
                if (unreadAbnormal) {
                    setCurrentAlert(unreadAbnormal);
                    setAutoPoppedPendingIds((prev) => ({ ...prev, [unreadAbnormal.id]: true }));
                }
            }

            const pendingForBanner = allPending.filter((a) => {
                if (isAlertAbnormal(a)) return false;
                const raw = a?.behaviorLabel || a?.metadata?.behaviorLabel || a?.metadata?.behavior || '';
                if (!isBannerBehavior(raw)) return false;
                const tsMs = new Date(a.timestamp || 0).getTime();
                const isFresh = Number.isFinite(tsMs)
                    ? (tsMs >= (appStartAtRef.current - PENDING_BANNER_FRESHNESS_MS))
                    : false;
                return isFresh;
            });
            if (pendingForBanner.length === 0) {
                setPendingBannerAlerts([]);
                return;
            }
            const latestByBehavior = [];
            const seen = new Set();
            for (const a of pendingForBanner.slice().reverse()) {
                const key = normalizeBehaviorLabelLocal(a?.behaviorLabel || '');
                if (!key) continue;
                if (seen.has(key)) continue;
                seen.add(key);
                latestByBehavior.push(a);
            }
            setPendingBannerAlerts(latestByBehavior.slice(-MAX_PENDING_QUEUE));
        };
        syncPendingFromEngine();
        AlertEngine.on(AlertEvents.UPDATED, syncPendingFromEngine);
        return () => AlertEngine.off(AlertEvents.UPDATED, syncPendingFromEngine);
    }, [session?.user?.id, suppressPending, currentAlert]);

    // --- IDENTITY_RESOLVED listener — remove resolved alerts from banner instantly ---
    useEffect(() => {
        const handleResolved = (resolvedAlert) => {
            if (!resolvedAlert?.id) return;
            const rid = String(resolvedAlert.id);
            const sid = resolvedAlert.sessionId ? String(resolvedAlert.sessionId) : null;
            setPendingBannerAlerts((prev) => {
                const next = prev.filter((a) => {
                    if (String(a.id) === rid) return false;
                    if (sid && a.sessionId && String(a.sessionId) === sid) return false;
                    return true;
                });
                return next;
            });
            // Also remove from queue so picker doesn't re-open
            setQueue((prev) => prev.filter((a) => {
                if (String(a.id) === rid) return false;
                if (sid && a.sessionId && String(a.sessionId) === sid) return false;
                return true;
            }));
        };
        AlertEngine.on(AlertEvents.IDENTITY_RESOLVED, handleResolved);
        return () => AlertEngine.off(AlertEvents.IDENTITY_RESOLVED, handleResolved);
    }, []);

    // --- Global Critical / behavior_abnormal listener ---
    useEffect(() => {
<<<<<<< HEAD
        let mounted = true;

        const handleNewCritical = async (alert) => {
            if (!alert || !mounted) return;
            const allowed = await shouldShowCriticalOncePerCat(alert);
            if (!mounted) return;
            if (!allowed) {
                setDismissedCriticalIds((prev) => ({ ...prev, [alert.id]: true }));
                return;
            }
            openCriticalIfNeeded(alert);
        };

        const handleUpdated = () => {
            const top = findTopCritical();
            if (top) openCriticalIfNeeded(top);
            else setCriticalAlert(null);
=======
        const handleNewCritical = (alert) => {
            if (!alert) return;
            openCriticalIfNeeded(alert);
        };
        const handleUpdated = () => {
            const topCritical = findTopCritical();
            if (topCritical) {
                openCriticalIfNeeded(topCritical);
                return;
            }
            setCriticalAlert(null);
>>>>>>> origin/main
        };

        handleUpdated();
        AlertEngine.on(AlertEvents.NEW_CRITICAL, handleNewCritical);
        AlertEngine.on(AlertEvents.UPDATED, handleUpdated);

        return () => {
            AlertEngine.off(AlertEvents.NEW_CRITICAL, handleNewCritical);
            AlertEngine.off(AlertEvents.UPDATED, handleUpdated);
        };
    }, [findTopCritical, openCriticalIfNeeded]);

    // --- Queue Processor ---
    useEffect(() => {
        if (!currentAlert && queue.length > 0) {
            if (suppressPending) {
                setQueue([]);
                return;
            }
            if (queuePaused) return;
            const timer = setTimeout(() => {
                const next = queue[0];
                setCurrentAlert(next);
                setQueue((prev) => prev.slice(1));
                lastAutoPopupAtRef.current = Date.now();
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [queue, currentAlert, queuePaused, suppressPending]);

    // Expose manual push method — always resets pause so picker opens immediately
    const pushAlert = useCallback((alert) => {
        if (suppressPending && alert?.pendingIdentityConfirm === true) return;
        setQueuePaused(false);
        setQueue((prev) => {
            if (prev.some((a) => a.id === alert.id) || currentAlert?.id === alert.id) return prev;
            return [alert, ...prev];
        });
    }, [currentAlert, suppressPending]);

    const openPendingQueue = useCallback(() => {
        if (suppressPending) return;
        const allPending = [...pendingBannerAlerts, ...AlertEngine.getPendingIdentities()];
        const unique = [];
        const seen = new Set();
        for (const a of allPending) {
            if (!a?.id || seen.has(a.id)) continue;
            const raw = a?.behaviorLabel || a?.metadata?.behaviorLabel || a?.metadata?.behavior || '';
            if (isAlertAbnormal(a)) continue;
            if (!isBannerBehavior(raw)) continue;
            const tsMs = new Date(a.timestamp || 0).getTime();
            const isFresh = Number.isFinite(tsMs)
                ? (tsMs >= (appStartAtRef.current - PENDING_BANNER_FRESHNESS_MS))
                : false;
            if (!isFresh) continue;
            seen.add(a.id);
            unique.push(a);
        }
        if (unique.length > 0) {
            setQueuePaused(false);
            setQueue(unique.filter((a) => a.id !== currentAlert?.id));
            setPendingBannerAlerts([]);
        }
    }, [currentAlert, pendingBannerAlerts, suppressPending]);

    // --- Modal Handlers ---
    const handleSelect = async (catId) => {
        if (!currentAlert) return;
        const selectedCat = catsFromDb.find((c) => c.id === catId);
        await AlertRepository.resolveIdentityOnRemote(currentAlert, catId, 'user', selectedCat?.name || null);
        await AlertRepository.resolveLocalIdentityGroup(currentAlert, catId, 'user', selectedCat?.name || null);
        // Remove from banner queue too
        setPendingBannerAlerts((prev) => {
            const next = prev.filter((a) => a.id !== currentAlert.id && a.sessionId !== currentAlert.sessionId);
            return next;
        });
        setQueuePaused(false);
        if (shouldNavigateAfterResolve(currentAlert)) {
            DeviceEventEmitter.emit('pendingIdentityResolved', {
                id: currentAlert.id,
                behaviorLabel: currentAlert.behaviorLabel || null,
            });
        }
        setCurrentAlert(null);
    };

    const handleSkip = async () => {
        if (!currentAlert) return;
        await AlertRepository.resolveIdentityOnRemote(currentAlert, null, 'skipped');
        await AlertRepository.resolveLocalIdentityGroup(currentAlert, null, 'skipped', 'Skipped');
        setPendingBannerAlerts((prev) => {
            const next = prev.filter((a) => a.id !== currentAlert.id);
            return next;
        });
        setQueuePaused(false);
        if (shouldNavigateAfterResolve(currentAlert)) {
            DeviceEventEmitter.emit('pendingIdentityResolved', {
                id: currentAlert.id,
                behaviorLabel: currentAlert.behaviorLabel || null,
            });
        }
        setCurrentAlert(null);
    };

    const handleReject = async (reason = 'not_this_cat') => {
        if (!currentAlert) return;
        const label = reason === 'not_a_cat' ? 'Not a cat' : 'Not your cat';
        await AlertRepository.resolveIdentityOnRemote(currentAlert, null, 'skipped', label);
        await AlertRepository.resolveLocalIdentityGroup(currentAlert, null, 'skipped', label);
        setPendingBannerAlerts((prev) => {
            const next = prev.filter((a) => a.id !== currentAlert.id);
            return next;
        });
        setQueuePaused(false);
        if (shouldNavigateAfterResolve(currentAlert)) {
            DeviceEventEmitter.emit('pendingIdentityResolved', {
                id: currentAlert.id,
                behaviorLabel: currentAlert.behaviorLabel || null,
            });
        }
        setCurrentAlert(null);
    };

    // Dismiss = close modal temporarily, alert stays in pendingBannerAlerts (banner remains visible)
    const handleDismiss = () => {
        if (currentAlert) {
            const groupKey = getAlertGroupKey(currentAlert);
            if (groupKey) {
                setSnoozedGroupUntil((prev) => ({
                    ...prev,
                    [groupKey]: Date.now() + DISMISS_SNOOZE_MS,
                }));
            }
            // Mark as read in engine so Tier 1 (critical modal) doesn't catch it immediately
            AlertEngine.markAsRead(currentAlert.id);
        }

        setCurrentAlert(null);
        // Do NOT remove from pendingBannerAlerts — banner should still show so user can re-open
    };

    const dismissCritical = useCallback(() => {
        if (!criticalAlert?.id) { setCriticalAlert(null); setShowCriticalBanner(false); return; }
        
        // Mark as read locally so it doesn't pop again even after refresh
        AlertEngine.markAsRead(criticalAlert.id);
        
        setDismissedCriticalIds((prev) => ({ ...prev, [criticalAlert.id]: true }));
        setCriticalAlert(null);
        setShowCriticalBanner(false);
    }, [criticalAlert]);

    const handleSelectFromCritical = useCallback(async (catId) => {
        if (!criticalAlert) return;
        const selectedCat = catsFromDb.find((c) => c.id === catId);

        if (criticalAlert.type === 'pending_identity' || criticalAlert.pendingIdentityConfirm === true) {
            await AlertRepository.resolveIdentityOnRemote(criticalAlert, catId, 'user', selectedCat?.name || null);
            await AlertRepository.resolveLocalIdentityGroup(criticalAlert, catId, 'user', selectedCat?.name || null);
        } else {
            const rawBehavior = criticalAlert?.behaviorLabel || criticalAlert?.metadata?.behavior || criticalAlert?.metadata?.behaviorLabel;
            const behaviorLabel = normalizeBehaviorLabelLocal(rawBehavior || 'abnormal');
            const sessionId = `abnormal_alert:${criticalAlert.id}`;
            const pendingExisting = findPendingForCritical(criticalAlert);
            if (!pendingExisting) {
                await AlertEngine.logPendingIdentity({
                    behaviorLabel,
                    confidence: criticalAlert?.confidence ?? criticalAlert?.metadata?.confidence ?? null,
                    cropSnapshot: criticalAlert?.cropSnapshot || null,
                    multiSnapshots: criticalAlert?.multiSnapshots || null,
                    sessionId,
                    source: criticalAlert?.source || 'alerts_table',
                    isAbnormal: true,
                    dedupeKey: `abnormal_identity:${criticalAlert.id}`,
                    cooldownMs: 48 * 60 * 60 * 1000,
                });
            }
            const pending = findPendingForCritical(criticalAlert);
            if (pending) {
                await AlertRepository.resolveIdentityOnRemote(pending, catId, 'user', selectedCat?.name || null);
                await AlertRepository.resolveLocalIdentityGroup(pending, catId, 'user', selectedCat?.name || null);
            }
        }

        setPendingBannerAlerts((prev) => prev.filter((a) =>
            a.id !== criticalAlert.id && a.sessionId !== criticalAlert.sessionId
        ));
        setQueue((prev) => prev.filter((a) =>
            a.id !== criticalAlert.id && a.sessionId !== criticalAlert.sessionId
        ));
        if (criticalAlert) {
            AlertEngine.markAsRead(criticalAlert.id);
        }
        setDismissedCriticalIds((prev) => ({ ...prev, [criticalAlert.id]: true }));
        setCriticalAlert(null);
    }, [criticalAlert, catsFromDb, findPendingForCritical]);

    const openIdentifyFromCritical = useCallback(async () => {
        if (!criticalAlert) return;
        if (criticalAlert.type === 'pending_identity' || criticalAlert.pendingIdentityConfirm === true) {
            setDismissedCriticalIds((prev) => ({ ...prev, [criticalAlert.id]: true }));
            setCriticalAlert(null);
            setTimeout(() => openPendingQueue(), 0);
            return;
        }
        const alreadyPending = findPendingForCritical(criticalAlert);
        if (alreadyPending) {
            setDismissedCriticalIds((prev) => ({ ...prev, [criticalAlert.id]: true }));
            setCriticalAlert(null);
            setTimeout(() => openPendingQueue(), 0);
            return;
        }
        const rawBehavior = criticalAlert?.behaviorLabel || criticalAlert?.metadata?.behavior || criticalAlert?.metadata?.behaviorLabel;
        const behaviorLabel = normalizeBehaviorLabelLocal(rawBehavior || 'abnormal');
        await AlertEngine.logPendingIdentity({
            behaviorLabel,
            confidence: criticalAlert?.confidence ?? criticalAlert?.metadata?.confidence ?? null,
            cropSnapshot: criticalAlert?.cropSnapshot || null,
            multiSnapshots: criticalAlert?.multiSnapshots || null,
            sessionId: `abnormal_alert:${criticalAlert.id}`,
            source: criticalAlert?.source || 'alerts_table',
            isAbnormal: true,
            dedupeKey: `abnormal_identity:${criticalAlert.id}`,
            cooldownMs: 48 * 60 * 60 * 1000,
        });
        setDismissedCriticalIds((prev) => ({ ...prev, [criticalAlert.id]: true }));
        setCriticalAlert(null);
        setTimeout(() => openPendingQueue(), 0);
    }, [criticalAlert, findPendingForCritical, openPendingQueue]);

    const criticalSnapshots = useMemo(() => {
        if (!criticalAlert) return [];
        const raw = [];
        if (criticalAlert.cropSnapshot) raw.push({ path: criticalAlert.cropSnapshot });
        if (Array.isArray(criticalAlert.multiSnapshots)) {
            for (const s of criticalAlert.multiSnapshots) {
                if (typeof s === 'string') raw.push({ path: s });
                else if (s?.path || s?.url || s?.uri) raw.push({ path: s.path || s.url || s.uri });
            }
        }
        const seen = new Set();
        return raw.filter((s) => {
            const key = String(s?.path || '');
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [criticalAlert]);

    const criticalTimeText = useMemo(() => {
        if (!criticalAlert?.timestamp) return '';
        try { return new Date(criticalAlert.timestamp).toLocaleString(); } catch (_) { return ''; }
    }, [criticalAlert]);

    return (
        <GlobalAlertQueueContext.Provider value={{
            pushAlert,
            openPendingQueue,
            pendingBannerAlerts,
            pendingCount: pendingBannerAlerts.length,
            criticalAlert,
            showCriticalBanner,
            setShowCriticalBanner,
        }}>

            {showCriticalBanner && criticalAlert && (
                <SafeAreaView edges={['top']} style={styles.redBannerOuter}>
                    <Pressable
                        style={styles.redBanner}
                        onPress={() => {
                            setQueuePaused(true);
                        }}
                    >
                        <MaterialCommunityIcons name='alert-circle' size={20} color='#FFF' />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.redBannerText} numberOfLines={1}>
                                {criticalAlert.title || 'Critical Alert'}
                            </Text>
                            <Text style={styles.redBannerSubtext} numberOfLines={1}>
                                {criticalAlert.desc || 'Immediate attention required'}
                            </Text>
                        </View>
                        <Ionicons name='chevron-forward' size={18} color='rgba(255,255,255,0.7)' />
                    </Pressable>
                </SafeAreaView>
            )}
            {children}

            
            {/* ─── Critical/Abnormal Modal (Tier 1) ────── */}
            <Modal
                visible={criticalAlert !== null}
                transparent
                animationType="fade"
            >
                <Pressable style={styles.criticalBackdrop} onPress={dismissCritical}>
                    <Pressable style={styles.criticalCard} onPress={(e) => e.stopPropagation()}>
                        <Text style={styles.criticalTitle}>
                            {criticalAlert?.title || 'Critical Alert!'}
                        </Text>
                        {criticalAlert?.desc && (
                            <Text style={styles.criticalHeading}>{criticalAlert.desc}</Text>
                        )}
                        {criticalAlert?.details && (
                            <Text style={styles.criticalDesc}>{criticalAlert.details}</Text>
                        )}
                        {criticalSnapshots.length > 0 && (
                            <View style={styles.criticalMedia}>
                                <Image
                                    source={{ uri: criticalSnapshots[0].path }}
                                    style={styles.criticalHero}
                                />
                                {criticalSnapshots.length > 1 && (
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.criticalThumbRow}>
                                        {criticalSnapshots.slice(1).map((snap, idx) => (
                                            <Image
                                                key={`${snap.path}-${idx}`}
                                                source={{ uri: snap.path }}
                                                style={styles.criticalThumb}
                                            />
                                        ))}
                                    </ScrollView>
                                )}
                            </View>
                        )}
                        <Text style={styles.criticalTime}>{criticalTimeText}</Text>
                        {Array.isArray(catsFromDb) && catsFromDb.length > 0 && (
                            <View style={styles.criticalCatRow}>
                                {catsFromDb.map((cat) => (
                                    <Pressable
                                        key={cat.id}
                                        style={styles.criticalCatBtn}
                                        onPress={() => handleSelectFromCritical(cat.id)}
                                    >
                                        {cat?.image_url ? (
                                            <Image source={{ uri: cat.image_url }} style={styles.criticalCatAvatar} />
                                        ) : (
                                            <MaterialCommunityIcons name="cat" size={18} color="#B42318" />
                                        )}
                                        <Text style={styles.criticalCatLabel} numberOfLines={1}>{cat.name || 'Cat'}</Text>
                                    </Pressable>
                                ))}
                            </View>
                        )}
                        <View style={styles.criticalActions}>
                            <Pressable style={styles.criticalBtn} onPress={dismissCritical}>
                                <Text style={styles.criticalBtnText}>Dismiss</Text>
                            </Pressable>
                            {criticalAlert?.type === 'pending_identity' && (
                                <Pressable style={[styles.criticalBtn, styles.criticalBtnPrimary]} onPress={openIdentifyFromCritical}>
                                    <Text style={[styles.criticalBtnText, { color: '#FFF' }]} >Identify Cat</Text>
                                </Pressable>
                            )}
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>


            {/* ─── CatPickerModal (Tier 1 + manual from banner) ────── */}
            <CatPickerModal
                visible={currentAlert !== null && (!suppressPending || currentAlert?.pendingIdentityConfirm !== true)}
                alert={currentAlert}
                cats={catsFromDb}
                onSelect={handleSelect}
                onSkip={handleSkip}
                onReject={handleReject}
                onDismiss={handleDismiss}
                onRemoveSnapshot={async (_idx, nextSnapshots) => {
                    if (!currentAlert) return;
                    const updated = { ...currentAlert, multiSnapshots: nextSnapshots };
                    setCurrentAlert(updated);
                    if (AlertEngine.patchAlert) {
                        await AlertEngine.patchAlert(currentAlert.id, { multiSnapshots: nextSnapshots });
                    }
                    await AlertRepository.updateReviewSnapshots(currentAlert, nextSnapshots);
                    if (Array.isArray(nextSnapshots) && nextSnapshots.length === 0) {
                        await AlertRepository.discardSessionOnRemote(currentAlert, 'Not a cat');
                        setPendingBannerAlerts((prev) => prev.filter((a) =>
                            a.id !== currentAlert.id && a.sessionId !== currentAlert.sessionId
                        ));
                        setQueue((prev) => prev.filter((a) =>
                            a.id !== currentAlert.id && a.sessionId !== currentAlert.sessionId
                        ));
                        setQueuePaused(false);
                        setCurrentAlert(null);
                    }
                }}
                queueLength={queue.length + 1}
                isForeignCatAlert={currentAlert?.isForeignCatAlert === true}
            />
        </GlobalAlertQueueContext.Provider>
    );
}


const styles = StyleSheet.create({
    criticalBackdrop: { flex: 1, backgroundColor: 'rgba(127, 29, 29, 0.58)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
    criticalCard: { width: '100%', maxWidth: 420, backgroundColor: '#FFFFFF', borderRadius: 18, paddingVertical: 18, paddingHorizontal: 16, borderWidth: 2, borderColor: '#B42318', shadowColor: '#7F1D1D', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 9 },
    criticalTitle: { fontSize: 16, fontWeight: '700', color: '#B42318', marginBottom: 8 },
    criticalHeading: { fontSize: 15, fontWeight: '600', color: '#1E293B', marginBottom: 6 },
    criticalDesc: { fontSize: 13, color: '#475569', marginBottom: 12 },
    criticalMedia: { marginBottom: 12 },
    criticalHero: { width: '100%', height: 180, borderRadius: 12, backgroundColor: '#FEF2F2' },
    criticalThumbRow: { marginTop: 8 },
    criticalThumb: { width: 64, height: 64, borderRadius: 8, marginRight: 8, backgroundColor: '#FEF2F2' },
    criticalTime: { fontSize: 11, color: '#94A3B8', marginBottom: 16 },
    criticalCatRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
    criticalCatBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5' },
    criticalCatAvatar: { width: 20, height: 20, borderRadius: 10, marginRight: 6 },
    criticalCatLabel: { fontSize: 12, color: '#7F1D1D', fontWeight: '600', maxWidth: 90 },
    criticalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
    criticalBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#F1F5F9' },
    criticalBtnPrimary: { backgroundColor: '#B42318' },
    criticalBtnText: { fontSize: 14, fontWeight: '600', color: '#475569' },
    redBannerOuter: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        backgroundColor: 'transparent',
    },
    redBanner: {
        marginHorizontal: 12,
        marginTop: Platform.OS === 'android' ? 32 : 8,
        backgroundColor: '#B42318',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 10,
    },
    redBannerText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
    redBannerSubtext: { color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '500' },
});





