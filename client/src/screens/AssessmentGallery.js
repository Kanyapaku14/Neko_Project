import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Animated, Easing, useWindowDimensions, DeviceEventEmitter, Image } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import supabase from './config/supabaseClient';
import HomeHeader from '../components/HomeHeader';

const GRID_GAP = 12;
const GRID_PADDING = 16;

// Helper: Get color based on overall risk score
const getRiskColor = (score) => {
    if (score === null || score === undefined || score === 'No Data') return '#64748B';
    if (score >= 80) return '#059669'; // Green
    if (score >= 60) return '#2563EB'; // Blue
    if (score >= 40) return '#EA580C'; // Orange
    return '#E11D48'; // Red/Rose darker
};

const getRiskLabel = (score) => {
    if (score === null || score === undefined || score === 'No Data') return 'No Data';
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Attention';
};

export default function AssessmentGallery({ onBack, session, onNavigate }) {
    const { width: screenWidth } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const [assessments, setAssessments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedCatId, setSelectedCatId] = useState(null);
    const [selectedCatName, setSelectedCatName] = useState(null);

    const pageAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const loadSelectedCat = async () => {
            try {
                const scopedSelectedCatIdKey = session?.user?.id ? `selectedCatId:${session.user.id}` : 'selectedCatId';
                const selectedCatIdFromHeader =
                    (await AsyncStorage.getItem(scopedSelectedCatIdKey)) ||
                    (await AsyncStorage.getItem('selectedCatId')) ||
                    (await AsyncStorage.getItem('last_selected_cat_id'));

                setSelectedCatId(selectedCatIdFromHeader);
                if (selectedCatIdFromHeader && session?.user?.id) {
                    const { data: catRow } = await supabase
                        .from('cats').select('name').eq('id', selectedCatIdFromHeader).maybeSingle();
                    setSelectedCatName(catRow?.name || null);
                }
            } catch (e) { /* ignore */ }
        };
        loadSelectedCat();

        const catChangedSub = DeviceEventEmitter.addListener('catChanged', (cat) => {
            const nextId = cat?.id ? String(cat.id) : null;
            setSelectedCatId(nextId);
            setSelectedCatName(cat?.name || null);
        });

        return () => {
            catChangedSub.remove();
        };
    }, [session?.user?.id]);

    useEffect(() => {
        if (selectedCatId !== null) {
            loadAssessments();
        } else {
            setLoading(false);
        }
    }, [selectedCatId]);

    useEffect(() => {
        Animated.timing(pageAnim, {
            toValue: 1,
            duration: 400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [pageAnim]);


    const loadAssessments = async () => {
        setLoading(true);
        try {
            if (!session?.user?.id || !selectedCatId) {
                setAssessments([]);
                return;
            }

            // Fetch assessments from DB
            const { data, error } = await supabase
                .from('assessments')
                .select('*')
                .eq('cat_id', selectedCatId)
                .order('assessment_date', { ascending: false });

            if (error) throw error;

            // Format data
            if (data && Array.isArray(data)) {
                const formatted = data.map(item => ({
                    id: item.id,
                    date: item.assessment_date || item.created_at,
                    score: item.overall_risk_score,
                    level: item.overall_risk_level,
                    raw: item
                }));
                setAssessments(formatted);
            } else {
                setAssessments([]);
            }
        } catch (error) {
            console.error("Error loading assessment history:", error);
            setAssessments([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectAssessment = (item) => {
        if (onNavigate) {
            onNavigate('Result', { source: 'db', catId: selectedCatId, assessmentId: item.id });
        }
    };


    const renderItem = ({ item, index }) => {
        const start = Math.min(index * 0.05, 0.65);
        const itemOpacity = pageAnim.interpolate({
            inputRange: [start, start + 0.25, 1],
            outputRange: [0, 1, 1],
            extrapolate: 'clamp',
        });
        const itemTranslateY = pageAnim.interpolate({
            inputRange: [start, start + 0.25, 1],
            outputRange: [12, 0, 0],
            extrapolate: 'clamp',
        });

        const scoreColor = getRiskColor(item.score);
        const scoreLabel = getRiskLabel(item.score);
        const displayScore = (item.score === null || item.score === undefined || item.score === 'No Data') ? '--' : Math.round(item.score);

        const dateObj = new Date(item.date);
        const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        return (
            <Animated.View style={{ opacity: itemOpacity, transform: [{ translateY: itemTranslateY }] }}>
                <TouchableOpacity
                    style={styles.cardContainerWrapper}
                    onPress={() => handleSelectAssessment(item)}
                    activeOpacity={0.8}
                >
                    {/* Cat Icon with transparent background */}
                    <View style={styles.cardCatContainer}>
                        <View style={styles.catImageWrapper}>
                            <Image source={require('../../assets/cat.png')} style={styles.catImage} resizeMode="contain" />
                            <Text style={styles.cardScoreTextOverlay}>{displayScore}</Text>
                        </View>
                    </View>

                    {/* Inner white info pill */}
                    <View style={styles.cardBodyContainer}>
                        <View style={styles.cardBody}>
                            <Text style={styles.cardStatusText} numberOfLines={1}>{scoreLabel}</Text>
                            <View style={styles.dateRow}>
                                <Ionicons name="calendar-outline" size={12} color="#64748B" />
                                <Text style={styles.cardDateText}>{dateStr}</Text>
                                <Text style={styles.cardTimeText}>• {timeStr}</Text>
                            </View>
                        </View>

                        <View style={styles.viewBadge}>
                            <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                        </View>
                    </View>
                </TouchableOpacity>
            </Animated.View>
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: '#f5fffdff' }}>
            <StatusBar style="dark" translucent backgroundColor="transparent" />
            <LinearGradient colors={['#f5fffdff', '#f5fffdff']} style={{ flex: 1 }}>
                <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
                    {/* Header */}
                    <HomeHeader
                        onNotify={() => onNavigate && onNavigate('Alert')}
                        leftComponent={
                            <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.85}>
                                <Ionicons name="chevron-back" size={28} color="#333" />
                            </TouchableOpacity>
                        }
                        rightComponent={
                            <View style={styles.headerRight}>
                                <TouchableOpacity style={styles.headerPill} activeOpacity={0.7}>
                                    <MaterialCommunityIcons name="cat" size={14} color="#0C5A58" />
                                    <Text style={styles.headerPillText} numberOfLines={1}>
                                        {selectedCatName || 'Select Cat'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        }
                    />

                    <View style={styles.titleWrap}>
                        <View style={styles.titleRow}>
                            <MaterialCommunityIcons name="clipboard-text-outline" size={24} color="#00695C" />
                            <Text style={styles.pageTitle}>Assessment History</Text>
                        </View>
                        <Text style={styles.pageSubTitle}>Tap an assessment to view detailed results</Text>
                    </View>


                    {/* Grid */}
                    {loading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#00695C" />
                        </View>
                    ) : (
                        <Animated.View
                            style={{
                                flex: 1,
                                opacity: pageAnim,
                                transform: [
                                    {
                                        translateY: pageAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [10, 0],
                                        }),
                                    },
                                ],
                            }}
                        >
                            <FlatList
                                data={assessments}
                                renderItem={renderItem}
                                keyExtractor={item => String(item.id)}
                                contentContainerStyle={styles.listContent}
                                ListEmptyComponent={
                                    <View style={styles.emptyState}>
                                        <Ionicons name="document-text-outline" size={64} color="#B0BEC5" />
                                        <Text style={styles.emptyText}>No assessments found</Text>
                                        <Text style={styles.emptySubText}>
                                            Save an assessment from the Result screen to see it here.
                                        </Text>
                                    </View>
                                }
                            />
                        </Animated.View>
                    )}
                </SafeAreaView>
            </LinearGradient>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5fffdff',
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F0F7F6',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginRight: 10,
    },
    headerPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#E6EFEB',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 6,
    },
    headerPillText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#0C5A58',
        maxWidth: 100,
    },
    titleWrap: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#EEF5F3',
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 4,
    },
    pageTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#1F3B37',
    },
    pageSubTitle: {
        fontSize: 13,
        color: '#78909C',
        fontWeight: '500',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        padding: 16,
        paddingBottom: 40,
        gap: 16,
    },
    cardContainerWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'transparent', // Changed from #ffffffff to transparent (opacity 0)
        paddingVertical: 10,
        marginBottom: 16, // Space between cards
    },
    // Removed cardShadowBox
    cardCatContainer: {
        width: 72,
        height: 72,
        marginRight: 10, // Gap between cat icon and info card
        zIndex: 2,
    },
    catImageWrapper: {
        width: 72,
        height: 72,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    catImage: {
        width: 70,
        height: 70,
        position: 'absolute',
        top: -2, // Adjusted so cat sits properly
    },
    cardScoreTextOverlay: {
        fontSize: 18,
        fontWeight: '900',
        color: '#FFFFFF',
        position: 'absolute',
        bottom: 8,
        letterSpacing: 0.5,
        textShadowColor: 'rgba(0,0,0,0.4)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    cardBodyContainer: {
        flex: 1,
        backgroundColor: '#FFFFFF', // Pure white inner pill
        borderRadius: 14, // Milder curves on the inner card
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 14,
        height: 58,
        // Moved the shadow here to ensure the rounded rectangle has a proper shadow
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 3,
    },
    cardBody: {
        flex: 1,
        justifyContent: 'center',
    },
    cardStatusText: {
        fontSize: 20, // slightly bigger status
        fontWeight: '900',
        color: '#1E293B', // Solid dark slate
        marginBottom: 2,
    },
    dateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    cardDateText: {
        fontSize: 12,
        color: '#64748B', // Solid slate gray
        fontWeight: '800',
    },
    cardTimeText: {
        fontSize: 12,
        color: '#64748B',
        fontWeight: '800',
    },
    viewBadge: {
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: '#CBD5E1',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 4,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        paddingHorizontal: 30,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#455A64',
        marginTop: 16,
        marginBottom: 8,
    },
    emptySubText: {
        fontSize: 14,
        color: '#90A4AE',
        textAlign: 'center',
        lineHeight: 20,
    },
});
