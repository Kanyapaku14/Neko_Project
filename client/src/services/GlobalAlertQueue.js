/**
 * GlobalAlertQueue.js
 *
 * A global provider/manager that queues up `pending_identity` alerts and displays
 * them one by one using CatPickerModal.
 *
 * This fulfills the "Auto-Popup" and "Queue" requirements for uncertain behaviors.
 * If 3 alerts arrive at the same time, it shows the first one. When the user resolves
 * or skips it, the modal briefly closes and opens the next one.
 *
 * Usage:
 *   Wrap your app or main navigator with <GlobalAlertQueueProvider>
 *   The queue automatically listens to AlertEngine via AlertEvents.IDENTITY_PENDING
 */

import React, { createContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AlertEngine, { AlertEvents } from './AlertEngine';
import AlertRepository from './AlertRepository';
import CatPickerModal from '../components/alert/CatPickerModal';
import supabase from '../screens/config/supabaseClient'; // Make sure this path is correct based on where we place this file

export const GlobalAlertQueueContext = createContext({
    // Expose methods in case screens want to manually push to queue
    pushAlert: () => { },
    // Open the entire pending queue 
    openPendingQueue: () => { },
});

export function GlobalAlertQueueProvider({ children, session, activeScreen }) {
    const AUTO_POPUP_COOLDOWN_MS = 45 * 1000;
    const MAX_PENDING_QUEUE = 6;
    const [queue, setQueue] = useState([]);
    const [currentAlert, setCurrentAlert] = useState(null);
    const [catsFromDb, setCatsFromDb] = useState([]);
    const [criticalAlert, setCriticalAlert] = useState(null);
    const [dismissedCriticalIds, setDismissedCriticalIds] = useState({});
    const [autoPoppedPendingIds, setAutoPoppedPendingIds] = useState({});
    const [snoozedGroupUntil, setSnoozedGroupUntil] = useState({});
    const lastAutoPopupAtRef = useRef(0);
    const criticalPopupInFlight = useRef(new Set());

    const getAlertGroupKey = useCallback((alert) => {
        if (!alert) return null;
        return String(
            alert.sessionId
            || alert.remoteReviewId
            || alert.dedupeKey
            || `${alert.type || 'pending'}:${alert.behaviorLabel || 'unknown'}:${alert.cameraId || 'no_camera'}`
        );
    }, []);

    useEffect(() => {
        const userScope = session?.user?.id || 'anonymous';
        AlertEngine.setScope(userScope);
        setQueue([]);
        setCurrentAlert(null);
        setCriticalAlert(null);
        setDismissedCriticalIds({});
        setAutoPoppedPendingIds({});
        setSnoozedGroupUntil({});
        lastAutoPopupAtRef.current = 0;
    }, [session?.user?.id]);

    const findTopCritical = useCallback(() => {
        const criticalList = AlertEngine
            .getHistory()
            .filter((a) => a?.severity === 'critical' && !a?.resolved && !a?.isDeleted);
        if (!criticalList.length) return null;
        return criticalList[0];
    }, []);

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

    const openCriticalIfNeeded = useCallback((candidate) => {
        if (!candidate?.id) return;
        const type = String(candidate?.type || '').toLowerCase();
        if (type === 'dashboard_low_score_40') return;
        if (dismissedCriticalIds[candidate.id]) return;
        if (currentAlert) return; // do not stack critical over identity modal
        setCriticalAlert((prev) => (prev?.id === candidate.id ? prev : candidate));
    }, [dismissedCriticalIds, currentAlert]);

    // 1. Fetch Cats from DB when session exists
    useEffect(() => {
        const fetchCats = async () => {
            if (session?.user?.id) {
                try {
                    const { data, error } = await supabase
                        .from('cats')
                        .select('id, name, image_url')
                        .eq('owner_id', session.user.id);
                    if (!error && data) {
                        setCatsFromDb(data);
                    }
                } catch (err) {
                    console.error('GlobalAlertQueue: Failed to fetch cats', err);
                }
            }
        };
        fetchCats();
    }, [session]);

    // Keep local queue in sync with remote pending identities/alerts
    useEffect(() => {
        if (!session?.user?.id) return;
        AlertRepository.init();
        AlertRepository.syncFromRemote();
    }, [session?.user?.id]);

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

    // 2. Listen for Auto-Popup events from AlertEngine
    useEffect(() => {
        const handleNewPendingAlert = (alert) => {
            console.log('GlobalAlertQueue: Received new pending alert', alert);

            // NEW REQ: Only auto-popup if it's an abnormal behavior
            if (alert.isAbnormal !== true) {
                console.log('GlobalAlertQueue: Alert is normal, skipping Auto-Popup.');
                return;
            }
            if (!alert?.id) return;
            if (autoPoppedPendingIds[alert.id]) {
                // Already auto-popped in this app session; keep it in alert list only.
                return;
            }
            const groupKey = getAlertGroupKey(alert);
            const now = Date.now();
            if (groupKey && Number(snoozedGroupUntil[groupKey] || 0) > now) {
                return;
            }
            if (now - lastAutoPopupAtRef.current < AUTO_POPUP_COOLDOWN_MS) {
                return;
            }

            setQueue((prevQueue) => {
                // Prevent duplicate enqueuing of the exact same alert ID
                if (prevQueue.some(a => a.id === alert.id) || currentAlert?.id === alert.id) {
                    return prevQueue;
                }
                // Coalesce alerts by session/group so many-cat streams don't spam popups.
                const filtered = groupKey ? prevQueue.filter((a) => getAlertGroupKey(a) !== groupKey) : prevQueue;
                return [...filtered, alert].slice(-MAX_PENDING_QUEUE);
            });
            setAutoPoppedPendingIds((prev) => ({ ...prev, [alert.id]: true }));
        };

        AlertEngine.on(AlertEvents.IDENTITY_PENDING, handleNewPendingAlert);
        return () => AlertEngine.off(AlertEvents.IDENTITY_PENDING, handleNewPendingAlert);
    }, [currentAlert, autoPoppedPendingIds, getAlertGroupKey, snoozedGroupUntil]);

    // Global Critical Popup: show on every screen
    useEffect(() => {
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
        const handleUpdated = async () => {
            const topCritical = findTopCritical();
            if (!mounted) return;
            if (topCritical) {
                const allowed = await shouldShowCriticalOncePerCat(topCritical);
                if (!mounted) return;
                if (!allowed) {
                    setDismissedCriticalIds((prev) => ({ ...prev, [topCritical.id]: true }));
                    return;
                }
                openCriticalIfNeeded(topCritical);
                return;
            }
            setCriticalAlert(null);
        };

        // handle app boot/reload where critical already exists in storage
        handleUpdated();

        AlertEngine.on(AlertEvents.NEW_CRITICAL, handleNewCritical);
        AlertEngine.on(AlertEvents.UPDATED, handleUpdated);
        return () => {
            mounted = false;
            AlertEngine.off(AlertEvents.NEW_CRITICAL, handleNewCritical);
            AlertEngine.off(AlertEvents.UPDATED, handleUpdated);
        };
    }, [findTopCritical, openCriticalIfNeeded, shouldShowCriticalOncePerCat]);

    // 3. Queue Processor: Pop next alert when idle
    useEffect(() => {
        // If we aren't showing an alert right now, and the queue has items, show the first one
        if (!currentAlert && queue.length > 0) {
            // Small delay to allow fade-out of previous modal before fading in next
            const timer = setTimeout(() => {
                const nextAlert = queue[0];
                setCurrentAlert(nextAlert);
                setQueue((prev) => prev.slice(1));
                lastAutoPopupAtRef.current = Date.now();
            }, 300); // 300ms transition buffer
            return () => clearTimeout(timer);
        }
    }, [queue, currentAlert]);

    // Expose a manual push method for existing alerts (e.g. clicking 'Identify' from AlertScreen)
    const pushAlert = useCallback((alert) => {
        setQueue((prev) => {
            if (prev.some(a => a.id === alert.id) || currentAlert?.id === alert.id) return prev;
            // Put it at the front of the line since the user explicitly clicked it
            return [alert, ...prev];
        });
    }, [currentAlert]);

    // Expose a method to load ALL pending alerts (e.g. banner click)
    const openPendingQueue = useCallback(() => {
        const allPending = AlertEngine.getPendingIdentities();
        if (allPending.length > 0) {
            setQueue(() => {
                // Replace entire queue with all pending (excluding the one currently showing)
                return allPending.filter(a => a.id !== currentAlert?.id);
            });
        }
    }, [currentAlert]);

    // --- Modal Handlers ---

    const handleSelect = async (catId) => {
        if (!currentAlert) return;
        const selectedCat = catsFromDb.find(c => c.id === catId);
        await AlertRepository.resolveIdentityOnRemote(currentAlert, catId, 'user');
        await AlertRepository.resolveLocalIdentityGroup(currentAlert, catId, 'user', selectedCat?.name || null);
        setCurrentAlert(null); // Triggers effect #3 to pop next
    };

    const handleSkip = async () => {
        if (!currentAlert) return;
        await AlertRepository.resolveIdentityOnRemote(currentAlert, null, 'skipped');
        await AlertRepository.resolveLocalIdentityGroup(currentAlert, null, 'skipped', 'Not your cat');
        setCurrentAlert(null);
    };

    const handleReject = async () => {
        if (!currentAlert) return;
        await AlertRepository.resolveIdentityOnRemote(currentAlert, null, 'skipped');
        await AlertRepository.resolveLocalIdentityGroup(currentAlert, null, 'skipped', 'Not your cat');
        setCurrentAlert(null);
    };

    const handleDismiss = () => {
        // Just hide it, keep it un-resolved. Next time they open the app,
        // it won't auto-popup (auto-popup only happens on 'IDENTITY_PENDING' emit),
        // but they can still find it in AlertScreen.
        const groupKey = getAlertGroupKey(currentAlert);
        if (groupKey) {
            setSnoozedGroupUntil((prev) => ({
                ...prev,
                [groupKey]: Date.now() + (5 * 60 * 1000),
            }));
        }
        setCurrentAlert(null);
    };

    const dismissCritical = useCallback(() => {
        if (!criticalAlert?.id) {
            setCriticalAlert(null);
            return;
        }
        setDismissedCriticalIds((prev) => ({ ...prev, [criticalAlert.id]: true }));
        setCriticalAlert(null);
    }, [criticalAlert]);

    const criticalTimeText = useMemo(() => {
        if (!criticalAlert?.timestamp) return '';
        try {
            return new Date(criticalAlert.timestamp).toLocaleString();
        } catch (e) {
            return '';
        }
    }, [criticalAlert]);

    return (
        <GlobalAlertQueueContext.Provider value={{ pushAlert, openPendingQueue }}>
            {children}
            <Modal
                visible={criticalAlert !== null}
                transparent
                animationType="fade"
                onRequestClose={dismissCritical}
            >
                <Pressable style={styles.criticalBackdrop} onPress={dismissCritical}>
                    <Pressable style={styles.criticalCard} onPress={() => { }}>
                        <Text style={styles.criticalTitle}>
                            Critical Alert
                        </Text>
                        {!!criticalAlert?.title && (
                            <Text style={styles.criticalHeading}>{criticalAlert.title}</Text>
                        )}
                        {!!criticalAlert?.desc && (
                            <Text style={styles.criticalDesc}>{criticalAlert.desc}</Text>
                        )}
                        {!!criticalTimeText && (
                            <Text style={styles.criticalTime}>{criticalTimeText}</Text>
                        )}
                        <View style={styles.criticalActions}>
                            <Pressable style={styles.criticalBtn} onPress={dismissCritical}>
                                <Text style={styles.criticalBtnText}>Dismiss</Text>
                            </Pressable>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>
            <CatPickerModal
                visible={currentAlert !== null}
                alert={currentAlert}
                cats={catsFromDb}
                onSelect={handleSelect}
                onSkip={handleSkip}
                onReject={handleReject}
                onDismiss={handleDismiss}
                queueLength={queue.length}
            />
        </GlobalAlertQueueContext.Provider>
    );
}

const styles = StyleSheet.create({
    criticalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.36)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    criticalCard: {
        width: '100%',
        maxWidth: 420,
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        paddingVertical: 18,
        paddingHorizontal: 16,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 20,
        elevation: 9,
    },
    criticalTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#B42318',
        marginBottom: 8,
    },
    criticalHeading: {
        fontSize: 15,
        fontWeight: '700',
        color: '#1F2937',
        marginBottom: 6,
    },
    criticalDesc: {
        fontSize: 14,
        color: '#374151',
        lineHeight: 20,
    },
    criticalTime: {
        marginTop: 8,
        fontSize: 12,
        color: '#6B7280',
    },
    criticalActions: {
        marginTop: 14,
        alignItems: 'flex-end',
    },
    criticalBtn: {
        backgroundColor: '#B42318',
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 10,
    },
    criticalBtnText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
    },
});
