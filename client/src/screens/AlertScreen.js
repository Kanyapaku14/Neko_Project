import React, { useEffect, useState, useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, Animated } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AlertEngine from '../services/AlertEngine';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GlobalAlertQueueContext } from '../services/GlobalAlertQueue';

export default function AlertScreen({ onBack, onNavigate }) {
    const [alerts, setAlerts] = useState([]);
    const fadeAnim = React.useRef(new Animated.Value(0)).current;

    // Connect to global queue
    const { pushAlert } = useContext(GlobalAlertQueueContext);

    // No longer need to load cats locally for the picker

    useEffect(() => {
        setAlerts(AlertEngine.getHistory());
        AlertEngine.markAllAsRead();

        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
        }).start();

        // Re-render when AlertEngine updates (e.g. identity resolved)
        const handler = () => setAlerts([...AlertEngine.getHistory()]);
        AlertEngine.on('ALERT_ENGINE_UPDATED', handler);
        return () => AlertEngine.off('ALERT_ENGINE_UPDATED', handler);
    }, []);

    // Format ISO string to readable time
    const formatTime = (isoString) => {
        if (!isoString) return "Just now";
        try {
            const date = new Date(isoString);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' - ' + date.toLocaleDateString();
        } catch {
            return "Just now";
        }
    };
    return (
        <LinearGradient colors={['#F4F9F9', '#E0F2F1']} style={{ flex: 1 }}>
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={onBack} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={28} color="#00695C" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Notifications</Text>
                    <View style={styles.backButton} />
                </View>

                <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                    {alerts.length === 0 ? (
                        <View style={styles.emptyState}>
                            <MaterialCommunityIcons name="bell-sleep-outline" size={64} color="#B2DFDB" />
                            <Text style={styles.emptyTitle}>All caught up!</Text>
                            <Text style={styles.emptyDesc}>You have no new notifications.</Text>
                        </View>
                    ) : (
                        alerts.map((alert) => {
                            const isPending = alert.pendingIdentityConfirm === true;
                            const isCritical = alert.severity === 'critical';

                            // ── Pending Identity Card ──────────────────────────────
                            if (isPending) {
                                return (
                                    <Animated.View key={alert.id} style={{ opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                                        <View style={styles.pendingCard}>
                                            <View style={styles.pendingIconContainer}>
                                                <MaterialCommunityIcons name="help-rhombus-outline" size={26} color="#E65100" />
                                            </View>
                                            <View style={styles.alertTextContainer}>
                                                <View style={styles.titleRow}>
                                                    <Text style={styles.pendingTitle}>{alert.title}</Text>
                                                    <View style={styles.pendingBadge}>
                                                        <Text style={styles.pendingBadgeText}>รอยืนยัน</Text>
                                                    </View>
                                                </View>
                                                <Text style={styles.alertDesc} numberOfLines={2}>{alert.desc}</Text>
                                                <Text style={styles.timeText}>{formatTime(alert.timestamp)}</Text>
                                                <TouchableOpacity
                                                    style={styles.identifyButton}
                                                    onPress={() => pushAlert(alert)}
                                                    activeOpacity={0.8}
                                                >
                                                    <MaterialCommunityIcons name="paw" size={14} color="#FFF" />
                                                    <Text style={styles.identifyButtonText}>ระบุแมว →</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    </Animated.View>
                                );
                            }

                            // ── Regular Alert Card ─────────────────────────────────
                            return (
                                <Animated.View key={alert.id} style={{ opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                                    <TouchableOpacity
                                        style={[
                                            styles.alertCard,
                                            !alert.isRead && styles.unreadCard
                                        ]}
                                        activeOpacity={0.8}
                                        onPress={() => onNavigate('EventDetail', { alertData: alert })}
                                    >
                                        <View style={[
                                            styles.iconContainer,
                                            isCritical ? styles.iconCriticalBg : styles.iconSuccessBg
                                        ]}>
                                            <MaterialCommunityIcons
                                                name={isCritical ? "alert-circle-outline" : "check-circle-outline"}
                                                size={28}
                                                color={isCritical ? "#D32F2F" : "#2E7D32"}
                                            />
                                        </View>
                                        <View style={styles.alertTextContainer}>
                                            <View style={styles.titleRow}>
                                                <Text style={[styles.alertTitle, !alert.isRead && styles.unreadText]}>{alert.title}</Text>
                                                {!alert.isRead && <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>}
                                            </View>
                                            <Text style={styles.alertDesc} numberOfLines={2}>{alert.desc}</Text>
                                            <Text style={styles.timeText}>{formatTime(alert.timestamp)}</Text>
                                        </View>
                                    </TouchableOpacity>
                                </Animated.View>
                            );
                        })
                    )}
                </ScrollView>
            </SafeAreaView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 20,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#00695C',
        textAlign: 'center',
        flex: 1,
    },
    content: {
        paddingHorizontal: 16,
        paddingBottom: 40,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 100,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#00695C',
        marginTop: 16,
    },
    emptyDesc: {
        fontSize: 14,
        color: '#666',
        marginTop: 8,
    },
    alertCard: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        alignItems: 'flex-start',
        shadowColor: '#00695C',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 3,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.5)',
    },
    unreadCard: {
        backgroundColor: '#F0FDF4', // Subtle green tint for unread
        borderColor: '#A7F3D0',
    },
    iconContainer: {
        width: 50,
        height: 50,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    iconCriticalBg: {
        backgroundColor: '#FFEBEE',
    },
    iconSuccessBg: {
        backgroundColor: '#E8F5E9',
    },
    alertTextContainer: {
        flex: 1,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    alertTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        flex: 1,
    },
    unreadText: {
        fontWeight: '800',
        color: '#004D40',
    },
    newBadge: {
        backgroundColor: '#D32F2F',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        marginLeft: 8,
    },
    newBadgeText: {
        color: '#FFF',
        fontSize: 10,
        fontWeight: 'bold',
    },
    // ── Pending Identity Card styles ───────────────────────────────────────────
    pendingCard: {
        flexDirection: 'row',
        backgroundColor: '#FFF8E1',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        alignItems: 'flex-start',
        shadowColor: '#E65100',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.10,
        shadowRadius: 10,
        elevation: 3,
        borderWidth: 1.5,
        borderColor: '#FFCC80',
    },
    pendingIconContainer: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#FFF3E0',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    pendingTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#BF360C',
        flex: 1,
    },
    pendingBadge: {
        backgroundColor: '#E65100',
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 4,
        marginLeft: 8,
    },
    pendingBadgeText: {
        color: '#FFF',
        fontSize: 10,
        fontWeight: 'bold',
    },
    identifyButton: {
        marginTop: 10,
        alignSelf: 'flex-start',
        backgroundColor: '#E65100',
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    identifyButtonText: {
        color: '#FFF',
        fontSize: 13,
        fontWeight: '700',
    },
    // ─────────────────────────────────────────────────────────────────────────
    alertDesc: {
        fontSize: 14,
        color: '#666',
        lineHeight: 20,
        marginBottom: 8,
    },
    timeText: {
        fontSize: 12,
        color: '#9E9E9E',
        fontWeight: '500',
    },
});
