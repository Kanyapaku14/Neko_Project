/**
 * PendingIdentityBanner.js
 *
 * Compact banner shown on CameraScreen when there are pending behavior identity
 * confirmations waiting for the user.
 *
 * Props:
 *   count       {number}    - Number of pending identity confirmations
 *   onPress     {Function}  - Called when user taps the banner to open alerts
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';

export default function PendingIdentityBanner({ count, onPress }) {
    if (!count || count <= 0) return null;

    const label = count === 1
        ? '1 behavior needs cat identification'
        : `${count} behaviors need confirmation`;

    return (
        <TouchableOpacity
            style={styles.banner}
            activeOpacity={0.8}
            onPress={onPress}
            accessibilityLabel={`${label} - tap to open notifications`}
            accessibilityRole="button"
        >
            <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="help-rhombus-outline" size={20} color="#FFFFFF" />
            </View>
            <View style={styles.textContainer}>
                <Text style={styles.title} numberOfLines={1}>{label}</Text>
                <Text style={styles.subtitle}>Tap to identify the cat</Text>
            </View>

            <View style={styles.countBadge}>
                <Text style={styles.countText}>{count > 9 ? '9+' : count}</Text>
            </View>

            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    banner: {
        backgroundColor: '#E65100',
        borderRadius: 12,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        shadowColor: '#E65100',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 4,
    },
    iconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    textContainer: {
        flex: 1,
    },
    title: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 13,
        lineHeight: 18,
    },
    subtitle: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 11,
        marginTop: 1,
    },
    countBadge: {
        backgroundColor: 'rgba(255,255,255,0.25)',
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        paddingHorizontal: 5,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 6,
    },
    countText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '800',
    },
});
