import React from 'react';
import {
    View, Text, SafeAreaView, ScrollView,
    TouchableOpacity, StyleSheet,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import BottomNav from '../components/BottomNav';

// ── ค่า config ตาม slot ──────────────────────────────────────────────────────
const SLOT_CONFIG = {
    face: { icon: 'emoticon-outline', label: 'ใบหน้าและตา', color: '#5C6BC0' },
    body: { icon: 'cat', label: 'รูปร่างและขน', color: '#26A69A' },
    poop: { icon: 'leaf-circle-outline', label: 'อุจจาระ', color: '#8D6E63' },
    vomit: { icon: 'alert-circle-outline', label: 'อาการอ้วก', color: '#EF5350' },
};

const RISK_CONFIG = {
    low: { label: 'ปกติดี', bg: '#E8F5E9', text: '#388E3C', dot: '#66BB6A' },
    moderate: { label: 'ควรสังเกต', bg: '#FFF8E1', text: '#F57F17', dot: '#FFB300' },
    high: { label: 'ควรพบสัตวแพทย์', bg: '#FFEBEE', text: '#C62828', dot: '#EF5350' },
};

const STATUS_CONFIG = {
    'Good': { bg: '#E8F5E9', text: '#2E7D32', icon: 'checkmark-circle' },
    'Moderate Concern': { bg: '#FFF8E1', text: '#E65100', icon: 'alert-circle' },
    'Needs Attention': { bg: '#FFEBEE', text: '#B71C1C', icon: 'warning' },
};

// ── AnalysisResult Screen ────────────────────────────────────────────────────
export default function AnalysisResult({ onNavigate, result }) {

    // ── กรณีไม่มีผล (ยังโหลดไม่เสร็จหรือมีข้อผิดพลาด) ─────────────────────
    if (!result) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => onNavigate('PhotoCheck')} style={styles.backBtn}>
                        <Ionicons name="chevron-back" size={28} color="#2D3748" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>AI Analysis Result</Text>
                    <View style={{ width: 38 }} />
                </View>
                <View style={styles.emptyState}>
                    <MaterialCommunityIcons name="image-search-outline" size={64} color="#B0BEC5" />
                    <Text style={styles.emptyTitle}>ยังไม่มีผลการวิเคราะห์</Text>
                    <Text style={styles.emptyDesc}>
                        กรุณาอัปโหลดรูปภาพและกด Start AI Check ก่อนครับ
                    </Text>
                    <TouchableOpacity
                        style={styles.retryBtn}
                        onPress={() => onNavigate('PhotoCheck')}
                    >
                        <Text style={styles.retryBtnText}>กลับไปอัปโหลดรูป</Text>
                    </TouchableOpacity>
                </View>
                <BottomNav current="Home" onNavigate={onNavigate} />
            </SafeAreaView>
        );
    }

    const { overallStatus, overallDesc, items = [], recommendations = [] } = result;
    const statusCfg = STATUS_CONFIG[overallStatus] || STATUS_CONFIG['Moderate Concern'];

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => onNavigate('PhotoCheck')} style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={28} color="#2D3748" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>AI Analysis Result</Text>
                <View style={{ width: 38 }} />
            </View>

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Overall Status Card */}
                <View style={[styles.overallCard, { backgroundColor: statusCfg.bg }]}>
                    <Ionicons name={statusCfg.icon} size={36} color={statusCfg.text} />
                    <Text style={[styles.overallStatus, { color: statusCfg.text }]}>
                        {overallStatus}
                    </Text>
                    <Text style={[styles.overallDesc, { color: statusCfg.text }]}>
                        {overallDesc}
                    </Text>
                </View>

                {/* Per-slot cards */}
                <Text style={styles.sectionTitle}>ผลวิเคราะห์แต่ละรูป</Text>
                {items.map((item, idx) => {
                    const slotCfg = SLOT_CONFIG[item.slot] || SLOT_CONFIG.face;
                    const riskCfg = RISK_CONFIG[item.risk] || RISK_CONFIG.low;
                    return (
                        <View key={idx} style={styles.itemCard}>
                            <View style={styles.itemHeader}>
                                <View style={[styles.iconCircle, { backgroundColor: `${slotCfg.color}20` }]}>
                                    <MaterialCommunityIcons
                                        name={slotCfg.icon}
                                        size={22}
                                        color={slotCfg.color}
                                    />
                                </View>
                                <Text style={[styles.itemLabel, { color: slotCfg.color }]}>
                                    {item.label || slotCfg.label}
                                </Text>
                                <View style={[styles.riskBadge, { backgroundColor: riskCfg.bg }]}>
                                    <View style={[styles.riskDot, { backgroundColor: riskCfg.dot }]} />
                                    <Text style={[styles.riskText, { color: riskCfg.text }]}>
                                        {riskCfg.label}
                                    </Text>
                                </View>
                            </View>
                            <Text style={styles.itemFinding}>{item.finding}</Text>
                        </View>
                    );
                })}

                {/* Recommendations */}
                {recommendations.length > 0 && (
                    <>
                        <Text style={styles.sectionTitle}>💡 คำแนะนำ</Text>
                        <View style={styles.recoCard}>
                            {recommendations.map((rec, idx) => (
                                <View key={idx} style={styles.recoRow}>
                                    <View style={styles.recoBullet} />
                                    <Text style={styles.recoText}>{rec}</Text>
                                </View>
                            ))}
                        </View>
                    </>
                )}

                {/* Back Button */}
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => onNavigate('PhotoCheck')}
                >
                    <Text style={styles.backButtonText}>ตรวจสอบอีกครั้ง</Text>
                </TouchableOpacity>

                <View style={{ height: 80 }} />
            </ScrollView>

            <BottomNav current="Home" onNavigate={onNavigate} />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFB' },
    header: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 14,
        backgroundColor: '#FFF',
        borderBottomWidth: 1, borderBottomColor: '#EEF2F5',
    },
    backBtn: { width: 38, alignItems: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '700', color: '#1A202C' },

    scrollContent: { padding: 16, paddingBottom: 20 },

    // Overall card
    overallCard: {
        borderRadius: 16, padding: 20, alignItems: 'center',
        marginBottom: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    },
    overallStatus: { fontSize: 20, fontWeight: '800', marginTop: 10, textAlign: 'center' },
    overallDesc: { fontSize: 13, marginTop: 8, lineHeight: 20, textAlign: 'center', opacity: 0.85 },

    sectionTitle: {
        fontSize: 14, fontWeight: '700', color: '#4A5568',
        marginBottom: 10, paddingLeft: 2,
    },

    // Per-slot card
    itemCard: {
        backgroundColor: '#FFF', borderRadius: 14, padding: 14,
        marginBottom: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
    },
    itemHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    iconCircle: {
        width: 36, height: 36, borderRadius: 18,
        justifyContent: 'center', alignItems: 'center',
        marginRight: 10,
    },
    itemLabel: { flex: 1, fontSize: 14, fontWeight: '700' },
    riskBadge: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    },
    riskDot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
    riskText: { fontSize: 11, fontWeight: '700' },
    itemFinding: { fontSize: 13, color: '#4A5568', lineHeight: 19 },

    // Recommendations
    recoCard: {
        backgroundColor: '#FFF', borderRadius: 14, padding: 14,
        marginBottom: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
    },
    recoRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
    recoBullet: {
        width: 7, height: 7, borderRadius: 4,
        backgroundColor: '#00897B', marginTop: 6, marginRight: 10,
    },
    recoText: { flex: 1, fontSize: 13, color: '#374151', lineHeight: 20 },

    // Back button
    backButton: {
        backgroundColor: '#00897B', borderRadius: 30,
        paddingVertical: 16, alignItems: 'center', marginBottom: 10,
    },
    backButtonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },

    // Empty state
    emptyState: {
        flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32,
    },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#2D3748', marginTop: 16 },
    emptyDesc: { fontSize: 13, color: '#718096', textAlign: 'center', marginTop: 8, lineHeight: 20 },
    retryBtn: {
        marginTop: 24, backgroundColor: '#00897B', borderRadius: 30,
        paddingVertical: 14, paddingHorizontal: 32,
    },
    retryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
