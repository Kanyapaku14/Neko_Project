/**
 * CatPickerModal.js
 *
 * Modal for selecting which cat was detected in a pending identity event.
 */

import React, { useState } from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Image,
    Dimensions,
} from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

export default function CatPickerModal({ visible, alert, cats = [], onSelect, onSkip, onDismiss, queueLength = 0 }) {
    const [dropdownOpen, setDropdownOpen] = useState(false);

    if (!alert) return null;

    const { behaviorLabel, confidence, cropSnapshot } = alert;
    const confidencePct = confidence != null ? Math.round(confidence * 100) : null;
    const { icon: behaviorIcon, color: behaviorColor } = getBehaviorIcon(behaviorLabel);

    const handleSelectCat = (catId) => {
        setDropdownOpen(false);
        if (onSelect) onSelect(catId);
    };

    const handleDismiss = () => {
        setDropdownOpen(false);
        if (onDismiss) onDismiss();
    };

    const handleSkip = () => {
        setDropdownOpen(false);
        if (onSkip) onSkip();
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onDismiss}
            statusBarTranslucent
        >
            <TouchableOpacity
                style={styles.backdrop}
                activeOpacity={1}
                onPress={handleDismiss}
            >
                <TouchableOpacity
                    style={styles.modalContainer}
                    activeOpacity={1}
                    onPress={() => setDropdownOpen(false)}
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
                        <TouchableOpacity onPress={handleDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Ionicons name="close" size={24} color="#546E7A" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.detectionCard}>
                        {cropSnapshot ? (
                            <Image source={{ uri: cropSnapshot }} style={styles.snapshot} resizeMode="cover" />
                        ) : (
                            <View style={styles.snapshotPlaceholder}>
                                <MaterialCommunityIcons name="camera-off-outline" size={32} color="#B0BEC5" />
                                <Text style={styles.snapshotPlaceholderText}>No image available</Text>
                            </View>
                        )}
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

                    <Text style={styles.instructionText}>Select the cat you think showed this behavior:</Text>

                    <View style={{ zIndex: 100 }}>
                        <TouchableOpacity
                            style={styles.dropdownToggle}
                            onPress={() => setDropdownOpen(!dropdownOpen)}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.dropdownToggleText}>
                                {cats.length === 0 ? 'No cats found in the system' : 'Tap to choose a cat...'}
                            </Text>
                            <Ionicons name={dropdownOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#546E7A" />
                        </TouchableOpacity>

                        {dropdownOpen && cats.length > 0 && (
                            <View style={styles.dropdownMenu}>
                                {cats.map((cat, index) => (
                                    <TouchableOpacity
                                        key={cat.id}
                                        style={[styles.dropdownItem, index === cats.length - 1 && { borderBottomWidth: 0 }]}
                                        onPress={() => handleSelectCat(cat.id)}
                                    >
                                        <Text style={styles.dropdownItemText}>{cat.name}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>

                    <View style={{ height: dropdownOpen ? (cats.length * 45) + 10 : 20 }} />

                    <View style={styles.actionRow}>
                        <TouchableOpacity style={styles.skipButton} onPress={handleSkip} activeOpacity={0.7}>
                            <Text style={styles.skipText}>Skip for now</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContainer: {
        width: SCREEN_WIDTH * 0.9,
        maxWidth: 400,
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 10,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#263238',
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
        backgroundColor: '#F4F9F9',
        borderRadius: 12,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#E0F2F1',
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
        padding: 12,
    },
    behaviorBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 6,
    },
    behaviorLabel: {
        fontWeight: '700',
        fontSize: 14,
        textTransform: 'capitalize',
    },
    confidenceText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#78909C',
    },
    instructionText: {
        fontSize: 14,
        color: '#546E7A',
        marginBottom: 8,
    },
    dropdownToggle: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#CFD8DC',
        borderRadius: 10,
        padding: 14,
        backgroundColor: '#FAFAFA',
    },
    dropdownToggleText: {
        fontSize: 15,
        color: '#263238',
    },
    dropdownMenu: {
        position: 'absolute',
        top: 55,
        left: 0,
        right: 0,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#CFD8DC',
        borderRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
        zIndex: 999,
        maxHeight: 200,
    },
    dropdownItem: {
        padding: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#ECEFF1',
    },
    dropdownItemText: {
        fontSize: 15,
        color: '#263238',
    },
    actionRow: {
        flexDirection: 'row',
        justifyContent: 'center',
    },
    skipButton: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 20,
        backgroundColor: '#ECEFF1',
    },
    skipText: {
        color: '#546E7A',
        fontWeight: '600',
        fontSize: 14,
    },
});
