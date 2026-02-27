import React, { useContext, useEffect, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    Easing,
    LayoutAnimation,
    Modal,
    PanResponder,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    Pressable,
    UIManager,
    View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AlertEngine, { AlertEvents } from '../services/AlertEngine';
import { GlobalAlertQueueContext } from '../services/GlobalAlertQueue';

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

const SwipeableNotificationCard = ({
    alert,
    onPress,
    onDelete,
    onRequestDeleteConfirm = (onConfirm, onCancel) => {
        if (onConfirm) onConfirm();
        else if (onCancel) onCancel();
    },
    onMarkRead,
    isSelecting,
    isSelected,
    onToggleSelect,
}) => {
    const SWIPE_ENABLED = Platform.OS !== 'web';
    const pan = useRef(new Animated.ValueXY()).current;
    const deleteProgress = useRef(new Animated.Value(0)).current;
    const isDeletingRef = useRef(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const HARD_SWIPE_THRESHOLD_X = -(Dimensions.get('window').width * 0.5);
    const SWIPE_OPEN_X = -176;
    const HARD_SWIPE_X = -198;
    const SWIPE_TRIGGER_X = -42;
    const SWIPE_OVERSHOOT_RESISTANCE = 0.22;
    const isPending = alert.pendingIdentityConfirm === true;
    const isCritical = alert.severity === 'critical';
    const deleteOpacity = pan.x.interpolate({
        inputRange: [SWIPE_OPEN_X, -36, 0],
        outputRange: [1, 0.45, 0],
        extrapolate: 'clamp',
    });
    const deleteScale = pan.x.interpolate({
        inputRange: [HARD_SWIPE_X, SWIPE_OPEN_X, -36, 0],
        outputRange: [1.12, 1, 0.94, 0.9],
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
    const runDeleteAnimationAndDelete = () => {
        if (isDeletingRef.current) return;
        isDeletingRef.current = true;
        Animated.timing(deleteProgress, {
            toValue: 1,
            duration: 190,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start(() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            onDelete(alert.id);
        });
    };
    const requestDeleteConfirm = (onConfirm, onCancel) => {
        try {
            if (typeof onRequestDeleteConfirm === 'function') {
                onRequestDeleteConfirm?.(onConfirm, onCancel, { mode: 'single' });
                return;
            }
        } catch (e) {
            // Fallback to local flow if parent callback is stale or undefined at runtime
        }
        if (onConfirm) onConfirm();
        else if (onCancel) onCancel();
    };

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
                if (!SWIPE_ENABLED) return false;
                if (isSelecting) return false;
                const dx = gestureState && typeof gestureState.dx === 'number' ? gestureState.dx : 0;
                const dy = gestureState && typeof gestureState.dy === 'number' ? gestureState.dy : 0;
                return Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy);
            },
            onPanResponderMove: (evt, gestureState) => {
                if (!SWIPE_ENABLED) return;
                try {
                    if (!pan || !pan.x || typeof pan.x.setValue !== 'function') return;
                    const dx = Number(gestureState && gestureState.dx);
                    if (!Number.isFinite(dx) || dx >= 0) return;

                    let nextX = dx;
                    if (nextX < SWIPE_OPEN_X) {
                        nextX = SWIPE_OPEN_X + (nextX - SWIPE_OPEN_X) * SWIPE_OVERSHOOT_RESISTANCE;
                    }
                    // Absolute safety clamp for transient invalid gesture bursts.
                    nextX = Math.max(nextX, HARD_SWIPE_X - 28);

                    if (!Number.isFinite(nextX)) return;
                    pan.x.setValue(nextX);
                    if (pan.y && typeof pan.y.setValue === 'function') {
                        pan.y.setValue(0);
                    }
                } catch (e) {
                    // Ignore invalid transient gesture values to avoid crashing the UI thread bridge.
                }
            },
            onPanResponderRelease: (evt, gestureState) => {
                if (!SWIPE_ENABLED) return;
                const dx = gestureState && typeof gestureState.dx === 'number' ? gestureState.dx : 0;
                const vx = gestureState && typeof gestureState.vx === 'number' ? gestureState.vx : 0;
                const isHardSwipe = dx < HARD_SWIPE_THRESHOLD_X;
                if (isHardSwipe) {
                    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) {}
                    animateToX(HARD_SWIPE_X, vx);
                    requestDeleteConfirm(runDeleteAnimationAndDelete, () => animateToX(0, vx));
                } else if (dx < SWIPE_TRIGGER_X) {
                    animateToX(SWIPE_OPEN_X, vx);
                } else {
                    animateToX(0, vx);
                }
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

    return (
        <View style={styles.cardWrapper}>
            <View style={styles.deleteBackground}>
                <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => {
                        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
                        requestDeleteConfirm(runDeleteAnimationAndDelete, () => animateToX(0, 0));
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
                        <Text style={styles.deleteCapsuleText}>Delete</Text>
                    </Animated.View>
                </TouchableOpacity>
            </View>

            <Animated.View
                style={[
                    styles.alertCard,
                    !alert.isRead && styles.unreadCard,
                    {
                        opacity: cardOpacity,
                        transform: [{ translateX: pan.x }, { translateY: cardTranslateY }, { scale: cardScale }],
                    },
                ]}
                {...(SWIPE_ENABLED ? panResponder.panHandlers : {})}
            >
                <TouchableOpacity
                    style={styles.cardMainContent}
                    activeOpacity={isSelecting ? 1 : 0.85}
                    onPress={() => {
                        if (isSelecting) onToggleSelect(alert.id);
                        else onPress(alert);
                    }}
                >
                    {isSelecting && (
                        <View style={styles.selectIconWrap}>
                            <View style={[styles.selectIconCircle, isSelected && styles.selectIconCircleSelected]}>
                                <Ionicons
                                    name={isSelected ? 'checkmark' : 'ellipse-outline'}
                                    size={isSelected ? 18 : 22}
                                    color={isSelected ? '#FFFFFF' : '#C7C7CC'}
                                />
                            </View>
                        </View>
                    )}

                    <View style={[styles.iconContainer, isPending ? styles.pendingIconContainer : isCritical ? styles.iconCriticalBg : styles.iconSuccessBg]}>
                        <MaterialCommunityIcons
                            name={isPending ? 'help-rhombus-outline' : isCritical ? 'alert-circle-outline' : 'check-circle-outline'}
                            size={26}
                            color={isPending ? '#E65100' : isCritical ? '#D32F2F' : '#2E7D32'}
                        />
                    </View>

                    <View style={styles.alertTextContainer}>
                        <View style={styles.titleRow}>
                            <Text style={[styles.alertTitle, !alert.isRead && styles.unreadText]}>{alert.title}</Text>
                            {isPending ? (
                                <View style={styles.pendingBadge}><Text style={styles.pendingBadgeText}>Pending</Text></View>
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
                        <Text style={styles.expandedTitle}>Details</Text>
                        <Text style={styles.expandedText}>{alert.desc || 'No summary.'}</Text>
                        {!!alert.details && <Text style={styles.expandedSubText}>{alert.details}</Text>}
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
    const [isDeleteModalVisible, setDeleteModalVisible] = useState(false);
    const [renderMenu, setRenderMenu] = useState(false);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const menuAnim = useRef(new Animated.Value(0)).current;
    const menuButtonPressAnim = useRef(new Animated.Value(0)).current;
    const deleteConfirmActionRef = useRef(null);
    const deleteConfirmCancelRef = useRef(null);
    const [deleteConfirmUi, setDeleteConfirmUi] = useState({
        title: 'Delete Notifications',
        message: 'Are you sure you want to delete all notifications? This cannot be undone.',
        confirmText: 'Delete All',
    });
    const { pushAlert } = useContext(GlobalAlertQueueContext);

    useEffect(() => {
        const list = filterMode === 'deleted' && AlertEngine.getDeletedHistory
            ? AlertEngine.getDeletedHistory()
            : AlertEngine.getHistory();
        setAlerts(list || []);
        if (filterMode !== 'deleted' && AlertEngine.markAllAsRead) {
            AlertEngine.markAllAsRead();
        }

        const handler = () => {
            const next = filterMode === 'deleted' && AlertEngine.getDeletedHistory
                ? AlertEngine.getDeletedHistory()
                : AlertEngine.getHistory();
            setAlerts([...(next || [])]);
        };
        AlertEngine.on(AlertEvents.UPDATED, handler);

        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        return () => AlertEngine.off(AlertEvents.UPDATED, handler);
    }, [filterMode, fadeAnim]);

    const openMenu = () => {
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
        if (alert.pendingIdentityConfirm) pushAlert(alert);
        else onNavigate('EventDetail', { alertData: alert });
        if (!alert.isRead && AlertEngine.markAsRead) AlertEngine.markAsRead(alert.id);
    };

    const handleDelete = (id) => {
        if (AlertEngine.deleteAlert) AlertEngine.deleteAlert(id);
    };

    const handleReadAll = () => {
        if (AlertEngine.markAllAsRead) AlertEngine.markAllAsRead();
    };

    const openDeleteConfirm = (onConfirm, onCancel, options = {}) => {
        deleteConfirmActionRef.current = onConfirm || null;
        deleteConfirmCancelRef.current = onCancel || null;
        if (options.mode === 'single') {
            setDeleteConfirmUi({
                title: 'Delete Notification',
                message: 'Are you sure you want to delete this notification?',
                confirmText: 'Delete',
            });
        } else {
            setDeleteConfirmUi({
                title: 'Delete Notifications',
                message: 'Are you sure you want to delete all notifications? This cannot be undone.',
                confirmText: 'Delete All',
            });
        }
        setDeleteModalVisible(true);
    };

    const handleCancelDeleteConfirm = () => {
        const cancelAction = deleteConfirmCancelRef.current;
        setDeleteModalVisible(false);
        deleteConfirmActionRef.current = null;
        deleteConfirmCancelRef.current = null;
        if (cancelAction) cancelAction();
    };

    const handleConfirmDeleteConfirm = () => {
        const confirmAction = deleteConfirmActionRef.current;
        setDeleteModalVisible(false);
        deleteConfirmActionRef.current = null;
        deleteConfirmCancelRef.current = null;
        if (confirmAction) confirmAction();
    };

    const confirmDeleteAll = () => {
        if (AlertEngine.deleteAllAlerts) AlertEngine.deleteAllAlerts();
        setDeleteModalVisible(false);
    };

    const handleSelectionDelete = () => {
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
            <SafeAreaView style={styles.container}>
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

                <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                    {(filterMode === 'unread' ? alerts.filter((a) => !a.isRead) : alerts).length === 0 ? (
                        <View style={styles.emptyState}>
                            <MaterialCommunityIcons name="bell-sleep-outline" size={64} color="#E0E0E0" />
                            <Text style={styles.emptyTitle}>All caught up!</Text>
                            <Text style={styles.emptyDesc}>You have no new notifications.</Text>
                        </View>
                    ) : (
                        (filterMode === 'unread' ? alerts.filter((a) => !a.isRead) : alerts).map((alert) => (
                            <Animated.View
                                key={alert.id}
                                style={{
                                    opacity: fadeAnim,
                                    transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
                                }}
                            >
                                <SwipeableNotificationCard
                                    alert={alert}
                                    onPress={handlePressCard}
                                    onDelete={handleDelete}
                                    onRequestDeleteConfirm={openDeleteConfirm}
                                    onMarkRead={(id) => AlertEngine.markAsRead && AlertEngine.markAsRead(id)}
                                    isSelecting={isSelecting}
                                    isSelected={selectedIds.has(alert.id)}
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
                    <View style={styles.selectionBar}>
                        <TouchableOpacity style={styles.selectionBarBtn} onPress={resetSelectionState}>
                            <Text style={styles.selectionBarText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.selectionBarBtn, styles.iosDeleteBarBtn]} onPress={handleSelectionDelete}>
                            <Text style={[styles.selectionBarText, styles.iosDeleteBarBtnText]}>
                                {filterMode === 'deleted' ? 'Permanently Delete' : `Delete (${selectedIds.size})`}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}

                {filterMode === 'deleted' && !isSelecting && (
                    <View style={styles.selectionBar}>
                        <TouchableOpacity style={[styles.selectionBarBtn, { flex: 1, marginRight: 8 }]} onPress={() => setFilterMode('all')}>
                            <Text style={styles.selectionBarText}>Back to Messages</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.selectionBarBtn, styles.iosDeleteBarBtn, { flex: 1, marginLeft: 8 }]}
                            onPress={() => openDeleteConfirm(confirmDeleteAll)}
                        >
                            <Text style={[styles.selectionBarText, styles.iosDeleteBarBtnText]}>Empty Trash</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <Modal visible={isDeleteModalVisible} transparent animationType="fade">
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.modalIconCircle}>
                                <Ionicons name="alert-circle-outline" size={40} color="#2A69C7" />
                            </View>
                            <Text style={styles.modalTitle}>{deleteConfirmUi.title}</Text>
                            <Text style={styles.modalText}>{deleteConfirmUi.message}</Text>
                            <View style={styles.modalActions}>
                                <TouchableOpacity style={styles.modalCancel} onPress={handleCancelDeleteConfirm}>
                                    <Text style={styles.modalCancelText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.modalDelete} onPress={handleConfirmDeleteConfirm}>
                                    <Text style={styles.modalDeleteText}>{deleteConfirmUi.confirmText}</Text>
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
                                <Ionicons name="checkmark-circle-outline" size={20} color="#E6EDF7" />
                                <Text style={styles.menuItemText}>Select messages</Text>
                            </Pressable>

                            {alerts.length > 0 && (
                                <>
                                    <View style={styles.menuDivider} />
                                    <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]} onPress={() => closeMenu(handleReadAll)}>
                                        <Ionicons name="checkmark-done-outline" size={20} color="#E6EDF7" />
                                        <Text style={styles.menuItemText}>Read All</Text>
                                    </Pressable>
                                    <Pressable
                                        style={({ pressed }) => [styles.menuDeletePill, pressed && styles.menuDeletePillPressed]}
                                        onPress={() => closeMenu(() => openDeleteConfirm(confirmDeleteAll))}
                                    >
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
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F5FBFB' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 10,
        backgroundColor: '#F5FBFB',
    },
    backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
    headerTitle: { fontSize: 22, fontFamily: 'Inter-Bold', color: '#1C1C1E', textAlign: 'center', flex: 1 },
    content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },

    menuOverlay: { flex: 1, backgroundColor: 'rgba(28,28,30,0.12)' },
    menuContainer: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 88 : 64,
        right: 14,
        width: 244,
        backgroundColor: 'rgba(66, 68, 74, 0.86)',
        borderRadius: 26,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
        shadowColor: '#202124',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 18,
        elevation: 7,
    },
    menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, marginHorizontal: 8 },
    menuItemPressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
    menuItemActive: { backgroundColor: 'rgba(255,255,255,0.14)' },
    menuItemText: { fontSize: 17, color: '#ECEDEF', marginLeft: 11, fontFamily: 'Inter-Medium' },
    menuItemTextActive: { color: '#FFFFFF', fontFamily: 'Inter-Bold' },
    menuDeletePill: {
        marginHorizontal: 10,
        marginTop: 10,
        marginBottom: 2,
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
    menuDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.16)', marginVertical: 6, marginHorizontal: 14 },
    menuSectionHeader: { paddingHorizontal: 16, paddingVertical: 8, paddingBottom: 4 },
    menuSectionHeaderText: { fontSize: 12, color: '#D0D2D8', fontFamily: 'Inter-Bold', textTransform: 'uppercase' },

    selectionBar: {
        flexDirection: 'row',
        backgroundColor: '#F9F9FB',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 14,
        borderTopWidth: 1,
        borderTopColor: '#D8D8DC',
        justifyContent: 'space-around',
        gap: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 4,
    },
    selectionBarBtn: {
        flex: 1,
        minHeight: 44,
        paddingVertical: 11,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#D1D1D6',
    },
    selectionBarText: { color: '#1C1C1E', fontFamily: 'Inter-Bold', textAlign: 'center', fontSize: 14 },
    iosDeleteBarBtn: { backgroundColor: '#FFF1F0', borderWidth: 1, borderColor: '#FFD3D0' },
    iosDeleteBarBtnText: { color: '#FF3B30' },

    cardWrapper: {
        marginBottom: 12,
        borderRadius: 16,
        backgroundColor: '#F5FBFB',
        position: 'relative',
        overflow: 'hidden',
    },
    deleteBackground: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'flex-end',
        paddingRight: 12,
        backgroundColor: 'transparent',
        borderRadius: 16,
    },
    deleteButton: { height: '100%', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 0 },
    deleteCapsule: {
        width: 160,
        height: 44,
        borderRadius: 999,
        backgroundColor: '#FF3B30',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.16)',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#B00020',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.18,
        shadowRadius: 6,
        elevation: 2,
    },
    deleteCapsuleText: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Inter-Bold' },

    alertCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E5E5EA',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 3,
    },
    unreadCard: {
        backgroundColor: '#FFFFFF',
        borderColor: '#D1D1D6',
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
        shadowOffset: { width: 0, height: 2 },
    },
    cardMainContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14 },
    selectIconWrap: { marginRight: 12 },
    selectIconCircle: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#D1D1D6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    selectIconCircleSelected: {
        backgroundColor: '#0A84FF',
        borderColor: '#0A84FF',
        shadowColor: '#0A84FF',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.22,
        shadowRadius: 6,
        elevation: 3,
    },
    iconContainer: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    iconCriticalBg: { backgroundColor: '#FFF0F0' },
    iconSuccessBg: { backgroundColor: '#E8F5E9' },
    pendingIconContainer: { backgroundColor: '#FFF8E1' },
    alertTextContainer: { flex: 1 },
    titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' },
    alertTitle: { fontSize: 15, fontFamily: 'Inter-Bold', color: '#1C1C1E' },
    unreadText: { color: '#000000', fontFamily: 'Inter-Bold' },
    newBadge: { backgroundColor: '#4CAF50', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 },
    newBadgeText: { color: '#FFF', fontSize: 10, fontFamily: 'Inter-Bold' },
    pendingBadge: { backgroundColor: '#FF9800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 },
    pendingBadgeText: { color: '#FFF', fontSize: 10, fontFamily: 'Inter-Bold' },
    alertDesc: { fontSize: 14, color: '#5C706B', lineHeight: 20, fontFamily: 'Inter-Regular' },
    timeText: { fontSize: 12, color: '#8E8E93', fontFamily: 'Inter-Medium', marginTop: 2 },
    chevronButton: { paddingLeft: 8, paddingVertical: 8 },
    expandedContent: {
        borderTopWidth: 1,
        borderTopColor: '#EFEFF4',
        marginLeft: 56,
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 14,
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
    },
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
    modalDelete: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#2A69C7', alignItems: 'center' },
    modalDeleteText: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Inter-SemiBold' },
});
