import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, SafeAreaView, ScrollView,
    TouchableOpacity, StyleSheet, Animated, Dimensions, Image
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import BottomNav from '../components/BottomNav';
import supabase from './config/supabaseClient';

const { width: windowWidth } = Dimensions.get('window');

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
export default function AnalysisResult({ onNavigate, result, recordId }) {
    const [images, setImages] = useState([]);
    const [showImages, setShowImages] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const fadeAnim = useRef(new Animated.Value(1)).current; // 1 = text, 0 = images

    // Fetch images when recordId is known
    useEffect(() => {
        if (!recordId) return;
        const fetchImages = async () => {
            const { data, error } = await supabase
                .from('ai_photo_checks')
                .select('image_face_url, image_body_url, image_poop_url, image_vomit_url')
                .eq('id', recordId)
                .single();
            if (data && !error) {
                // Get ordered list, filter out nulls
                const imgList = [
                    { key: 'face', url: data.image_face_url },
                    { key: 'body', url: data.image_body_url },
                    { key: 'poop', url: data.image_poop_url },
                    { key: 'vomit', url: data.image_vomit_url },
                ].filter(item => item.url);
                setImages(imgList);
            }
        };
        fetchImages();
    }, [recordId]);

    const toggleImages = () => {
        if (images.length === 0) return; // Don't flip if no images
        Animated.timing(fadeAnim, {
            toValue: showImages ? 1 : 0,
            duration: 300,
            useNativeDriver: true,
        }).start(() => {
            setShowImages(!showImages);
        });
    };

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
                {/* Overall Status Card / Image Carousel */}
                <TouchableOpacity
                    activeOpacity={0.9}
                    disabled={showImages}
                    onPress={() => {
                        if (showImages) return; // ไม่ให้สลับกลับถ้าแสดงรูปอยู่แล้ว
                        if (images.length === 0) return;
                        setShowImages(true);
                        Animated.timing(fadeAnim, {
                            toValue: 0,
                            duration: 400, // Smooth transition
                            useNativeDriver: false, // Must be false for layout/color changes if added later
                        }).start();
                    }}
                >
                    <View style={[styles.overallCard, {
                        backgroundColor: showImages ? '#000' : statusCfg.bg,
                        minHeight: 240,
                        justifyContent: 'center',
                        padding: 0, // removed padding here so images reach edges
                        overflow: 'hidden'
                    }]}>
                        {/* Text Container */}
                        <Animated.View style={{
                            opacity: fadeAnim,
                            width: '100%',
                            height: '100%',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'absolute', // sit behind/infront of images
                            padding: 20,
                            zIndex: showImages ? 0 : 1
                        }}>
                            <Ionicons name={statusCfg.icon} size={36} color={statusCfg.text} />
                            <Text style={[styles.overallStatus, { color: statusCfg.text }]}>
                                {overallStatus}
                            </Text>
                            <Text style={[styles.overallDesc, { color: statusCfg.text }]}>
                                {overallDesc}
                            </Text>
                        </Animated.View>

                        {/* Images Container */}
                        {images.length > 0 && (
                            <Animated.View style={{
                                opacity: fadeAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [1, 0]
                                }),
                                width: '100%',
                                height: 240,
                                zIndex: showImages ? 1 : 0
                            }}>
                                <ScrollView
                                    horizontal
                                    pagingEnabled
                                    showsHorizontalScrollIndicator={false}
                                    scrollEventThrottle={16}
                                    onScroll={(event) => {
                                        const slideSize = event.nativeEvent.layoutMeasurement.width;
                                        const index = event.nativeEvent.contentOffset.x / slideSize;
                                        const roundIndex = Math.round(index);
                                        if (roundIndex !== currentIndex && roundIndex >= 0 && roundIndex < images.length) {
                                            setCurrentIndex(roundIndex);
                                        }
                                    }}
                                >
                                    {images.map((img, i) => (
                                        <View key={img.key} style={{ width: windowWidth - 32, height: 240, alignItems: 'center', justifyContent: 'center' }}>
                                            <Image
                                                source={{ uri: img.url }}
                                                style={{ width: '100%', height: '100%' }}
                                                resizeMode="cover"
                                            />
                                        </View>
                                    ))}
                                </ScrollView>

                                {/* Pagination Dots */}
                                {images.length > 1 && (
                                    <View style={{ flexDirection: 'row', justifyContent: 'center', position: 'absolute', bottom: 12, width: '100%' }}>
                                        {images.map((_, i) => (
                                            <View
                                                key={i}
                                                style={{
                                                    width: 8, height: 8, borderRadius: 4,
                                                    backgroundColor: i === currentIndex ? '#FFF' : 'rgba(255,255,255,0.4)',
                                                    marginHorizontal: 4
                                                }}
                                            />
                                        ))}
                                    </View>
                                )}
                            </Animated.View>
                        )}
                    </View>
                </TouchableOpacity>

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
