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

import React, { createContext, useState, useEffect, useCallback } from 'react';
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

export function GlobalAlertQueueProvider({ children, session }) {
    const [queue, setQueue] = useState([]);
    const [currentAlert, setCurrentAlert] = useState(null);
    const [catsFromDb, setCatsFromDb] = useState([]);

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

    // 2. Listen for Auto-Popup events from AlertEngine
    useEffect(() => {
        const handleNewPendingAlert = (alert) => {
            console.log('GlobalAlertQueue: Received new pending alert', alert);

            // NEW REQ: Only auto-popup if it's an abnormal behavior
            if (alert.isAbnormal !== true) {
                console.log('GlobalAlertQueue: Alert is normal, skipping Auto-Popup.');
                return;
            }

            setQueue((prevQueue) => {
                // Prevent duplicate enqueuing of the exact same alert ID
                if (prevQueue.some(a => a.id === alert.id) || currentAlert?.id === alert.id) {
                    return prevQueue;
                }
                return [...prevQueue, alert];
            });
        };

        AlertEngine.on(AlertEvents.IDENTITY_PENDING, handleNewPendingAlert);
        return () => AlertEngine.off(AlertEvents.IDENTITY_PENDING, handleNewPendingAlert);
    }, [currentAlert]);

    // 3. Queue Processor: Pop next alert when idle
    useEffect(() => {
        // If we aren't showing an alert right now, and the queue has items, show the first one
        if (!currentAlert && queue.length > 0) {
            // Small delay to allow fade-out of previous modal before fading in next
            const timer = setTimeout(() => {
                const nextAlert = queue[0];
                setCurrentAlert(nextAlert);
                setQueue((prev) => prev.slice(1));
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
        await AlertEngine.resolveIdentity(currentAlert.id, catId, 'user', selectedCat?.name || null);
        setCurrentAlert(null); // Triggers effect #3 to pop next
    };

    const handleSkip = async () => {
        if (!currentAlert) return;

        // If it's an abnormal (risky) behavior, we DON'T resolve it via "Skip".
        // It must be identified specifically to disappear from the banner.
        // We just hide the modal for now (Dismiss).
        if (currentAlert.isAbnormal) {
            handleDismiss();
            return;
        }

        await AlertRepository.resolveIdentityOnRemote(currentAlert, null, 'skipped');
        await AlertEngine.resolveIdentity(currentAlert.id, null, 'skipped');
        setCurrentAlert(null);
    };

    const handleDismiss = () => {
        // Just hide it, keep it un-resolved. Next time they open the app,
        // it won't auto-popup (auto-popup only happens on 'IDENTITY_PENDING' emit),
        // but they can still find it in AlertScreen.
        setCurrentAlert(null);
    };

    return (
        <GlobalAlertQueueContext.Provider value={{ pushAlert, openPendingQueue }}>
            {children}
            <CatPickerModal
                visible={currentAlert !== null}
                alert={currentAlert}
                cats={catsFromDb}
                onSelect={handleSelect}
                onSkip={handleSkip}
                onDismiss={handleDismiss}
                queueLength={queue.length}
            />
        </GlobalAlertQueueContext.Provider>
    );
}
