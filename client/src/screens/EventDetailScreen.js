import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Animated } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AlertEngine from '../services/AlertEngine';
import CameraMetaBlock from '../components/alert/CameraMetaBlock';
import { GlobalAlertQueueContext } from '../services/GlobalAlertQueue';
import { CAMERA_API_BASE } from '../config/cameraApi';

export default function EventDetailScreen({ onBack, route, alertData }) {
    // Navigate via route.params or direct prop
    const data = (route && route.params && route.params.alertData) || alertData;
    const { pushAlert } = useContext(GlobalAlertQueueContext);
    const [alertView, setAlertView] = useState(data || null);
    const backBtnAnim = useState(new Animated.Value(0))[0];
    const identifyBtnAnim = useState(new Animated.Value(0))[0];
    const actionBtnAnim = useState(new Animated.Value(0))[0];

    useEffect(() => {
        setAlertView(data || null);
    }, [data]);

    // Re-evaluate pending status if alert gets resolved while this screen is open
    useEffect(() => {
        const handler = () => {
            const upToDateAlert = AlertEngine.getHistory().find((a) => {
                if (a.id === data?.id) return true;
                if (data?.remoteReviewId && String(a?.remoteReviewId || '') === String(data.remoteReviewId)) return true;
                if (data?.sessionId && a?.sessionId === data.sessionId && a?.type === data?.type) return true;
                return false;
            });
            if (upToDateAlert) {
                setAlertView(upToDateAlert);
            }
        };
        AlertEngine.on('ALERT_ENGINE_UPDATED', handler);
        return () => AlertEngine.off('ALERT_ENGINE_UPDATED', handler);
    }, [data?.id]);

    if (!alertView) {
        return (
            <View style={styles.screenBg}>
                <StatusBar style="dark" translucent backgroundColor="transparent" />
                <LinearGradient colors={['#f5fffdff', '#f5fffdff']} style={{ flex: 1 }}>
                    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
                        <View style={styles.header}>
                            <TouchableOpacity onPress={onBack} style={styles.backButton}>
                                <Ionicons name="chevron-back" size={28} color="#333" />
                            </TouchableOpacity>
                            <Text style={styles.headerTitle}>Event Detail</Text>
                            <View style={styles.headerRightSpacer} />
                        </View>
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <MaterialCommunityIcons name="alert-circle-outline" size={64} color="#BDBDBD" />
                            <Text style={{ marginTop: 16, color: '#757575', fontSize: 16 }}>No event data found.</Text>
                        </View>
                    </SafeAreaView>
                </LinearGradient>
            </View>
        );
    }

    // 3 Severity Levels Config
    const getAlertVisuals = (alert) => {
        const type = String(alert?.type || '').toLowerCase();
        const severity = String(alert?.severity || 'info').toLowerCase();

        if (alert.pendingIdentityConfirm) {
            return { icon: 'help-rhombus-outline', color: '#E65100', bg: '#FFF8E1', text: 'Pending Identity' };
        }
        if (type === 'pending_identity' && alert.resolvedBy === 'skipped') {
            return { icon: 'cat', color: '#B42318', bg: '#FFE4E6', text: 'Identity Skipped' };
        }

        switch (type) {
            case 'litter_summary':
                return { icon: 'emoticon-poop-outline', color: '#0288D1', bg: '#E1F5FE', text: 'Litter Summary' };
            case 'camera_moved':
                return { icon: 'video-off-outline', color: '#E65100', bg: '#FFF3E0', text: 'Camera Moved' };
            case 'assessment_saved':
                return { icon: 'clipboard-check-outline', color: '#2E7D32', bg: '#E8F5E9', text: 'Assessment Saved' };
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
    const sevConfig = getAlertVisuals(alertView);
    const isIdentityAlert = alertView.type === 'pending_identity';
    const isPending = alertView.pendingIdentityConfirm === true;
    const isRejectedIdentity = isIdentityAlert && !isPending && alertView.resolvedBy === 'skipped';
    const isIdentified = isIdentityAlert && !isPending && alertView.resolvedBy === 'user';
    const resolvedCatLabel = alertView.resolvedCatName || (alertView.resolvedCatId ? `${alertView.resolvedCatId}` : null);
    const latestResolutionText = alertView.resolutionText || null;
    // snapshot source — prefer cropSnapshot (from identity review) then snapshotUrl
    const snapshotUri = alertView.cropSnapshot || alertView.snapshotUrl
        || (alertView.cameraId ? `${CAMERA_API_BASE}/api/latest_frame.jpg?camera_id=${encodeURIComponent(alertView.cameraId)}&t=${Date.now()}` : null);

    // Nicer timestamp format
    const formatTimeNice = (isoString) => {
        try {
            const date = new Date(isoString);
            const today = new Date();
            const isToday = date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (isToday) return `Today at ${timeStr}`;
            return `${date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} at ${timeStr}`;
        } catch {
            return "Unknown time";
        }
    };

    const animatePressIn = (anim) => {
        Animated.timing(anim, {
            toValue: 1,
            duration: 90,
            useNativeDriver: true,
        }).start();
    };

    const animatePressOut = (anim) => {
        Animated.spring(anim, {
            toValue: 0,
            useNativeDriver: true,
            stiffness: 280,
            damping: 22,
            mass: 0.72,
            overshootClamping: true,
        }).start();
    };



    return (
        <View style={styles.screenBg}>
            <StatusBar style="dark" translucent backgroundColor="transparent" />
            <LinearGradient colors={['#f5fffdff', '#f5fffdff']} style={{ flex: 1 }}>
                <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity
                            onPress={onBack}
                            onPressIn={() => animatePressIn(backBtnAnim)}
                            onPressOut={() => animatePressOut(backBtnAnim)}
                            style={styles.backButton}
                        >
                            <Animated.View
                                style={{
                                    transform: [
                                        {
                                            scale: backBtnAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [1, 0.88],
                                            }),
                                        },
                                    ],
                                }}
                            >
                                <Ionicons name="chevron-back" size={28} color="#333" />
                            </Animated.View>
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Event Detail</Text>
                        <View style={styles.headerRightSpacer} />
                    </View>

                    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

                        {/* Status Badge - inline */}
                        <View style={[styles.statusBadge, { backgroundColor: sevConfig.bg }]}>
                            <MaterialCommunityIcons name={sevConfig.icon} size={18} color={sevConfig.color} />
                            <Text style={[styles.statusText, { color: sevConfig.color }]}>{sevConfig.text}</Text>
                        </View>

                        {/* Main Info */}
                        <View style={styles.card}>
                            <Text style={styles.title}>{alertView.title}</Text>

                            <View style={styles.metaRow}>
                                <View style={styles.timeRow}>
                                    <MaterialCommunityIcons name="clock-outline" size={16} color="#757575" />
                                    <Text style={styles.metaText}>{formatTimeNice(alertView.timestamp || alertView.time)}</Text>
                                </View>
                            </View>

                            <View style={styles.divider} />

                            <Text style={styles.sectionTitle}>Summary</Text>
                            <Text style={styles.descText}>{alertView.desc}</Text>

                            {alertView.details ? (
                                <>
                                    <View style={styles.dividerLight} />
                                    <Text style={styles.sectionTitle}>Details</Text>
                                    <Text style={styles.descText}>{alertView.details}</Text>
                                </>
                            ) : null}
                        </View>

                        {/* IoT Camera Status Block - extracted component */}
                        <CameraMetaBlock
                            cameraName={alertView.cameraName || alertView.metadata?.camera}
                            cameraStatus={alertView.cameraStatus || alertView.metadata?.status}
                            lastSeen={alertView.lastSeen || alertView.metadata?.lastSeen}
                            signal={alertView.signal || alertView.metadata?.signal}
                        />

                        {/* Snapshot — cropSnapshot (identity review) or snapshotUrl */}
                        {snapshotUri && (
                            <View style={styles.card}>
                                <Text style={styles.sectionTitle}>Snapshot</Text>
                                <Image source={{ uri: snapshotUri }} style={styles.snapshotImage} resizeMode="cover" />
                            </View>
                        )}

                        {/* Identify Cat Section — only for pending_identity alerts */}
                        {isIdentityAlert && (
                            <View style={[styles.card, isIdentified && { borderColor: '#A5D6A7', borderWidth: 1.5 }, alertView.isAbnormal && { borderColor: '#FCA5A5', borderWidth: 1.5 }]}>
                                <View style={styles.identifyHeader}>
                                    <MaterialCommunityIcons
                                        name={isIdentified ? 'paw' : alertView.isAbnormal ? 'alert-circle-outline' : 'help-rhombus-outline'}
                                        size={20}
                                        color={isIdentified ? '#00695C' : alertView.isAbnormal ? '#B42318' : '#E65100'}
                                        style={{ marginRight: 8 }}
                                    />
                                    <Text style={[styles.sectionTitle, { color: isIdentified ? '#00695C' : alertView.isAbnormal ? '#B42318' : '#E65100' }]}>
                                        {isIdentified ? 'Cat Identified' : alertView.isAbnormal ? 'Abnormal Behavior' : 'Identify Cat'}
                                    </Text>
                                </View>
                                {isIdentified && resolvedCatLabel ? (
                                    <View style={[styles.selectedCatChip, { backgroundColor: '#E0F2F1', borderColor: '#A5D6A7' }]}>
                                        <MaterialCommunityIcons name="paw" size={16} color="#00695C" />
                                        <Text style={[styles.selectedCatText, { color: '#00695C' }]}>🐱 {resolvedCatLabel}</Text>
                                    </View>
                                ) : isRejectedIdentity ? (
                                    <View style={styles.selectedCatChip}>
                                        <MaterialCommunityIcons name="close-circle" size={16} color="#B42318" />
                                        <Text style={[styles.selectedCatText, { color: '#B42318' }]}>Marked as not your cat.</Text>
                                    </View>
                                ) : (
                                    <Text style={styles.descText}>
                                        The system detected this behavior but is unsure which cat it is. Please identify to improve model accuracy.
                                    </Text>
                                )}
                                {!isPending && !!latestResolutionText && (
                                    <Text style={[styles.descText, { marginTop: 8, color: '#546E7A' }]}>{latestResolutionText}</Text>
                                )}
                                {isPending && (
                                    <TouchableOpacity
                                        style={[styles.identifyButton, isIdentified && { backgroundColor: '#00897B' }]}
                                        onPress={() => pushAlert(alertView)}
                                        onPressIn={() => animatePressIn(identifyBtnAnim)}
                                        onPressOut={() => animatePressOut(identifyBtnAnim)}
                                        activeOpacity={0.8}
                                    >
                                        <Animated.View
                                            style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                transform: [{ scale: identifyBtnAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] }) }],
                                            }}
                                        >
                                            <MaterialCommunityIcons name={isIdentified ? 'pencil' : 'paw'} size={16} color="#FFF" style={{ marginRight: 6 }} />
                                            <Text style={styles.identifyButtonText}>{isIdentified ? 'Edit selection' : isRejectedIdentity ? 'Change response' : 'Identify which cat'}</Text>
                                        </Animated.View>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}

                        {/* Action Button - acknowledges alert and clears badge */}
                        <TouchableOpacity
                            style={styles.actionButton}
                            activeOpacity={0.8}
                            onPressIn={() => animatePressIn(actionBtnAnim)}
                            onPressOut={() => animatePressOut(actionBtnAnim)}
                            onPress={async () => {
                                if (alertView.id) await AlertEngine.markAllAsRead();
                                onBack();
                            }}
                        >
                            <Animated.View
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    transform: [
                                        {
                                            scale: actionBtnAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [1, 0.96],
                                            }),
                                        },
                                    ],
                                }}
                            >
                                <MaterialCommunityIcons name="check-all" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                                <Text style={styles.actionButtonText}>Acknowledge</Text>
                            </Animated.View>
                        </TouchableOpacity>

                    </ScrollView>
                </SafeAreaView>
            </LinearGradient>

            {/* CatPickerModal has been moved to GlobalAlertQueueProvider */}
        </View>
    );
}

