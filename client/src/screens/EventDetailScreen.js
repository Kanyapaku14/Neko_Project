import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, Image } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AlertEngine from '../services/AlertEngine';
import CameraMetaBlock from '../components/alert/CameraMetaBlock';
import { GlobalAlertQueueContext } from '../services/GlobalAlertQueue';

export default function EventDetailScreen({ onBack, route, alertData }) {
    // Navigate via route.params or direct prop
    const data = (route && route.params && route.params.alertData) || alertData;
    const { pushAlert } = useContext(GlobalAlertQueueContext);

    // Track local pending state so UI updates without re-navigation
    const [isPending, setIsPending] = useState(data?.pendingIdentityConfirm === true);

    // Re-evaluate pending status if alert gets resolved while this screen is open
    useEffect(() => {
        const handler = () => {
            const upToDateAlert = AlertEngine.getHistory().find(a => a.id === data?.id);
            if (upToDateAlert) {
                setIsPending(upToDateAlert.pendingIdentityConfirm === true);
            }
        };
        AlertEngine.on('ALERT_ENGINE_UPDATED', handler);
        return () => AlertEngine.off('ALERT_ENGINE_UPDATED', handler);
    }, [data?.id]);

    if (!data) {
        return (
            <LinearGradient colors={['#F4F9F9', '#E0F2F1']} style={{ flex: 1 }}>
                <SafeAreaView style={styles.container}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onBack} style={styles.backButton}>
                            <Ionicons name="chevron-back" size={28} color="#00695C" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Event Detail</Text>
                        <View style={styles.backButton} />
                    </View>
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <MaterialCommunityIcons name="alert-circle-outline" size={64} color="#BDBDBD" />
                        <Text style={{ marginTop: 16, color: '#757575', fontSize: 16 }}>No event data found.</Text>
                    </View>
                </SafeAreaView>
            </LinearGradient>
        );
    }

    // 3 Severity Levels Config
    const getSeverityConfig = (sev) => {
        switch (sev) {
            case 'critical':
                return { color: '#B71C1C', bg: '#FFCDD2', icon: 'alert-circle', text: 'Critical Alert' };
            case 'warning':
                return { color: '#E65100', bg: '#FFE0B2', icon: 'alert', text: 'Warning' };
            case 'success':
            case 'info':
            default:
                return { color: '#1B5E20', bg: '#C8E6C9', icon: 'check-circle', text: 'System Info' };
        }
    };
    const normalizedSeverity = (data.severity || '').toLowerCase();
    const sevConfig = getSeverityConfig(normalizedSeverity);

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

    return (
        <LinearGradient colors={['#F4F9F9', '#E0F2F1']} style={{ flex: 1 }}>
            <SafeAreaView style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onBack} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={28} color="#00695C" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Event Detail</Text>
                    <View style={styles.backButton} />
                </View>

                <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

                    {/* Status Badge - inline */}
                    <View style={[styles.statusBadge, { backgroundColor: sevConfig.bg }]}>
                        <MaterialCommunityIcons name={sevConfig.icon} size={18} color={sevConfig.color} />
                        <Text style={[styles.statusText, { color: sevConfig.color }]}>{sevConfig.text}</Text>
                    </View>

                    {/* Main Info */}
                    <View style={styles.card}>
                        <Text style={styles.title}>{data.title}</Text>

                        <View style={styles.metaRow}>
                            <View style={styles.timeRow}>
                                <MaterialCommunityIcons name="clock-outline" size={16} color="#757575" />
                                <Text style={styles.metaText}>{formatTimeNice(data.timestamp || data.time)}</Text>
                            </View>
                        </View>

                        <View style={styles.divider} />

                        <Text style={styles.sectionTitle}>Summary</Text>
                        <Text style={styles.descText}>{data.desc}</Text>

                        {data.details ? (
                            <>
                                <View style={styles.dividerLight} />
                                <Text style={styles.sectionTitle}>Details</Text>
                                <Text style={styles.descText}>{data.details}</Text>
                            </>
                        ) : null}
                    </View>

                    {/* IoT Camera Status Block - extracted component */}
                    <CameraMetaBlock
                        cameraName={data.cameraName || data.metadata?.camera}
                        cameraStatus={data.cameraStatus || data.metadata?.status}
                        lastSeen={data.lastSeen || data.metadata?.lastSeen}
                        signal={data.signal || data.metadata?.signal}
                    />

                    {/* Snapshot - inline, only renders if snapshotUrl exists */}
                    {data.snapshotUrl && (
                        <View style={styles.card}>
                            <Text style={styles.sectionTitle}>Snapshot</Text>
                            <Image source={{ uri: data.snapshotUrl }} style={styles.snapshotImage} resizeMode="cover" />
                        </View>
                    )}

                    {/* Identify Cat Section — only for pending_identity alerts */}
                    {isPending && (
                        <View style={styles.card}>
                            <View style={styles.identifyHeader}>
                                <MaterialCommunityIcons name="help-rhombus-outline" size={20} color="#E65100" style={{ marginRight: 8 }} />
                                <Text style={[styles.sectionTitle, { color: '#E65100' }]}>ระบุตัวตนแมว</Text>
                            </View>
                            <Text style={styles.descText}>
                                ระบบตรวจพบพฤติกรรมนี้แต่ไม่แน่ใจว่าเป็นแมวตัวไหน กรุณาช่วยระบุเพื่อความแม่นยำของโมเดล
                            </Text>
                            <TouchableOpacity
                                style={styles.identifyButton}
                                onPress={() => pushAlert(data)}
                                activeOpacity={0.8}
                            >
                                <MaterialCommunityIcons name="paw" size={16} color="#FFF" style={{ marginRight: 6 }} />
                                <Text style={styles.identifyButtonText}>ระบุว่าเป็นแมวตัวไหน</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Action Button - acknowledges alert and clears badge */}
                    <TouchableOpacity
                        style={styles.actionButton}
                        activeOpacity={0.8}
                        onPress={async () => {
                            if (data.id) await AlertEngine.markAllAsRead();
                            onBack();
                        }}
                    >
                        <MaterialCommunityIcons name="check-all" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                        <Text style={styles.actionButtonText}>Acknowledge</Text>
                    </TouchableOpacity>

                </ScrollView>
            </SafeAreaView>

            {/* CatPickerModal has been moved to GlobalAlertQueueProvider */}
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
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
    content: { padding: 16 },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    statusText: {
        fontWeight: 'bold',
        fontSize: 14,
        marginLeft: 6,
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        shadowColor: '#00695C',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 3,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.8)',
    },
    title: {
        fontSize: 24,
        fontWeight: '800',
        color: '#263238',
        marginBottom: 12,
        lineHeight: 32,
    },
    metaRow: {
        marginBottom: 16,
    },
    timeRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    metaText: {
        fontSize: 14,
        color: '#757575',
        marginLeft: 6,
        fontWeight: '500',
    },
    divider: {
        height: 1,
        backgroundColor: '#EEEEEE',
        marginBottom: 16,
    },
    dividerLight: {
        height: 1,
        backgroundColor: '#F5F5F5',
        marginVertical: 16,
        borderStyle: 'dashed',
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#00695C',
        marginBottom: 8,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    descText: {
        fontSize: 15,
        color: '#424242',
        lineHeight: 24,
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
        fontWeight: '500',
    },
    snapshotImage: {
        width: '100%',
        height: 220,
        borderRadius: 12,
        marginTop: 8,
    },
    actionButton: {
        backgroundColor: '#00695C',
        flexDirection: 'row',
        paddingVertical: 14,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
        shadowColor: '#00695C',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    actionButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
        letterSpacing: 0.5,
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
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 14,
    },
    identifyButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: 'bold',
    },
});
