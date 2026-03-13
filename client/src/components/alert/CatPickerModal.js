/**
 * CatPickerModal.js
 *
 * Identity picker for cat selection. Uses a cat card grid instead of a dropdown.
 * - Normal: shows session thumbnail strip (if multiSnapshots) + cat card grid
 * - Abnormal: red header, always shows immediately (Rule 7)
 * - Foreign cat: single reject button "Not my cat"
 * - Normal unknown: single reject button "Not a cat"
 * - After selection: result patched immediately on alert card via AlertEngine
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
    FlatList,
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
    eat: { icon: 'food', color: '#00695C' },
    eating: { icon: 'food', color: '#00695C' },
    litter: { icon: 'emoticon-poop-outline', color: '#5D4037' },
};

const ABNORMAL_BEHAVIORS = new Set(['vomiting', 'head_pressing']);

function getBehaviorIcon(label) {
    const normalized = (label || '').toLowerCase().replace(/\s+/g, '_');
    return BEHAVIOR_ICON_MAP[normalized] || { icon: 'paw', color: '#546E7A' };
}

function isAbnormalBehaviorLabel(label) {
    const normalized = (label || '').toLowerCase().replace(/\s+/g, '_').trim();
    return ABNORMAL_BEHAVIORS.has(normalized);
}

export default function CatPickerModal({
    visible,
    alert,
    cats = [],
    onSelect,
    onSkip,
    onDismiss,
    onReject,
    onRemoveSnapshot,   // (idx: number, nextSnapshots: array) => void - called when user taps trash on a thumbnail
    queueLength = 0,
    isForeignCatAlert = false,
}) {
    const [selectedCatId, setSelectedCatId] = useState(null);
    const [submittingAction, setSubmittingAction] = useState(null);
    // Local snapshot list so user can remove non-cat images before submission
    const [localSnapshots, setLocalSnapshots] = useState([]);
    const mountedRef = useRef(true);
    const modalScale = useRef(new Animated.Value(0.96)).current;
    const modalOpacity = useRef(new Animated.Value(0)).current;
    const confirmPressAnim = useRef(new Animated.Value(0)).current;
    const rejectPressAnim = useRef(new Animated.Value(0)).current;
    const skipPressAnim = useRef(new Animated.Value(0)).current;
    const closePressAnim = useRef(new Animated.Value(0)).current;

    const isSubmitting = submittingAction !== null;

    React.useEffect(() => {
        return () => { mountedRef.current = false; };
    }, []);

    // Pre-fill when editing an already-resolved alert
    React.useEffect(() => {
        if (!visible || !alert) return;
        const isPending = alert.pendingIdentityConfirm === true;
        const isResolved = !isPending && alert.resolvedBy && alert.resolvedBy !== 'skipped';
        setSelectedCatId(isResolved ? (alert.resolvedCatId || null) : null);
    }, [visible, alert?.id, alert?.resolvedBy, alert?.resolvedCatId, alert?.pendingIdentityConfirm]);

    // Sync localSnapshots from alert whenever it changes
    React.useEffect(() => {
        if (!visible || !alert) return;
        setLocalSnapshots(Array.isArray(alert.multiSnapshots) ? [...alert.multiSnapshots] : []);
    }, [visible, alert?.id]);

    const removeSnap = (idx) => {
        setLocalSnapshots((prev) => {
            const next = prev.filter((_, i) => i !== idx);
            if (onRemoveSnapshot) onRemoveSnapshot(idx, next);
            return next;
        });
    };

    React.useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(modalScale, {
                    toValue: 1, useNativeDriver: true,
                    stiffness: 260, damping: 24, mass: 0.8, overshootClamping: true,
                }),
                Animated.timing(modalOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
            ]).start();
        } else {
            modalScale.setValue(0.96);
            modalOpacity.setValue(0);
        }
    }, [visible, modalOpacity, modalScale]);

    if (!alert) return null;

    const { behaviorLabel, behaviorDetail, confidence, cropSnapshot, catCounts } = alert;
    const displayBehaviorLabel = behaviorLabel;
    const normalizedBehavior = String(displayBehaviorLabel || '').toLowerCase().trim();
    const isAbnormal = isAbnormalBehaviorLabel(behaviorLabel)
        || isAbnormalBehaviorLabel(behaviorDetail);
    const canSelectCat = isAbnormal || ['eat', 'feeding_session', 'litter', 'litter_session', 'toileting', 'litter_box'].includes(normalizedBehavior);
    const confidencePct = confidence != null ? Math.round(confidence * 100) : null;
    const { icon: behaviorIcon, color: behaviorColor } = getBehaviorIcon(displayBehaviorLabel);
    const hasSessionSnaps = localSnapshots.length > 0;
    const fallbackUri = `${VIDEO_SERVER_BASE}/api/latest_frame.jpg?t=${encodeURIComponent(alert?.timestamp || 'latest')}`;
    const previewUri = cropSnapshot || fallbackUri;
    const isLikelyFullFrame = typeof previewUri === 'string' && previewUri.includes('/api/latest_frame');

    // Build sorted cat list with detection count badges from catCounts / session vote data
    const sortedCats = [...cats]
        .map((c) => ({ ...c, _count: Number(catCounts?.[c.id] || 0) }))
        .sort((a, b) => b._count - a._count);
    const maxCount = sortedCats.length > 0 ? Math.max(...sortedCats.map((c) => c._count)) : 0;

    const rejectLabel = isForeignCatAlert ? 'Not your cat' : 'Not a cat';
    const rejectReason = isForeignCatAlert ? 'not_this_cat' : 'not_a_cat';

    const runAction = async (actionType, runner) => {
        if (isSubmitting) return;
        setSubmittingAction(actionType);
        try { await runner(); }
        finally { if (mountedRef.current) setSubmittingAction(null); }
    };

    const animPressIn = (anim) => Animated.timing(anim, { toValue: 1, duration: 90, useNativeDriver: true }).start();
    const animPressOut = (anim) => Animated.spring(anim, { toValue: 0, useNativeDriver: true, stiffness: 260, damping: 22, mass: 0.75, overshootClamping: true }).start();

    const handleConfirm = async () => {
        if (!selectedCatId) return;
        await runAction('confirm', async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const key = session?.user?.id ? `last_selected_cat_id:${session.user.id}` : 'last_selected_cat_id';
                await AsyncStorage.setItem(key, selectedCatId);
            } catch (_) { }
            if (onSelect) await onSelect(selectedCatId);
        });
    };

    const handleReject = async () => {
        await runAction('reject', async () => {
            if (onReject) await onReject(rejectReason);
        });
    };

    const handleSkip = async () => {
        await runAction('skip', async () => {
            if (onSkip) await onSkip();
        });
    };

    const handleDismiss = () => {
        if (isSubmitting) return;
        if (onDismiss) onDismiss();
    };

    const CatCard = ({ cat }) => {
        const isSelected = selectedCatId === cat.id;
        const hasTopDetections = cat._count > 0 && cat._count === maxCount;
        const cardScale = useRef(new Animated.Value(0)).current;
        const animPressInLocal = () => Animated.timing(cardScale, { toValue: 1, duration: 90, useNativeDriver: true }).start();
        const animPressOutLocal = () => Animated.spring(cardScale, { toValue: 0, useNativeDriver: true, stiffness: 260, damping: 22, mass: 0.75, overshootClamping: true }).start();

        return (
            <AnimatedTouchableOpacity
                activeOpacity={1}
                onPressIn={animPressInLocal}
                onPressOut={animPressOutLocal}
                style={[
                    styles.catCard,
                    isSelected && styles.catCardSelected,
                    { transform: [{ scale: cardScale.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] }) }] }
                ]}
                onPress={() => !isSubmitting && setSelectedCatId(isSelected ? null : cat.id)}
            >
                {cat.image_url || cat.photo_url ? (
                    <Image source={{ uri: cat.image_url || cat.photo_url }} style={styles.catPhoto} />
                ) : (
                    <View style={[styles.catPhoto, styles.catPhotoPlaceholder]}>
                        <MaterialCommunityIcons name="cat" size={32} color="#B0BEC5" />
                    </View>
                )}
                {isSelected && (
                    <View style={styles.catCardCheck}>
                        <Ionicons name="checkmark-circle" size={22} color="#00897B" />
                    </View>
                )}
                {hasTopDetections && !isSelected && (
                    <View style={styles.mostDetectedBadge}>
                        <Text style={styles.mostDetectedText}>Top</Text>
                    </View>
                )}
                <Text style={[styles.catName, isSelected && styles.catNameSelected]} numberOfLines={1}>{cat.name}</Text>
                {cat._count > 0 && (
                    <Text style={styles.catCountText}>{cat._count} detections</Text>
                )}
            </AnimatedTouchableOpacity>
        );
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
                onPress={() => { if (!isSubmitting) handleDismiss(); }}
            >
                    <Animated.View
                        style={[
                            styles.modalContainer,
                            { opacity: modalOpacity, transform: [{ scale: modalScale }] },
                        ]}
                    >
                    <TouchableOpacity activeOpacity={1} onPress={() => { }}>
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={styles.scrollContent}
                        >
                            {/* ── Header ─────────────────────────────── */}
                            <View style={styles.header}>
                                <View style={styles.headerLeft}>
                                    <Text style={styles.headerTitle}>Identify the cat</Text>
                                    {isAbnormal && (
                                        <View style={styles.abnormalBadge}>
                                            <MaterialCommunityIcons name="alert-circle" size={14} color="#B42318" />
                                            <Text style={styles.abnormalBadgeText}>Abnormal</Text>
                                        </View>
                                    )}
                                    {queueLength > 1 && (
                                        <View style={styles.queueBadge}>
                                            <Text style={styles.queueBadgeText}>1/{queueLength}</Text>
                                        </View>
                                    )}
                                </View>
                                <AnimatedTouchableOpacity
                                    onPress={handleDismiss}
                                    onPressIn={() => animPressIn(closePressAnim)}
                                    onPressOut={() => animPressOut(closePressAnim)}
                                    disabled={isSubmitting}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    style={{ opacity: isSubmitting ? 0.55 : 1, transform: [{ scale: closePressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.88] }) }] }}
                                >
                                    <Ionicons name="close" size={24} color="#546E7A" />
                                </AnimatedTouchableOpacity>
                            </View>

                            {/* ── Behavior chip + confidence ─────────── */}
                            <View style={styles.behaviorRow}>
                                <View style={[styles.behaviorBadge, { backgroundColor: `${behaviorColor}20` }]}>
                                    <MaterialCommunityIcons name={behaviorIcon} size={16} color={behaviorColor} />
                                    <Text style={[styles.behaviorLabel, { color: behaviorColor }]}>
                                        {displayBehaviorLabel || 'Unknown'}
                                    </Text>
                                </View>
                                {confidencePct != null && (
                                    <Text style={styles.confidenceText}>{confidencePct}% confidence</Text>
                                )}
                            </View>

                            {/* ── Session thumbnails strip (eat/litter) ─ */}
                            {hasSessionSnaps && (
                                <View style={styles.snapshotStrip}>
                                    <Text style={styles.snapshotStripLabel}>Session snapshots (tap trash to remove non-cat images)</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                                        {localSnapshots.map((snap, idx) => (
                                            <View key={idx} style={styles.snapshotThumb}>
                                                {((typeof snap === 'string') ? snap : (snap.snapshot_url || snap.path)) ? (
                                                    <Image
                                                        source={{ uri: (typeof snap === 'string') ? snap : (snap.snapshot_url || snap.path) }}
                                                        style={styles.snapshotThumbImage}
                                                        resizeMode="cover"
                                                    />
                                                ) : (
                                                    <View style={[styles.snapshotThumbImage, { backgroundColor: '#ECEFF1', justifyContent: 'center', alignItems: 'center' }]}>
                                                        <MaterialCommunityIcons name="camera-off-outline" size={20} color="#B0BEC5" />
                                                    </View>
                                                )}
                                                {snap && typeof snap === 'object' && snap.count > 0 && (
                                                    <View style={styles.snapCountBadge}>
                                                        <Text style={styles.snapCountText}>{snap.count}</Text>
                                                    </View>
                                                )}
                                                {/* Trash — remove non-cat image */}
                                                <TouchableOpacity
                                                    style={styles.snapTrashBtn}
                                                    onPress={() => removeSnap(idx)}
                                                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                                >
                                                    <Ionicons name="trash" size={12} color="#FFF" />
                                                </TouchableOpacity>
                                            </View>
                                        ))}
                                    </ScrollView>
                                </View>
                            )}

                            {/* ── Single snapshot (abnormal / normal) ─── */}
                            {!hasSessionSnaps && !isLikelyFullFrame && (
                                <View style={styles.singleSnapCard}>
                                    <Image source={{ uri: previewUri }} style={styles.singleSnapImage} resizeMode="cover" />
                                </View>
                            )}
                            {!hasSessionSnaps && isLikelyFullFrame && (
                                <View style={styles.noSnapshotBox}>
                                    <MaterialCommunityIcons name="image-off-outline" size={22} color="#94A3B8" />
                                    <Text style={styles.noSnapshotText}>Cat snapshot not available yet.</Text>
                                </View>
                            )}

                            <Text style={styles.helperNote}>
                                Remove any image that is not a cat. If no cat is shown, tap Not a cat. If the behavior does not match, you can Skip or remove it. Both are acceptable.
                            </Text>

                            {/* ── Selected cat summary ─────────────── */}
                            {selectedCatId && (() => {
                                const selCat = sortedCats.find((c) => c.id === selectedCatId);
                                return selCat ? (
                                    <View style={styles.selectedCatBanner}>
                                        {selCat.image_url || selCat.photo_url ? (
                                            <Image source={{ uri: selCat.image_url || selCat.photo_url }} style={styles.selectedCatPhoto} />
                                        ) : (
                                            <View style={[styles.selectedCatPhoto, { backgroundColor: '#E0F2F1', justifyContent: 'center', alignItems: 'center' }]}>
                                                <MaterialCommunityIcons name="cat" size={16} color="#00897B" />
                                            </View>
                                        )}
                                        <Ionicons name="checkmark-circle" size={16} color="#00897B" style={{ marginRight: 4 }} />
                                        <Text style={styles.selectedCatBannerText}>{selCat.name}</Text>
                                    </View>
                                ) : null;
                            })()}

                            {/* ── Cat card grid ───────────────────────── */}
                            {canSelectCat && (
                                <>
                                    <Text style={styles.sectionLabel}>
                                        {cats.length === 0 ? 'No cats registered' : 'Select which cat this is:'}
                                    </Text>
                                    {cats.length === 0 ? (
                                        <View style={styles.noCatBox}>
                                            <MaterialCommunityIcons name="cat" size={36} color="#B0BEC5" />
                                            <Text style={styles.noCatText}>Add cats in your profile first.</Text>
                                        </View>
                                    ) : (
                                        <FlatList
                                            data={sortedCats}
                                            keyExtractor={(c) => c.id}
                                            renderItem={({ item }) => <CatCard cat={item} />}
                                            numColumns={3}
                                            scrollEnabled={false}
                                            columnWrapperStyle={{ gap: 8 }}
                                            contentContainerStyle={{ gap: 8 }}
                                            style={{ marginBottom: 4 }}
                                        />
                                    )}
                                </>
                            )}
                            {!canSelectCat && (
                                <View style={styles.helperNoteBox}>
                                    <Text style={styles.helperNote}>Cat selection is available for Feeding and Litter only.</Text>
                                </View>
                            )}

                            {/* ── Action row ─────────────────────────── */}
                            <View style={styles.actionRow}>
                                {/* Confirm */}
                                <AnimatedTouchableOpacity
                                    style={[
                                        styles.confirmButton,
                                        (!selectedCatId || isSubmitting) && styles.confirmButtonDisabled,
                                        { transform: [{ scale: confirmPressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] }) }] },
                                    ]}
                                    onPress={handleConfirm}
                                    onPressIn={() => animPressIn(confirmPressAnim)}
                                    onPressOut={() => animPressOut(confirmPressAnim)}
                                    activeOpacity={0.8}
                                    disabled={!selectedCatId || isSubmitting}
                                >
                                    {submittingAction === 'confirm' ? (
                                        <View style={styles.btnRow}>
                                            <ActivityIndicator size="small" color="#FFFFFF" />
                                            <Text style={[styles.confirmText, { marginLeft: 8 }]}>Saving...</Text>
                                        </View>
                                    ) : selectedCatId ? (() => {
                                        const selCat = sortedCats.find((c) => c.id === selectedCatId);
                                        return (
                                            <View style={styles.btnRow}>
                                                <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                                                <Text style={styles.confirmText}>Confirm{selCat ? ` • ${selCat.name}` : ''}</Text>
                                            </View>
                                        );
                                    })() : (
                                        <Text style={[styles.confirmText, styles.confirmTextDisabled]}>Confirm</Text>
                                    )}
                                </AnimatedTouchableOpacity>

                                {/* Single reject button */}
                                <AnimatedTouchableOpacity
                                    style={[
                                        styles.rejectButton,
                                        (!!selectedCatId || isSubmitting) && styles.rejectButtonDisabled,
                                        { transform: [{ scale: rejectPressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] }) }] },
                                    ]}
                                    onPress={handleReject}
                                    onPressIn={() => animPressIn(rejectPressAnim)}
                                    onPressOut={() => animPressOut(rejectPressAnim)}
                                    activeOpacity={0.8}
                                    disabled={!!selectedCatId || isSubmitting}
                                >
                                    {submittingAction === 'reject' ? (
                                        <View style={styles.btnRow}>
                                            <ActivityIndicator size="small" color="#B42318" />
                                            <Text style={[styles.rejectText, { marginLeft: 8 }]}>Updating...</Text>
                                        </View>
                                    ) : (
                                        <>
                                            <MaterialCommunityIcons 
                                                name={isForeignCatAlert ? "account-off-outline" : "cat"} 
                                                size={16} 
                                                color={!!selectedCatId ? "#94A3B8" : "#B42318"} 
                                                style={{ marginRight: 6 }} 
                                            />
                                            <Text style={[styles.rejectText, !!selectedCatId && styles.rejectTextDisabled]}>{rejectLabel}</Text>
                                        </>
                                    )}
                                </AnimatedTouchableOpacity>

                                {/* Skip */}
                                <AnimatedTouchableOpacity
                                    style={[
                                        styles.skipButton,
                                        isSubmitting && styles.skipButtonDisabled,
                                        { transform: [{ scale: skipPressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] }) }] },
                                    ]}
                                    onPress={handleSkip}
                                    onPressIn={() => animPressIn(skipPressAnim)}
                                    onPressOut={() => animPressOut(skipPressAnim)}
                                    activeOpacity={0.7}
                                    disabled={isSubmitting}
                                >
                                    {submittingAction === 'skip' ? (
                                        <View style={styles.btnRow}>
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
        backgroundColor: 'rgba(15, 23, 42, 0.36)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContainer: {
        width: SCREEN_WIDTH * 0.92,
        maxWidth: 420,
        maxHeight: '90%',
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: '#E6EEF3',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 12,
    },
    scrollContent: { paddingBottom: 6 },
    // Header
    header: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 10,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: '#1E293B' },
    abnormalBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
        backgroundColor: '#FEE2E2',
        borderWidth: 1,
        borderColor: '#FCA5A5',
    },
    abnormalBadgeText: { color: '#B42318', fontSize: 10, fontWeight: '700' },
    queueBadge: {
        backgroundColor: '#FF8A65', paddingHorizontal: 7,
        paddingVertical: 2, borderRadius: 12, marginLeft: 6,
    },
    queueBadgeText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
    // Behavior row
    behaviorRow: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 12,
    },
    behaviorBadge: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 10, paddingVertical: 4,
        borderRadius: 999, gap: 6,
    },
    behaviorLabel: { fontWeight: '700', fontSize: 13, textTransform: 'capitalize' },
    confidenceText: { fontSize: 11, fontWeight: '600', color: '#64748B' },
    // Session thumbnails
    snapshotStrip: { marginBottom: 12 },
    snapshotStripLabel: {
        fontSize: 11, color: '#94A3B8', fontWeight: '600',
        marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6,
    },
    snapshotThumb: { position: 'relative' },
    snapshotThumbImage: { width: 72, height: 72, borderRadius: 8 },
    snapTrashBtn: {
        position: 'absolute',
        top: 4,
        left: 4,
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: 'rgba(0,0,0,0.65)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    snapCountBadge: {
        position: 'absolute', top: 4, right: 4,
        backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8,
        paddingHorizontal: 5, paddingVertical: 1,
    },
    snapCountText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
    // Single snapshot
    singleSnapCard: {
        borderRadius: 12, overflow: 'hidden',
        marginBottom: 12, borderWidth: 1, borderColor: '#E7EEF2',
        aspectRatio: 4 / 3,
    },
    noSnapshotBox: {
        borderWidth: 1,
        borderColor: '#E7EEF2',
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 12,
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#F8FAFC',
        marginBottom: 12,
    },
    noSnapshotText: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
    singleSnapImage: { width: '100%', height: '100%' },
    // Selected cat banner (shows after pick)
    selectedCatBanner: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#E8F5E9', borderRadius: 10,
        paddingHorizontal: 10, paddingVertical: 6,
        marginBottom: 10, gap: 6, borderWidth: 1, borderColor: '#A5D6A7',
    },
    selectedCatPhoto: { width: 24, height: 24, borderRadius: 12, marginRight: 2 },
    selectedCatBannerText: { fontSize: 13, fontWeight: '700', color: '#1B5E20', flex: 1 },
    // Section label
    sectionLabel: { fontSize: 13, color: '#64748B', fontWeight: '600', marginBottom: 10 },
    helperNote: { fontSize: 11, color: '#94A3B8', marginBottom: 10, fontWeight: '600' },
    helperNoteBox: {
        borderWidth: 1,
        borderColor: '#E7EEF2',
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 10,
        marginBottom: 10,
        backgroundColor: '#F8FAFC',
    },
    // Cat card grid
    catCard: {
        flex: 1,
        alignItems: 'center',
        borderRadius: 14,
        borderWidth: 2,
        borderColor: '#E7EEF2',
        backgroundColor: '#F8FBFC',
        padding: 8,
        position: 'relative',
    },
    catCardSelected: {
        borderColor: '#00897B',
        backgroundColor: '#E8F5E9',
        shadowColor: '#00897B',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
        elevation: 4,
    },
    catPhoto: { width: 56, height: 56, borderRadius: 28, marginBottom: 6 },
    catPhotoPlaceholder: { backgroundColor: '#ECEFF1', justifyContent: 'center', alignItems: 'center' },
    catName: { fontSize: 12, fontWeight: '700', color: '#1E293B', textAlign: 'center' },
    catNameSelected: { color: '#00695C' },
    catCountText: { fontSize: 10, color: '#64748B', marginTop: 2 },
    catCardCheck: {
        position: 'absolute', top: 4, right: 4,
        backgroundColor: '#fff', borderRadius: 12,
    },
    mostDetectedBadge: {
        position: 'absolute', top: 4, left: 4,
        backgroundColor: '#FF8F00', borderRadius: 8,
        paddingHorizontal: 5, paddingVertical: 1,
    },
    mostDetectedText: { color: '#FFF', fontSize: 9, fontWeight: 'bold' },
    noCatBox: { alignItems: 'center', paddingVertical: 18, gap: 8 },
    noCatText: { fontSize: 13, color: '#90A4AE' },
    // Action row
    actionRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 14 },
    btnRow: { flexDirection: 'row', alignItems: 'center' },
    confirmButton: {
        flex: 2, paddingVertical: 10, paddingHorizontal: 14,
        borderRadius: 999, backgroundColor: '#00897B',
        alignItems: 'center', minWidth: 100,
    },
    confirmButtonDisabled: { backgroundColor: '#CFD8DC' },
    confirmText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
    confirmTextDisabled: { color: '#78909C' },
    rejectButton: {
        flex: 1, paddingVertical: 10, paddingHorizontal: 12,
        borderRadius: 999, backgroundColor: '#FFE4E6',
        alignItems: 'center', minWidth: 90,
    },
    rejectButtonDisabled: { backgroundColor: '#ECEFF1' },
    rejectText: { color: '#B42318', fontWeight: '700', fontSize: 13 },
    rejectTextDisabled: { color: '#90A4AE' },
    skipButton: {
        flex: 1, paddingVertical: 10, paddingHorizontal: 12,
        borderRadius: 999, backgroundColor: '#EDF2F6',
        alignItems: 'center', minWidth: 80,
    },
    skipButtonDisabled: { backgroundColor: '#ECEFF1' },
    skipText: { color: '#546E7A', fontWeight: '600', fontSize: 13 },
});
