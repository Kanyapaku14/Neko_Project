import React, { useContext, useEffect, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    Easing,
    LayoutAnimation,
    Modal,
    PanResponder,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    Pressable,
    UIManager,
    View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import AlertEngine, { AlertEvents } from '../services/AlertEngine';
import AlertRepository from '../services/AlertRepository';
import { GlobalAlertQueueContext } from '../services/GlobalAlertQueue';
import supabase from './config/supabaseClient';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const formatTime = (isoString) => {
    if (!isoString) return 'Just now';
    try {
        const date = new Date(isoString);
        return `${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${date.toLocaleDateString()}`;
    } catch {
        return 'Just now';
    }
};

const getAlertVisuals = (alert) => {
    const type = String(alert?.type || '').toLowerCase();
    const severity = String(alert?.severity || 'info').toLowerCase();

    if (alert.pendingIdentityConfirm) {
        return { icon: 'help-rhombus-outline', color: '#E65100', bg: '#FFF8E1', text: 'Pending Identity' };
    }
    if (type === 'pending_identity' && alert.resolvedBy === 'skipped') {
        return { icon: 'cat-off', color: '#B42318', bg: '#FFE4E6', text: 'Identity Skipped' };
    }

    switch (type) {
        case 'litter_summary':
            return { icon: 'emoticon-poop-outline', color: '#0288D1', bg: '#E1F5FE', text: 'Litter Summary' };
        case 'camera_moved':
            return { icon: 'video-off-outline', color: '#E65100', bg: '#FFF3E0', text: 'Camera Moved' };
        case 'assessment_saved':
            return { icon: 'clipboard-check-outline', color: '#2E7D32', bg: '#E8F5E9', text: 'Assessment Saved' };
        case 'daily_log_inactivity':
            return { icon: 'calendar-alert', color: '#E65100', bg: '#FFF3E0', text: 'Missed Logging' };
        case 'friend_request':
            return { icon: 'account-plus-outline', color: '#7E57C2', bg: '#EDE7F6', text: 'Friend Request' };
        case 'friend_accepted':
            return { icon: 'account-check-outline', color: '#2E7D32', bg: '#E8F5E9', text: 'Friend Accepted' };
        case 'post_like':
            return { icon: 'heart-outline', color: '#E57373', bg: '#FFEBEE', text: 'Post Liked' };
    }

    // Fallback to severity
    switch (severity) {
        case 'critical':
            return { icon: 'alert-circle-outline', color: '#D32F2F', bg: '#FFEBEE', text: 'Critical Alert' };
        case 'warning':
            return { icon: 'alert-outline', color: '#F57C00', bg: '#FFF3E0', text: 'Warning' };
        default:
            return { icon: 'information-outline', color: '#0277BD', bg: '#E1F5FE', text: 'Information' };
    }
};

const dedupeAlerts = (items = []) => {
    const map = new Map();
    for (const item of (items || [])) {
        if (!item) continue;
        const rawId = item.id != null ? String(item.id).trim() : '';
        const hasStableId = rawId.length > 0;
        const key = hasStableId
            ? `id:${rawId}`
            : `fallback:${String(item.type || '')}:${String(item.timestamp || '')}:${String(item.title || '')}`;
        if (!map.has(key)) {
            map.set(key, item);
            continue;
        }
        const existing = map.get(key);
        // Prefer the newest entry if duplicates exist.
        const currentTs = new Date(item.timestamp || 0).getTime();
        const existingTs = new Date(existing?.timestamp || 0).getTime();
        if (currentTs >= existingTs) map.set(key, item);
    }
    return Array.from(map.values());
};

const isAllowedAlertType = (alert) => {
    const type = String(alert?.type || '').toLowerCase();
    return (
        type === 'dashboard_low_score_60'
        || type === 'dashboard_low_score_40'
        || type === 'friend_request'
        || type === 'friend_accepted'
        || type === 'post_like'
        || type === 'daily_log_inactivity'
    );
};

const collapseAlerts = (items = []) => {
    const latestLowScore = new Map();
    const rest = [];
    for (const alert of items) {
        const type = String(alert?.type || '').toLowerCase();
        if (type === 'dashboard_low_score_60' || type === 'dashboard_low_score_40') {
            const catKey = String(alert?.catId || 'unknown');
            const groupKey = `${type}:${catKey}`;
            const ts = new Date(alert?.timestamp || 0).getTime();
            const prev = latestLowScore.get(groupKey);
            const prevTs = prev ? new Date(prev?.timestamp || 0).getTime() : -1;
            if (!prev || ts >= prevTs) latestLowScore.set(groupKey, alert);
            continue;
        }
        rest.push(alert);
    }
    return [...latestLowScore.values(), ...rest];
};

const getShortDetail = (alert) => {
    const txt = String(alert?.desc || '').trim();
    return txt || 'Tap to view event details.';
};

const getCatLabel = (alert) => {
    const name = String(alert?.catName || '').trim();
    if (name) return name;
    return '';
};

const SwipeableNotificationCard = ({
    alert,
    onPress,
    onDelete,
    onMarkRead,
    isSelecting,
    isSelected,
    onToggleSelect,
    onRequestDeleteConfirm,
    activeSwipeId,
    setActiveSwipeId,
}) => {
    const pan = useRef(new Animated.ValueXY()).current;
    const deleteProgress = useRef(new Animated.Value(0)).current;
    const selectModeAnim = useRef(new Animated.Value(isSelecting ? 1 : 0)).current;
    const selectedAnim = useRef(new Animated.Value(isSelected ? 1 : 0)).current;
    const isDeletingRef = useRef(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const HARD_SWIPE_THRESHOLD_X = -(Dimensions.get('window').width * 0.5);
    const SWIPE_OPEN_X = -122;
    const SWIPE_TRIGGER_X = -34;
    const shortDetail = getShortDetail(alert);
    const deleteOpacity = pan.x.interpolate({
        inputRange: [SWIPE_OPEN_X, -36, 0],
        outputRange: [1, 0.45, 0],
        extrapolate: 'clamp',
    });
    const deleteScale = pan.x.interpolate({
        inputRange: [SWIPE_OPEN_X, 0],
        outputRange: [1, 0.8],
        extrapolate: 'clamp',
    });
    const deleteTranslateX = pan.x.interpolate({
        inputRange: [SWIPE_OPEN_X, -36, 0],
        outputRange: [0, 8, 14],
        extrapolate: 'clamp',
    });
    const cardOpacity = deleteProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0],
    });
    const cardScale = deleteProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0.96],
    });
    const cardTranslateY = deleteProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -8],
    });
    const animateToX = (toX, velocity = 0) =>
        Animated.spring(pan, {
            toValue: { x: toX, y: 0 },
            useNativeDriver: true,
            velocity,
            stiffness: 220,
            damping: 26,
            mass: 0.85,
            overshootClamping: true,
        }).start();
    const performDelete = () => {
        if (isDeletingRef.current) return;
        isDeletingRef.current = true; // Prevent double-taps
        if (setActiveSwipeId) setActiveSwipeId(null); // Close other cards
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); // Animate layout change
        onDelete(alert.id); // Trigger parent delete
    };
    const showDeleteConfirm = (onCancel) => {
        if (typeof onRequestDeleteConfirm === 'function') {
            onRequestDeleteConfirm({
                title: 'Delete Notification',
                message: 'Are you sure you want to delete this notification? This cannot be undone.',
                confirmText: 'Delete',
                onConfirm: performDelete,
                onCancel: () => {
                    if (onCancel) onCancel();
                },
            });
            return;
        }
        performDelete();
    };

    useEffect(() => {
        Animated.timing(selectModeAnim, {
            toValue: isSelecting ? 1 : 0,
            duration: 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [isSelecting, selectModeAnim]);

    useEffect(() => {
        Animated.spring(selectedAnim, {
            toValue: isSelected ? 1 : 0,
            useNativeDriver: true,
            stiffness: 320,
            damping: 20,
            mass: 0.65,
            overshootClamping: false,
        }).start();
    }, [isSelected, selectedAnim]);

    useEffect(() => {
        if (activeSwipeId !== alert.id) {
            animateToX(0, 0);
        }
    }, [activeSwipeId, alert.id]);

    const panResponder = useRef(
        PanResponder.create({
            onPanResponderTerminationRequest: () => false,
            onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
                if (isSelecting) return false;
                return Math.abs(gestureState.dx) > 22 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) + 4;
            },
            onPanResponderMove: (evt, gestureState) => {
                if (gestureState.dx < 0) {
                    const rawX = gestureState.dx;
                    pan.setValue({ x: rawX, y: 0 });
                }
            },
            onPanResponderRelease: (evt, gestureState) => {
                if (gestureState.dx < SWIPE_TRIGGER_X) {
                    animateToX(SWIPE_OPEN_X, gestureState.vx);
                    if (setActiveSwipeId) setActiveSwipeId(alert.id);
                } else {
                    animateToX(0, gestureState.vx);
                    if (setActiveSwipeId) setActiveSwipeId(null);
                }
            },
            onPanResponderTerminate: () => {
                animateToX(0, 0);
                if (setActiveSwipeId) setActiveSwipeId(null);
            },
        })
    ).current;

    const handleToggleExpand = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsExpanded((prev) => !prev);
        if (!alert.isRead && onMarkRead) {
            onMarkRead(alert.id);
        }
    };

    const visuals = getAlertVisuals(alert);
    const isPending = alert.pendingIdentityConfirm === true;
    const isIdentityResolved = alert.type === 'pending_identity' && !isPending && alert.resolvedBy && alert.resolvedBy !== 'skipped';
    const isRejectedIdentity = alert.type === 'pending_identity' && !isPending && alert.resolvedBy === 'skipped';
    const catLabel = getCatLabel(alert);


    return (
        <View style={styles.cardWrapper}>
            <View style={styles.deleteBackground}>
                <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => {
                        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) { }
                        showDeleteConfirm(() => {
                            if (setActiveSwipeId) setActiveSwipeId(null);
                            animateToX(0, 0);
                        });
                    }}
                >
                    <Animated.View
                        style={[
                            styles.deleteCapsule,
                            {
                                opacity: deleteOpacity,
                                transform: [{ scale: deleteScale }, { translateX: deleteTranslateX }],
                            },
                        ]}
                    >
                        <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
                    </Animated.View>
                </TouchableOpacity>
            </View>

            <Animated.View
                style={[
                    styles.alertCard,
                    !alert.isRead && styles.unreadCard, // This will now use borderLeft
                    {
                        opacity: cardOpacity,
                        transform: [{ translateX: pan.x }, { translateY: cardTranslateY }, { scale: cardScale }],
                    },
                ]}
                {...panResponder.panHandlers}
            >
                <TouchableOpacity
                    style={styles.cardMainContent}
                    activeOpacity={isSelecting ? 1 : 0.85}
                    onPress={() => {
                        if (isSelecting) {
                            onToggleSelect(alert.id);
                            return;
                        }
                        if (activeSwipeId && activeSwipeId !== alert.id) {
                            if (setActiveSwipeId) setActiveSwipeId(null);
                            return;
                        }
                        if (activeSwipeId === alert.id) {
                            animateToX(0, 0);
                            if (setActiveSwipeId) setActiveSwipeId(null);
                            return;
                        }
                        onPress(alert);
                    }}
                >
                    {isSelecting && (
                        <Animated.View
                            style={[
                                styles.selectIconWrap,
                                {
                                    opacity: selectModeAnim,
                                    transform: [
                                        {
                                            translateX: selectModeAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [-8, 0],
                                            }),
                                        },
                                        {
                                            scale: selectModeAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [0.85, 1],
                                            }),
                                        },
                                    ],
                                },
                            ]}
                        >
                            <Animated.View
                                style={[
                                    styles.selectIconCircle,
                                    isSelected ? styles.selectIconCircleSelected : styles.selectIconCircleIdle,
                                    {
                                        transform: [
                                            {
                                                scale: selectedAnim.interpolate({
                                                    inputRange: [0, 1],
                                                    outputRange: [1, 1.08],
                                                }),
                                            },
                                        ],
                                    },
                                ]}
                            >
                                <Animated.View
                                    style={[
                                        styles.selectIconFill,
                                        {
                                            opacity: selectedAnim,
                                            transform: [
                                                {
                                                    scale: selectedAnim.interpolate({
                                                        inputRange: [0, 1],
                                                        outputRange: [0.7, 1],
                                                    }),
                                                },
                                            ],
                                        },
                                    ]}
                                />
                                {isSelected ? (
                                    <Ionicons name="checkmark" size={22} color="#FFFFFF" />
                                ) : null}
                            </Animated.View>
                        </Animated.View>
                    )}

                    <View
                        style={[
                            styles.iconContainer, { backgroundColor: visuals.bg }
                        ]}
                    >
                        <MaterialCommunityIcons
                            name={visuals.icon}
                            size={26}
                            color={visuals.color}
                        />
                    </View>

                    <View style={styles.alertTextContainer}>
                        <View style={styles.titleRow}>
                            <Text style={[styles.alertTitle, !alert.isRead && styles.unreadText]}>{alert.title}</Text>
                            {!!catLabel && (
                                <View style={styles.catBadge}>
                                    <Text style={styles.catBadgeText}>{catLabel}</Text>
                                </View>
                            )}
                            {isPending ? (
                                <View style={styles.pendingBadge}><Text style={styles.pendingBadgeText}>Pending</Text></View>
                            ) : isRejectedIdentity ? (
                                <View style={styles.rejectedBadge}><Text style={styles.rejectedBadgeText}>Not Your Cat</Text></View>
                            ) : isIdentityResolved ? (
                                <View style={styles.resolvedBadge}><Text style={styles.resolvedBadgeText}>Identified</Text></View>
                            ) : !alert.isRead ? (
                                <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>
                            ) : null}
                        </View>
                        <Text style={styles.timeText}>{formatTime(alert.timestamp)}</Text>
                    </View>
                    {!isSelecting && (
                        <TouchableOpacity
                            style={styles.chevronButton}
                            onPress={(e) => {
                                if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                                handleToggleExpand();
                            }}
                        >
                            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color="#8E8E93" />
                        </TouchableOpacity>
                    )}
                </TouchableOpacity>

                {isExpanded && (
                    <View style={styles.expandedContent}>
                        <Text style={styles.expandedTitle}>Quick Summary</Text>
                        <Text style={styles.expandedText} numberOfLines={2}>{shortDetail}</Text>
                        <Text style={styles.expandedSubText}>Open Event Detail to view full latest information.</Text>
                    </View>
                )}
            </Animated.View>
        </View>
    );
};

