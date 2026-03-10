/**
 * CatPickerModal.js
 *
 * Modal for selecting which cat was detected in a pending identity event.
 */

import React, { useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Image,
    Dimensions,
    ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { CAMERA_API_BASE } from '../../config/cameraApi';
import supabase from '../../screens/config/supabaseClient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

const VIDEO_SERVER_BASE = CAMERA_API_BASE;

const BEHAVIOR_ICON_MAP = {
    vomiting: { icon: 'emoticon-sick-outline', color: '#D32F2F' },
    head_pressing: { icon: 'head-alert-outline', color: '#B71C1C' },
    hunch_posture: { icon: 'cat', color: '#E65100' },
    limping: { icon: 'walk', color: '#F57F17' },
    grooming: { icon: 'shower-head', color: '#1565C0' },
    resting: { icon: 'sleep', color: '#388E3C' },
    eating: { icon: 'food', color: '#00695C' },
};

function getBehaviorIcon(label) {
    const normalized = (label || '').toLowerCase().replace(/\s+/g, '_');
    return BEHAVIOR_ICON_MAP[normalized] || { icon: 'paw', color: '#546E7A' };
}

export default function CatPickerModal({ visible, alert, cats = [], onSelect, onSkip, onDismiss, onReject, queueLength = 0 }) {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [selectedCatId, setSelectedCatId] = useState(null);
    const [selectedCatName, setSelectedCatName] = useState('');
    const [submittingAction, setSubmittingAction] = useState(null); // 'confirm' | 'reject' | 'skip' | null
    const mountedRef = useRef(true);
    const modalScale = useRef(new Animated.Value(0.96)).current;
    const modalOpacity = useRef(new Animated.Value(0)).current;
    const confirmPressAnim = useRef(new Animated.Value(0)).current;
    const rejectPressAnim = useRef(new Animated.Value(0)).current;
    const skipPressAnim = useRef(new Animated.Value(0)).current;
    const closePressAnim = useRef(new Animated.Value(0)).current;
    const [selectedSnapshotIdx, setSelectedSnapshotIdx] = React.useState(null);
    const isSubmitting = submittingAction !== null;
    const fallbackSnapshotUri = React.useMemo(
        () => `${VIDEO_SERVER_BASE}/api/latest_frame.jpg?t=${encodeURIComponent(alert?.timestamp || alert?.id || 'latest')}`,
        [alert?.timestamp, alert?.id]
    );

    React.useEffect(() => {
        return () => {
            mountedRef.current = false;
        };
    }, []);

    React.useEffect(() => {
        if (!visible || !alert) return;
        // First-time pending alert: no prefill.
        // Edit flow (already resolved): prefill previous selection/status.
        const isPending = alert.pendingIdentityConfirm === true;
        const isResolvedSelection = !isPending && alert.resolvedBy && alert.resolvedBy !== 'skipped';
        if (isResolvedSelection) {
            const found = cats.find((c) => c.id === alert.resolvedCatId);
            setSelectedCatId(found?.id || alert.resolvedCatId || null);
            setSelectedCatName(found?.name || alert.resolvedCatName || '');
        } else {
            // pending or skipped -> start empty so user chooses explicitly
            setSelectedCatId(null);
            setSelectedCatName('');
        }
        setDropdownOpen(false);
    }, [visible, cats, alert?.id, alert?.resolvedBy, alert?.resolvedCatId, alert?.resolvedCatName, alert?.pendingIdentityConfirm]);

    React.useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(modalScale, {
                    toValue: 1,
                    useNativeDriver: true,
                    stiffness: 260,
                    damping: 24,
                    mass: 0.8,
                    overshootClamping: true,
                }),
                Animated.timing(modalOpacity, {
                    toValue: 1,
                    duration: 180,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            modalScale.setValue(0.96);
            modalOpacity.setValue(0);
        }
    }, [visible, modalOpacity, modalScale]);

    React.useEffect(() => {
        if (visible) setSelectedSnapshotIdx(null);
    }, [visible]);

    if (!alert) return null;

    const { behaviorLabel, confidence, cropSnapshot, multiSnapshots } = alert;
    const isMultiMode = Array.isArray(multiSnapshots) && multiSnapshots.length >= 2;
    const confidencePct = confidence != null ? Math.round(confidence * 100) : null;
    const { icon: behaviorIcon, color: behaviorColor } = getBehaviorIcon(behaviorLabel);
    const previewSnapshotUri = cropSnapshot || fallbackSnapshotUri;

    const handlePickCat = (catId) => {
        if (isSubmitting) return;
        if (selectedCatId === catId) {
            setSelectedCatId(null);
            setSelectedCatName('');
            setDropdownOpen(false);
            return;
        }
        const cat = cats.find((c) => c.id === catId);
        setSelectedCatId(catId);
        setSelectedCatName(cat?.name || '');
        setDropdownOpen(false);
    };

    // à¸ªà¸³à¸«à¸£à¸±à¸šà¹‚à¸«à¸¡à¸” multi-snapshot: à¸ªà¸¥à¸±à¸šà¸£à¸¹à¸›à¸—à¸µà¹ˆà¹€à¸¥à¸·à¸­à¸à¹Œ (0 à¸«à¸£à¸·à¸­ 1)
    const handleConfirmMulti = async () => {
        if (selectedSnapshotIdx === null || !Array.isArray(multiSnapshots)) return;
        const chosen = multiSnapshots[selectedSnapshotIdx];
        // resolve à¸à¸¥à¸±à¸šà¹€à¸›à¹‡à¸™ "cat à¸—à¸µà¹ˆà¹€à¸›à¹‡à¸™à¸‚à¸­à¸‡à¹€à¸£à¸²" à¸„à¸·à¸­ cat à¹ƒà¸™ selectedIds à¹à¸¥à¸° unknown à¸„à¸·à¸­à¸•à¸±à¸§à¸—à¸µà¹ˆà¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆ
        // à¸™à¸³ cat à¸‚à¸­à¸‡ user à¹„à¸›à¹ƒà¸«à¹‰ onSelect (cat à¸—à¸µà¹ˆà¸„à¸§à¸£à¸ˆà¸°à¹€à¸›à¹‡à¸™ "à¸•à¸±à¸§à¸—à¸µà¹ˆ user à¹€à¸¥à¸·à¸­à¸")
        const myCatId = selectedCatId || cats[0]?.id || null;
        if (!myCatId) return;
        await runAction('confirm', async () => {
            if (onSelect) await onSelect(myCatId, chosen?.unknownCatId);
        });
    };

    const runAction = async (actionType, runner) => {
        if (isSubmitting) return;
        setSubmittingAction(actionType);
        try {
            await runner();
        } finally {
            if (mountedRef.current) {
                setSubmittingAction(null);
            }
        }
    };

    const animatePressIn = (animValue) => {
        Animated.timing(animValue, {
            toValue: 1,
            duration: 90,
            useNativeDriver: true,
        }).start();
    };
    const animatePressOut = (animValue) => {
        Animated.spring(animValue, {
            toValue: 0,
            useNativeDriver: true,
            stiffness: 260,
            damping: 22,
            mass: 0.75,
            overshootClamping: true,
        }).start();
    };

    const handleConfirm = async () => {
        if (!selectedCatId) return;
        await runAction('confirm', async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const scopedLastCatKey = session?.user?.id ? `last_selected_cat_id:${session.user.id}` : 'last_selected_cat_id';
                await AsyncStorage.setItem(scopedLastCatKey, selectedCatId);
            } catch (e) {
                // no-op
            }
            if (onSelect) await onSelect(selectedCatId);
        });
    };

    const handleDismiss = () => {
        if (isSubmitting) return;
        setDropdownOpen(false);
        if (onDismiss) onDismiss();
    };

    const handleSkip = async () => {
        await runAction('skip', async () => {
            setDropdownOpen(false);
            if (onSkip) await onSkip();
        });
    };

    const handleReject = async () => {
        await runAction('reject', async () => {
            setDropdownOpen(false);
            if (onReject) await onReject();
        });
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={handleDismiss}
            statusBarTranslucent
        >
            <TouchableOpacity
                style={styles.backdrop}
                activeOpacity={1}
                onPress={() => {
                    if (!isSubmitting) handleDismiss();
                }}
            >
                <Animated.View
                    style={[
                        styles.modalContainer,
                        {
                            opacity: modalOpacity,
                            transform: [{ scale: modalScale }],
                        },
                    ]}
                >
                    <TouchableOpacity activeOpacity={1} onPress={() => setDropdownOpen(false)}>
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={styles.scrollContent}
                        >
                        <View style={styles.header}>
                            <View style={styles.headerLeft}>
                                <Text style={styles.headerTitle}>Identify Cat</Text>
                                {queueLength > 1 && (
                                    <View style={styles.queueBadge}>
                                        <Text style={styles.queueBadgeText}>1/{queueLength}</Text>
                                    </View>
                                )}
                            </View>
                            <AnimatedTouchableOpacity
                                onPress={handleDismiss}
                                onPressIn={() => animatePressIn(closePressAnim)}
                                onPressOut={() => animatePressOut(closePressAnim)}
                                disabled={isSubmitting}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                style={{
                                    opacity: isSubmitting ? 0.55 : 1,
                                    transform: [{
                                        scale: closePressAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [1, 0.92],
                                        }),
                                    }],
                                }}
                            >
                                <Ionicons name="close" size={24} color="#546E7A" />
                            </AnimatedTouchableOpacity>
                        </View>

                        {/* --- Multi-snapshot mode: 2 images side by side --- */}
                        {isMultiMode ? (
                            <>
                                <Text style={[styles.instructionText, { fontWeight: '700', color: '#1E293B', marginBottom: 10 }]}>
                                    Which of these cats is yours? ðŸ±
                                </Text>
                                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                                    {multiSnapshots.slice(0, 2).map((snap, idx) => (
                                        <TouchableOpacity
                                            key={idx}
                                            onPress={() => setSelectedSnapshotIdx(idx)}
                                            activeOpacity={0.8}
                                            style={[
                                                styles.multiSnapshotCard,
                                                selectedSnapshotIdx === idx && styles.multiSnapshotCardSelected,
                                            ]}
                                        >
                                            {snap.snapshot_url ? (
                                                <Image source={{ uri: snap.snapshot_url }} style={styles.multiSnapshotImage} resizeMode="cover" />
                                            ) : (
                                                <View style={[styles.multiSnapshotImage, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#ECEFF1' }]}>
                                                    <MaterialCommunityIcons name="camera-off-outline" size={28} color="#B0BEC5" />
                                                </View>
                                            )}
                                            <View style={styles.multiSnapshotLabel}>
                                                <Text style={styles.multiSnapshotLabelText}>Cat {idx + 1}</Text>
                                                {snap.behaviorLabel && (
                                                    <Text style={styles.multiSnapshotBehavior}>{snap.behaviorLabel}</Text>
                                                )}
                                            </View>
                                            {selectedSnapshotIdx === idx && (
                                                <View style={styles.multiSnapshotCheck}>
                                                    <Ionicons name="checkmark-circle" size={22} color="#00897B" />
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                <Text style={styles.instructionText}>Then confirm which cat in your list it is:</Text>
                            </>
                        ) : (
                            <View style={styles.detectionCard}>
                                <Image source={{ uri: previewSnapshotUri }} style={styles.snapshot} resizeMode="cover" />
                                <View style={styles.infoRow}>
                                    <View style={[styles.behaviorBadge, { backgroundColor: `${behaviorColor}20` }]}>
                                        <MaterialCommunityIcons name={behaviorIcon} size={18} color={behaviorColor} />
                                        <Text style={[styles.behaviorLabel, { color: behaviorColor }]}>
                                            {behaviorLabel || 'Unknown behavior'}
                                        </Text>
                                    </View>
                                    {confidencePct != null && <Text style={styles.confidenceText}>Confidence {confidencePct}%</Text>}
                                </View>
                            </View>
                        )}

                        <Text style={styles.instructionText}>{isMultiMode ? 'Which cat in your list?' : 'Select the cat you think showed this behavior:'}</Text>

                        <View style={{ zIndex: 100 }}>
                            <TouchableOpacity
                                style={styles.dropdownToggle}
                                onPress={() => !isSubmitting && setDropdownOpen(!dropdownOpen)}
                                activeOpacity={0.8}
                                disabled={isSubmitting}
                            >
                                <Text style={styles.dropdownToggleText}>
                                    {cats.length === 0
                                        ? 'No cats found in the system'
                                        : selectedCatName
                                            ? `Selected: ${selectedCatName}`
                                            : 'Tap to choose a cat...'}
                                </Text>
                                <Ionicons name={dropdownOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#546E7A" />
                            </TouchableOpacity>

                            {dropdownOpen && cats.length > 0 && (
                                <View style={styles.dropdownMenu}>
                                    {cats.map((cat, index) => (
                                        <TouchableOpacity
                                            key={cat.id}
                                            style={[styles.dropdownItem, index === cats.length - 1 && { borderBottomWidth: 0 }]}
                                            onPress={() => handlePickCat(cat.id)}
                                            disabled={isSubmitting}
                                        >
                                            <View style={styles.dropdownItemRow}>
                                                <Text style={styles.dropdownItemText}>{cat.name}</Text>
                                                {selectedCatId === cat.id ? (
                                                    <Ionicons name="checkmark-circle" size={18} color="#00897B" />
                                                ) : null}
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </View>

                        <View style={{ height: dropdownOpen ? (cats.length * 45) + 10 : 20 }} />

                        <View style={styles.actionRow}>
                            <AnimatedTouchableOpacity
                                style={[
                                    styles.confirmButton,
                                    ((!selectedCatId && !isMultiMode) || (isMultiMode && selectedSnapshotIdx === null) || !selectedCatId || isSubmitting) && styles.confirmButtonDisabled,
                                    {
                                        transform: [{
                                            scale: confirmPressAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [1, 0.96],
                                            }),
                                        }],
                                    },
                                ]}
                                onPress={isMultiMode ? handleConfirmMulti : handleConfirm}
                                onPressIn={() => animatePressIn(confirmPressAnim)}
                                onPressOut={() => animatePressOut(confirmPressAnim)}
                                activeOpacity={0.8}
                                disabled={(isMultiMode ? (selectedSnapshotIdx === null || !selectedCatId) : !selectedCatId) || isSubmitting}
                            >
                                {submittingAction === 'confirm' ? (
                                    <View style={styles.btnLoadingRow}>
                                        <ActivityIndicator size="small" color="#FFFFFF" />
                                        <Text style={[styles.confirmText, { marginLeft: 8 }]}>Saving...</Text>
                                    </View>
                                ) : (
                                    <Text style={[styles.confirmText, !selectedCatId && styles.confirmTextDisabled]}>
                                        Confirm
                                    </Text>
                                )}
                            </AnimatedTouchableOpacity>
                            <AnimatedTouchableOpacity
                                style={[
                                    styles.rejectButton,
                                    (selectedCatId || isSubmitting) && styles.rejectButtonDisabled,
                                    {
                                        transform: [{
                                            scale: rejectPressAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [1, 0.96],
                                            }),
                                        }],
                                    },
                                ]}
                                onPress={handleReject}
                                onPressIn={() => animatePressIn(rejectPressAnim)}
                                onPressOut={() => animatePressOut(rejectPressAnim)}
                                activeOpacity={0.8}
                                disabled={!!selectedCatId || isSubmitting}
                            >
                                {submittingAction === 'reject' ? (
                                    <View style={styles.btnLoadingRow}>
                                        <ActivityIndicator size="small" color="#B42318" />
                                        <Text style={[styles.rejectText, { marginLeft: 8 }]}>Updating...</Text>
                                    </View>
                                ) : (
                                    <Text style={[styles.rejectText, selectedCatId && styles.rejectTextDisabled]}>Not this cat</Text>
                                )}
                            </AnimatedTouchableOpacity>
                            <AnimatedTouchableOpacity
                                style={[
                                    styles.skipButton,
                                    isSubmitting && styles.skipButtonDisabled,
                                    {
                                        transform: [{
                                            scale: skipPressAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [1, 0.96],
                                            }),
                                        }],
                                    },
                                ]}
                                onPress={handleSkip}
                                onPressIn={() => animatePressIn(skipPressAnim)}
                                onPressOut={() => animatePressOut(skipPressAnim)}
                                activeOpacity={0.7}
                                disabled={isSubmitting}
                            >
                                {submittingAction === 'skip' ? (
                                    <View style={styles.btnLoadingRow}>
                                        <ActivityIndicator size="small" color="#546E7A" />
                                        <Text style={[styles.skipText, { marginLeft: 8 }]}>Skipping...</Text>
                                    </View>
                                ) : (
                                    <Text style={styles.skipText}>Skip for now</Text>
                                )}
                            </AnimatedTouchableOpacity>
                        </View>
                        </ScrollView>
                    </TouchableOpacity>
                </Animated.View>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.32)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContainer: {
        width: SCREEN_WIDTH * 0.9,
        maxWidth: 400,
        maxHeight: '88%',
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: '#E6EEF3',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.14,
        shadowRadius: 18,
        elevation: 10,
    },
    scrollContent: {
        paddingBottom: 4,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: '#1E293B',
    },
    queueBadge: {
        backgroundColor: '#FF8A65',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 12,
    },
    queueBadgeText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: 'bold',
    },
    detectionCard: {
        backgroundColor: '#F8FBFC',
        borderRadius: 11,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#E7EEF2',
        overflow: 'hidden',
    },
    snapshot: {
        width: '100%',
        height: 140,
    },
    snapshotPlaceholder: {
        width: '100%',
        height: 100,
        backgroundColor: '#ECEFF1',
        justifyContent: 'center',
        alignItems: 'center',
    },
    snapshotPlaceholderText: {
        fontSize: 13,
        color: '#90A4AE',
        marginTop: 4,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        paddingHorizontal: 10,
    },
    behaviorBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 999,
        gap: 6,
    },
    behaviorLabel: {
        fontWeight: '700',
        fontSize: 14,
        textTransform: 'capitalize',
    },
    confidenceText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#64748B',
    },
    instructionText: {
        fontSize: 13,
        color: '#64748B',
        marginBottom: 8,
    },
    dropdownToggle: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#D7E2E8',
        borderRadius: 10,
        paddingVertical: 11,
        paddingHorizontal: 12,
        backgroundColor: '#F8FAFB',
    },
    dropdownToggleText: {
        fontSize: 14,
        color: '#1F2937',
    },
    dropdownMenu: {
        position: 'absolute',
        top: 55,
        left: 0,
        right: 0,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#D7E2E8',
        borderRadius: 10,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
        elevation: 5,
        zIndex: 999,
        maxHeight: 200,
    },
    dropdownItem: {
        padding: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#ECEFF1',
    },
    dropdownItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    dropdownItemText: {
        fontSize: 15,
        color: '#263238',
    },
    actionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 10,
        flexWrap: 'wrap',
    },
    btnLoadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    confirmButton: {
        paddingVertical: 9,
        paddingHorizontal: 16,
        borderRadius: 999,
        backgroundColor: '#00897B',
        flexGrow: 1,
        minWidth: 100,
        alignItems: 'center',
    },
    confirmButtonDisabled: {
        backgroundColor: '#CFD8DC',
    },
    confirmText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 14,
    },
    confirmTextDisabled: {
        color: '#78909C',
    },
    skipButton: {
        paddingVertical: 9,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: '#EDF2F6',
        flexGrow: 1,
        minWidth: 100,
        alignItems: 'center',
    },
    skipButtonDisabled: {
        backgroundColor: '#ECEFF1',
    },
    rejectButton: {
        paddingVertical: 9,
        paddingHorizontal: 16,
        borderRadius: 999,
        backgroundColor: '#FFE4E6',
        flexGrow: 1,
        minWidth: 100,
        alignItems: 'center',
    },
    rejectButtonDisabled: {
        backgroundColor: '#ECEFF1',
    },
    rejectText: {
        color: '#B42318',
        fontWeight: '700',
        fontSize: 14,
    },
    rejectTextDisabled: {
        color: '#90A4AE',
    },
    skipText: {
        color: '#546E7A',
        fontWeight: '600',
        fontSize: 14,
    },
    // Multi-snapshot comparison
    multiSnapshotCard: {
        flex: 1,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#E7EEF2',
        overflow: 'hidden',
        backgroundColor: '#F8FBFC',
        position: 'relative',
    },
    multiSnapshotCardSelected: {
        borderColor: '#00897B',
        shadowColor: '#00897B',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 4,
    },
    multiSnapshotImage: {
        width: '100%',
        height: 110,
    },
    multiSnapshotLabel: {
        padding: 8,
    },
    multiSnapshotLabelText: {
        fontWeight: '700',
        fontSize: 13,
        color: '#1E293B',
    },
    multiSnapshotBehavior: {
        fontSize: 11,
        color: '#64748B',
        textTransform: 'capitalize',
        marginTop: 2,
    },
    multiSnapshotCheck: {
        position: 'absolute',
        top: 6,
        right: 6,
        backgroundColor: '#fff',
        borderRadius: 12,
    },
});