const styles = StyleSheet.create({
    screenBg: { flex: 1, backgroundColor: '#f5fffdff' },
    container: { flex: 1, backgroundColor: '#f5fffdff' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 8,
        backgroundColor: '#f5fffdff',
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    headerRightSpacer: {
        width: 40,
        height: 40,
    },
    headerTitle: {
        fontSize: 16,
        fontFamily: 'Inter-Bold',
        color: '#2F6A62',
        textAlign: 'center',
        flex: 1,
    },
    content: { padding: 12, paddingBottom: 18 },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.06)',
    },
    statusText: {
        fontFamily: 'Inter-Bold',
        fontSize: 12,
        marginLeft: 6,
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        padding: 13,
        marginBottom: 10,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#E5E5EA',
    },
    title: {
        fontSize: 17,
        fontFamily: 'Inter-Bold',
        color: '#1C1C1E',
        marginBottom: 8,
        lineHeight: 22,
    },
    metaRow: {
        marginBottom: 16,
    },
    timeRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    metaText: {
        fontSize: 12,
        color: '#6D6D72',
        marginLeft: 6,
        fontFamily: 'Inter-Medium',
    },
    divider: {
        height: 1,
        backgroundColor: '#EEEEEE',
        marginBottom: 14,
    },
    dividerLight: {
        height: 1,
        backgroundColor: '#F2F3F5',
        marginVertical: 14,
    },
    sectionTitle: {
        fontSize: 12,
        fontFamily: 'Inter-Bold',
        color: '#00695C',
        marginBottom: 8,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    descText: {
        fontSize: 13,
        color: '#3A3A3C',
        lineHeight: 19,
        fontFamily: 'Inter-Regular',
    },
    imagePlaceholder: {
        height: 220,
        backgroundColor: '#FAFAFA',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
        borderWidth: 1,
        borderColor: '#EEEEEE',
        borderStyle: 'dashed',
    },
    imagePlaceholderText: {
        marginTop: 12,
        color: '#9E9E9E',
        fontSize: 13,
        fontFamily: 'Inter-Medium',
    },
    snapshotImage: {
        width: '100%',
        height: 220,
        borderRadius: 12,
        marginTop: 8,
    },
    actionButton: {
        backgroundColor: '#3C8FDD',
        flexDirection: 'row',
        paddingVertical: 12,
        borderRadius: 999,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
        shadowColor: '#2A69C7',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.24,
        shadowRadius: 8,
        elevation: 4,
    },
    actionButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontFamily: 'Inter-Bold',
        letterSpacing: 0.4,
    },
    // ── Identify Section ──
    identifyHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    identifyButton: {
        backgroundColor: '#E65100',
        flexDirection: 'row',
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 999,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 14,
    },
    identifyButtonText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontFamily: 'Inter-Bold',
    },
    selectedCatChip: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: '#E8F0FF',
        borderWidth: 1,
        borderColor: '#C8D8FF',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    selectedCatText: {
        marginLeft: 8,
        color: '#1A56C5',
        fontSize: 12,
        fontFamily: 'Inter-Bold',
    },
});
