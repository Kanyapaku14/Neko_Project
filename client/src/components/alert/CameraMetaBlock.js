import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

/**
 * CameraMetaBlock - Displays IoT camera device-specific metadata.
 * Designed for camera event types. Shows status, last seen, and signal.
 * 
 * Props:
 * - cameraName: string
 * - cameraStatus: string (e.g., "Disconnected", "Online")
 * - lastSeen: ISO string
 * - signal: string (e.g., "Weak", "Strong", "No Signal")
 */
export default function CameraMetaBlock({ cameraName, cameraStatus, lastSeen, signal }) {
    // Only render if at least cameraName is present
    if (!cameraName && !cameraStatus) return null;

    const formatLastSeen = (isoString) => {
        if (!isoString) return 'Unknown';
        try {
            const date = new Date(isoString);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', ' + date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        } catch {
            return isoString;
        }
    };

    const getSignalConfig = (sig) => {
        const s = (sig || '').toLowerCase();
        if (s === 'strong') return { icon: 'wifi', color: '#1B5E20' };
        if (s === 'weak') return { icon: 'wifi-strength-2', color: '#E65100' };
        return { icon: 'wifi-off', color: '#B71C1C' };
    };

    const statusColor = cameraStatus && cameraStatus.toLowerCase().includes('connect') ? '#B71C1C' : '#1B5E20';
    const sigConfig = getSignalConfig(signal);

    return (
        <View style={styles.card}>
            <Text style={styles.sectionTitle}>Camera Device</Text>

            {cameraName && (
                <View style={styles.row}>
                    <MaterialCommunityIcons name="cctv" size={18} color="#00695C" />
                    <Text style={styles.label}>Camera</Text>
                    <Text style={styles.value} numberOfLines={1}>{cameraName}</Text>
                </View>
            )}

            {cameraStatus && (
                <View style={styles.row}>
                    <MaterialCommunityIcons name="circle" size={14} color={statusColor} />
                    <Text style={styles.label}>Status</Text>
                    <Text style={[styles.value, { color: statusColor, fontWeight: 'bold' }]} numberOfLines={1}>{cameraStatus}</Text>
                </View>
            )}

            {lastSeen && (
                <View style={styles.row}>
                    <MaterialCommunityIcons name="clock-outline" size={18} color="#757575" />
                    <Text style={styles.label}>Last Seen</Text>
                    <Text style={styles.value}>{formatLastSeen(lastSeen)}</Text>
                </View>
            )}

            {signal && (
                <View style={styles.row}>
                    <MaterialCommunityIcons name={sigConfig.icon} size={18} color={sigConfig.color} />
                    <Text style={styles.label}>Signal</Text>
                    <Text style={[styles.value, { color: sigConfig.color }]}>{signal}</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
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
    sectionTitle: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#00695C',
        marginBottom: 14,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    label: {
        fontSize: 14,
        color: '#757575',
        marginLeft: 10,
        width: 90,
    },
    value: {
        fontSize: 14,
        color: '#263238',
        fontWeight: '600',
        flex: 1,
    },
});