export default function AlertScreen({ onBack, onNavigate }) {
    const [alerts, setAlerts] = useState([]);
    const [filterMode, setFilterMode] = useState('all');
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [activeSwipeId, setActiveSwipeId] = useState(null);
    const [confirmModal, setConfirmModal] = useState({
        visible: false,
        title: '',
        message: '',
        confirmText: 'Delete',
        onConfirm: null,
        onCancel: null,
    });
    const [renderMenu, setRenderMenu] = useState(false);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const menuAnim = useRef(new Animated.Value(0)).current;
    const menuButtonPressAnim = useRef(new Animated.Value(0)).current;
    const selectionBarAnim = useRef(new Animated.Value(0)).current;
    const { pushAlert } = useContext(GlobalAlertQueueContext);
    const loadAlertsFromDb = async (mode) => {
        try {
            const { data: userRes } = await supabase.auth.getUser();
            const userId = userRes?.user?.id;
            if (!userId) return;

            let q = supabase
                .from('alerts')
                .select('*')
                .eq('owner_id', userId);
            if (mode === 'deleted') q = q.eq('is_deleted', true);
            else q = q.eq('is_deleted', false);

            const { data, error } = await q.order('timestamp', { ascending: false }).limit(200);
            if (error) throw error;

            const mapped = (data || []).map((row) => ({
                id: row.id,
                type: row.type,
                severity: row.severity,
                title: row.title,
                desc: row.description || '',
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
                catId: row.cat_id || null,
                catName: row?.metadata?.catName || null,
                _fromRemote: true,
            }));

            const allowed = mapped.filter(isAllowedAlertType);
            const ordered = dedupeAlerts(collapseAlerts(allowed))
                .sort((a, b) => new Date(b?.timestamp || 0) - new Date(a?.timestamp || 0));
            setAlerts(ordered);
        } catch (err) {
            // fallback to local history
            const list = mode === 'deleted' && AlertEngine.getDeletedHistory
                ? AlertEngine.getDeletedHistory()
                : AlertEngine.getHistory();
            const allowed = (list || []).filter(isAllowedAlertType);
            const ordered = dedupeAlerts(collapseAlerts(allowed))
                .sort((a, b) => new Date(b?.timestamp || 0) - new Date(a?.timestamp || 0));
            setAlerts(ordered);
        }
    };

    useEffect(() => {
        AlertRepository.init();
        // syncFromRemote is already handled by GlobalAlertQueueProvider.
        // TODO: For out-of-app (push) notifications, this is where you would register the device token.
        // 1. Import * as Notifications from 'expo-notifications';
        // 2. Ask for permissions: Notifications.requestPermissionsAsync();
        // 3. Get token: Notifications.getPushTokenAsync();
        // 4. Send token to your backend and save it against the user ID in a 'push_tokens' table.
        // 5. Your backend (e.g., Supabase Edge Function) would listen to inserts on the 'alerts' table
        //    and send a push notification to the user's registered tokens.

        // For list refresh (including likes), sync alerts only and skip identity reviews to avoid popups.
        AlertRepository.syncFromRemote({ skipIdentityReview: true });
    }, []);

    useEffect(() => {
        loadAlertsFromDb(filterMode);

        const handler = () => {
            loadAlertsFromDb(filterMode);
        };
        AlertEngine.on(AlertEvents.UPDATED, handler);

        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        return () => AlertEngine.off(AlertEvents.UPDATED, handler);
    }, [filterMode, fadeAnim]);

    useEffect(() => {
        Animated.spring(selectionBarAnim, {
            toValue: isSelecting ? 1 : 0,
            useNativeDriver: true,
            stiffness: 240,
            damping: 24,
            mass: 0.8,
            overshootClamping: true,
        }).start();
    }, [isSelecting, selectionBarAnim]);

    const openMenu = () => {
        setActiveSwipeId(null);
        setRenderMenu(true);
        Animated.timing(menuAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    };

    const closeMenu = (callback) => {
        Animated.timing(menuAnim, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
            setRenderMenu(false);
            if (callback) callback();
        });
    };
    const animateMenuButtonPressIn = () => {
        Animated.timing(menuButtonPressAnim, {
            toValue: 1,
            duration: 90,
            useNativeDriver: true,
        }).start();
    };
    const animateMenuButtonPressOut = () => {
        Animated.spring(menuButtonPressAnim, {
            toValue: 0,
            useNativeDriver: true,
            stiffness: 260,
            damping: 22,
            mass: 0.75,
            overshootClamping: true,
        }).start();
    };

    const resetSelectionState = () => {
        setIsSelecting(false);
        setSelectedIds(new Set());
    };

    const handlePressCard = (alert) => {
        setActiveSwipeId(null);
        const shouldOpenIdentify = alert.pendingIdentityConfirm === true;
        if (shouldOpenIdentify) pushAlert(alert);
        else onNavigate('EventDetail', { alertData: alert });
        if (!alert.isRead && AlertEngine.markAsRead) {
            AlertEngine.markAsRead(alert.id);
            AlertRepository.markAsReadOnRemote(alert.id);
        }
    };

    const handleDelete = (id) => {
        setActiveSwipeId(null);
        if (AlertEngine.deleteAlert) AlertEngine.deleteAlert(id);
    };

    const handleReadAll = () => {
        if (AlertEngine.markAllAsRead) {
            AlertEngine.markAllAsRead();
            AlertRepository.markAllAsReadOnRemote();
        }
    };

    const openDeleteConfirmModal = ({ title, message, confirmText = 'Delete', onConfirm, onCancel }) => {
        setConfirmModal({
            visible: true,
            title,
            message,
            confirmText,
            onConfirm: typeof onConfirm === 'function' ? onConfirm : null,
            onCancel: typeof onCancel === 'function' ? onCancel : null,
        });
    };

    const closeDeleteConfirmModal = () => {
        setConfirmModal((prev) => ({ ...prev, visible: false }));
    };

    const handleConfirmModalCancel = () => {
        setActiveSwipeId(null);
        const cancelCallback = confirmModal.onCancel;
        closeDeleteConfirmModal();
        if (cancelCallback) cancelCallback();
    };

    const handleConfirmModalConfirm = () => {
        setActiveSwipeId(null);
        const confirmCallback = confirmModal.onConfirm;
        closeDeleteConfirmModal();
        if (confirmCallback) confirmCallback();
    };

    const requestDeleteAllConfirm = () => {
        openDeleteConfirmModal({
            title: 'Delete Notifications',
            message: 'Are you sure you want to delete all notifications? This cannot be undone.',
            confirmText: 'Delete All',
            onConfirm: () => {
                if (AlertEngine.deleteAllAlerts) AlertEngine.deleteAllAlerts();
            },
        });
    };

    const handleSelectionDelete = () => {
        setActiveSwipeId(null);
        const ids = Array.from(selectedIds);
        if (filterMode === 'deleted' && AlertEngine.permanentlyDeleteMultipleAlerts) {
            AlertEngine.permanentlyDeleteMultipleAlerts(ids);
        } else if (AlertEngine.deleteMultipleAlerts) {
            AlertEngine.deleteMultipleAlerts(ids);
        }
        resetSelectionState();
    };

    return (
        <View style={styles.container}>
            <StatusBar style="dark" translucent backgroundColor="transparent" />
            <LinearGradient colors={['#f5fffdff', '#f5fffdff']} style={{ flex: 1 }}>
                <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onBack} style={styles.backButton}>
                            <Ionicons name="chevron-back" size={28} color="#333" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Notifications</Text>
                        <TouchableOpacity
                            onPress={() => {
                                if (isSelecting) resetSelectionState();
                                else openMenu();
                            }}
                            onPressIn={animateMenuButtonPressIn}
                            onPressOut={animateMenuButtonPressOut}
                            style={[styles.backButton, { alignItems: 'flex-end' }]}
                        >
                            <Animated.View
                                style={{
                                    transform: [
                                        {
                                            scale: menuButtonPressAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [1, 0.88],
                                            }),
                                        },
                                        {
                                            rotate: menuButtonPressAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: ['0deg', '-7deg'],
                                            }),
                                        },
                                    ],
                                    opacity: menuButtonPressAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [1, 0.8],
                                    }),
                                }}
                            >
                                <Ionicons name={isSelecting ? 'close' : 'ellipsis-vertical'} size={24} color="#333" />
                            </Animated.View>
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        contentContainerStyle={styles.content}
                        showsVerticalScrollIndicator={false}
                        onTouchStart={() => setActiveSwipeId(null)}
                        onScrollBeginDrag={() => setActiveSwipeId(null)}
                    >
                        {(filterMode === 'unread' ? alerts.filter((a) => !a.isRead) : alerts).length === 0 ? (
                            <View style={styles.emptyState}>
                                <MaterialCommunityIcons name="bell-sleep-outline" size={64} color="#E0E0E0" />
                                <Text style={styles.emptyTitle}>All caught up!</Text>
                                <Text style={styles.emptyDesc}>You have no new notifications.</Text>
                            </View>
                        ) : (
                            (filterMode === 'unread' ? alerts.filter((a) => !a.isRead) : alerts).map((alert, index) => (
                                <Animated.View
                                    key={(alert?.id != null && String(alert.id).trim().length > 0)
                                        ? `alert_${String(alert.id).trim()}`
                                        : `alert_fallback_${index}_${String(alert?.timestamp || '')}`}
                                    style={{
                                        opacity: fadeAnim,
                                        transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
                                    }}
                                >
                                    <SwipeableNotificationCard
                                        alert={alert}
                                        onPress={handlePressCard}
                                        onDelete={handleDelete}
                                        onRequestDeleteConfirm={openDeleteConfirmModal}
                                        onMarkRead={(id) => {
                                            if (AlertEngine.markAsRead) AlertEngine.markAsRead(id);
                                            AlertRepository.markAsReadOnRemote(id);
                                        }}
                                        isSelecting={isSelecting}
                                        isSelected={selectedIds.has(alert.id)}
                                        activeSwipeId={activeSwipeId}
                                        setActiveSwipeId={setActiveSwipeId}
                                        onToggleSelect={(id) => {
                                            const next = new Set(selectedIds);
                                            if (next.has(id)) next.delete(id);
                                            else next.add(id);
                                            setSelectedIds(next);
                                        }}
                                    />
                                </Animated.View>
                            ))
                        )}
                    </ScrollView>

                    {isSelecting && (
                        <Animated.View
                            style={[
                                styles.selectionBar,
                                {
                                    opacity: selectionBarAnim,
                                    transform: [
                                        {
                                            translateY: selectionBarAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [20, 0],
                                            }),
                                        },
                                        {
                                            scale: selectionBarAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [0.97, 1],
                                            }),
                                        },
                                    ],
                                },
                            ]}
                        >
                            <TouchableOpacity style={styles.selectionBarBtn} onPress={resetSelectionState}>
                                <Text style={styles.selectionBarText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.selectionBarBtn, styles.iosDeleteBarBtn]} onPress={handleSelectionDelete}>
                                <Text style={[styles.selectionBarText, styles.iosDeleteBarBtnText]}>
                                    {filterMode === 'deleted' ? 'Permanently Delete' : `Delete (${selectedIds.size})`}
                                </Text>
                            </TouchableOpacity>
                        </Animated.View>
                    )}

                    {filterMode === 'deleted' && !isSelecting && (
                        <View style={styles.selectionBar}>
                            <TouchableOpacity style={[styles.selectionBarBtn, { flex: 1, marginRight: 8 }]} onPress={() => setFilterMode('all')}>
                                <Text style={styles.selectionBarText}>Back to Messages</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.selectionBarBtn, styles.iosDeleteBarBtn, { flex: 1, marginLeft: 8 }]} onPress={requestDeleteAllConfirm}>
                                <Text style={[styles.selectionBarText, styles.iosDeleteBarBtnText]}>Empty Trash</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <Modal visible={confirmModal.visible} transparent animationType="fade">
                        <View style={styles.modalOverlay}>
                            <View style={styles.modalContent}>
                                <View style={styles.modalIconCircle}>
                                    <Ionicons name="alert-circle-outline" size={40} color="#2A69C7" />
                                </View>
                                <Text style={styles.modalTitle}>{confirmModal.title}</Text>
                                <Text style={styles.modalText}>{confirmModal.message}</Text>
                                <View style={styles.modalActions}>
                                    <TouchableOpacity style={styles.modalCancel} onPress={handleConfirmModalCancel}>
                                        <Text style={styles.modalCancelText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.modalDelete} onPress={handleConfirmModalConfirm}>
                                        <Text style={styles.modalDeleteText}>{confirmModal.confirmText}</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Modal>

                    <Modal visible={renderMenu} transparent animationType="none" onRequestClose={() => closeMenu()}>
                        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPressOut={() => closeMenu()}>
                            <Animated.View
                                style={[
                                    styles.menuContainer,
                                    {
                                        opacity: menuAnim,
                                        transform: [
                                            { translateY: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) },
                                            { scale: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
                                        ],
                                    },
                                ]}
                            >
                                <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]} onPress={() => closeMenu(() => setIsSelecting(true))}>
                                    <Ionicons name="checkmark-circle-outline" size={22} color="#EAF2FF" />
                                    <Text style={styles.menuItemText}>Select messages</Text>
                                </Pressable>

                                {alerts.length > 0 && (
                                    <>
                                        <View style={styles.menuDivider} />
                                        <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]} onPress={() => closeMenu(handleReadAll)}>
                                            <Ionicons name="checkmark-done-outline" size={20} color="#E6EDF7" />
                                            <Text style={styles.menuItemText}>Read All</Text>
                                        </Pressable>
                                        <Pressable style={({ pressed }) => [styles.menuDeletePill, pressed && styles.menuDeletePillPressed]} onPress={() => closeMenu(requestDeleteAllConfirm)}>
                                            <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                                            <Text style={styles.menuDeletePillText}>Delete</Text>
                                        </Pressable>
                                    </>
                                )}

                                <View style={styles.menuDivider} />
                                {filterMode !== 'all' && (
                                    <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]} onPress={() => closeMenu(() => setFilterMode('all'))}>
                                        <Ionicons name="chatbubbles-outline" size={20} color="#E6EDF7" />
                                        <Text style={styles.menuItemText}>All messages</Text>
                                    </Pressable>
                                )}
                                <Pressable style={({ pressed }) => [styles.menuItem, filterMode === 'deleted' && styles.menuItemActive, pressed && styles.menuItemPressed]} onPress={() => closeMenu(() => setFilterMode('deleted'))}>
                                    <Ionicons name="trash-outline" size={20} color={filterMode === 'deleted' ? '#8FB8FF' : '#E6EDF7'} />
                                    <Text style={[styles.menuItemText, filterMode === 'deleted' && styles.menuItemTextActive]}>Recently Deleted</Text>
                                </Pressable>

                                <View style={styles.menuDivider} />
                                <View style={styles.menuSectionHeader}>
                                    <Text style={styles.menuSectionHeaderText}>Filter by</Text>
                                </View>
                                <Pressable style={({ pressed }) => [styles.menuItem, filterMode === 'unread' && styles.menuItemActive, pressed && styles.menuItemPressed]} onPress={() => closeMenu(() => setFilterMode('unread'))}>
                                    <Ionicons name="mail-unread-outline" size={20} color={filterMode === 'unread' ? '#8FB8FF' : '#E6EDF7'} />
                                    <Text style={[styles.menuItemText, filterMode === 'unread' && styles.menuItemTextActive]}>Unread</Text>
                                </Pressable>
                            </Animated.View>
                        </TouchableOpacity>
                    </Modal>
                </SafeAreaView>
            </LinearGradient>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5fffdff' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between', // Keep this
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 12, // More space
        backgroundColor: '#f5fffdff',
    },
    backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
    headerTitle: { fontSize: 16, fontFamily: 'Inter-Bold', color: '#2F6A62', textAlign: 'center', flex: 1 },
    content: { paddingHorizontal: 12, paddingTop: 2, paddingBottom: 24 },

    menuOverlay: { flex: 1, backgroundColor: 'rgba(28,28,30,0.12)' },
    menuContainer: { // Simplified menu
        position: 'absolute',
        top: Platform.OS === 'ios' ? 88 : 64,
        right: 14,
        width: 244,
        backgroundColor: 'rgba(66, 68, 74, 0.86)',
        borderRadius: 26,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: '#E5E5EA',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 7,
    },
    menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, marginHorizontal: 8 },
    menuItemPressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
    menuItemActive: { backgroundColor: 'rgba(255,255,255,0.14)' },
    menuItemText: { fontSize: 15, color: '#ECEDEF', marginLeft: 11, fontFamily: 'Inter-Medium' },
    menuItemTextActive: { color: '#FFFFFF', fontFamily: 'Inter-Bold' },
    menuDeletePill: { // Simplified delete button in menu
        marginHorizontal: 10,
        marginTop: 10,
        marginBottom: 4,
        borderRadius: 999,
        backgroundColor: '#FF4458',
        minHeight: 46,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 10,
    },
    menuDeletePillPressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
    menuDeletePillText: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Inter-Bold' },
    menuDivider: { height: 1, backgroundColor: '#E5E5EA', marginVertical: 6, marginHorizontal: 14 },
    menuSectionHeader: { paddingHorizontal: 16, paddingVertical: 8, paddingBottom: 4 },
    menuSectionHeaderText: { fontSize: 12, color: '#8E8E93', fontFamily: 'Inter-Bold', textTransform: 'uppercase' },

    selectionBar: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 14,
        borderTopWidth: 1,
        borderTopColor: '#E8E8ED',
        justifyContent: 'space-between',
        gap: 10,
        shadowColor: '#1C1C1E',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 7,
    },
    selectionBarBtn: {
        flex: 1,
        minHeight: 46,
        paddingVertical: 11,
        paddingHorizontal: 18,
        borderRadius: 999,
        backgroundColor: '#F4F5F8',
        borderWidth: 1,
        borderColor: '#E1E3E8',
        justifyContent: 'center',
        alignItems: 'center',
    },
    selectionBarText: { color: '#3A3A3C', fontFamily: 'Inter-Bold', textAlign: 'center', fontSize: 14 },
    iosDeleteBarBtn: { backgroundColor: '#E8F0FF', borderWidth: 1, borderColor: '#C8D8FF' },
    iosDeleteBarBtnText: { color: '#1A56C5' },

    cardWrapper: {
        marginBottom: 8, // Tighter list
        borderRadius: 14,
        position: 'relative',
        overflow: 'hidden',
    },
    deleteBackground: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'flex-end', // Align to the right
    },
    deleteButton: {
        width: 60,
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#FF3B30',
    },
    deleteCapsule: { // This view is now just for the icon animation
        justifyContent: 'center',
        alignItems: 'center',
    },

    alertCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E5E5EA',
        // Minimalist: remove shadow
        // shadowColor: '#0F172A',
        // shadowOffset: { width: 0, height: 2 },
        // shadowOpacity: 0.05,
        // shadowRadius: 8,
        // elevation: 2,
    },
    unreadCard: {
        borderLeftWidth: 3,
        borderLeftColor: '#0A84FF',
        borderTopColor: '#E5E5EA',
        borderRightColor: '#E5E5EA',
        borderBottomColor: '#E5E5EA',
    },
    cardMainContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10 },
    selectIconWrap: { marginRight: 12 },
    selectIconCircle: {
        width: 34,
        height: 34,
        borderRadius: 17,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
    },
    selectIconCircleIdle: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1.5,
        borderColor: '#C9CDD5',
    },
    selectIconCircleSelected: {
        backgroundColor: '#0A84FF',
        borderWidth: 1.5,
        borderColor: '#0A84FF',
        shadowColor: '#0A84FF',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
        elevation: 4,
    },
    selectIconFill: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#0A84FF',
    },
    iconContainer: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
    alertTextContainer: { flex: 1 },
    titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' },
    alertTitle: { fontSize: 13, fontFamily: 'Inter-Bold', color: '#1C1C1E' },
    unreadText: { color: '#000000', fontFamily: 'Inter-Bold' },
    newBadge: { backgroundColor: '#4CAF50', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 },
    newBadgeText: { color: '#FFF', fontSize: 10, fontFamily: 'Inter-Bold' },
    pendingBadge: { backgroundColor: '#FF9800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 },
    pendingBadgeText: { color: '#FFF', fontSize: 10, fontFamily: 'Inter-Bold' },
    resolvedBadge: { backgroundColor: '#D9E8FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 },
    resolvedBadgeText: { color: '#1A56C5', fontSize: 10, fontFamily: 'Inter-Bold' },
    rejectedBadge: { backgroundColor: '#FFE4E6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 },
    rejectedBadgeText: { color: '#B42318', fontSize: 10, fontFamily: 'Inter-Bold' },
    catBadge: { backgroundColor: '#E8F0FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 },
    catBadgeText: { color: '#1A56C5', fontSize: 10, fontFamily: 'Inter-Bold' },
    timeText: { fontSize: 10, color: '#8E8E93', fontFamily: 'Inter-Medium', marginTop: 2 },
    chevronButton: { paddingLeft: 8, paddingVertical: 8 },
    expandedContent: {
        borderTopWidth: 1,
        borderTopColor: '#EFEFF4',
        marginLeft: 48,
        paddingHorizontal: 12,
        paddingTop: 9,
        paddingBottom: 12,
    },
    expandedTitle: {
        fontSize: 12,
        color: '#8E8E93',
        fontFamily: 'Inter-Bold',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    expandedText: {
        fontSize: 14,
        color: '#3A3A3C',
        fontFamily: 'Inter-Regular',
        lineHeight: 20,
    },
    expandedSubText: {
        marginTop: 6,
        fontSize: 13,
        color: '#6D6D72',
        fontFamily: 'Inter-Regular',
        lineHeight: 18,
    }, // Minimalist empty state
    emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 100 },
    emptyTitle: { fontSize: 20, fontFamily: 'Inter-Bold', color: '#B0BEC5', marginTop: 16 },
    emptyDesc: { fontSize: 14, color: '#78909C', marginTop: 8, fontFamily: 'Inter-Medium' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalContent: {
        width: '80%',
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 10,
    },
    modalIconCircle: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#E8F0FF', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 18, fontFamily: 'Inter-Bold', color: '#1A3B34', marginBottom: 8, textAlign: 'center' },
    modalText: { fontSize: 14, fontFamily: 'Inter-Regular', color: '#5C706B', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
    modalActions: { flexDirection: 'row', gap: 12, width: '100%' },
    modalCancel: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F0F4F4', alignItems: 'center' },
    modalCancelText: { color: '#5C706B', fontSize: 15, fontFamily: 'Inter-SemiBold' },
    modalDelete: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#3c8fddff', alignItems: 'center' },
    modalDeleteText: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Inter-SemiBold' },
});
