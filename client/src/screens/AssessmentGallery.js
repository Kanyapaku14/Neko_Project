import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Animated, Easing, useWindowDimensions, DeviceEventEmitter } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import supabase from './config/supabaseClient';
import HomeHeader from '../components/HomeHeader';

const GRID_GAP = 12;
const GRID_PADDING = 16;

const getResponsiveColumns = (screenWidth) => {
    if (screenWidth >= 1024) return 5;
    if (screenWidth >= 768) return 4;
    if (screenWidth >= 480) return 3;
    return 2;
};

// Helper: Get color based on overall risk score
const getRiskColor = (score) => {
    if (score === null || score === undefined || score === 'No Data') return '#B0BEC5';
    if (score >= 80) return '#10B981'; // Green - Excellent
    if (score >= 60) return '#3B82F6'; // Blue - Good
    if (score >= 40) return '#F59E0B'; // Orange - Fair
    return '#EF4444'; // Red - Attention
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
    const columnCount = getResponsiveColumns(screenWidth);
    const cardSize = (screenWidth - (GRID_PADDING * 2) - (GRID_GAP * (columnCount - 1))) / columnCount;

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
                    style={[styles.cardContainer, { width: cardSize }]}
                    onPress={() => handleSelectAssessment(item)}
                    activeOpacity={0.8}
                >
                    <View style={[styles.cardHeader, { backgroundColor: scoreColor + '15' }]}>
                        <MaterialCommunityIcons name="heart-pulse" size={20} color={scoreColor} />
                        <Text style={[styles.cardScoreText, { color: scoreColor }]}>{displayScore}</Text>
                    </View>

                    <View style={styles.cardBody}>
                        <Text style={styles.cardStatusText} numberOfLines={1}>{scoreLabel}</Text>
                        <Text style={styles.cardDateText}>{dateStr}</Text>
                        <Text style={styles.cardTimeText}>{timeStr}</Text>
                    </View>

                    <View style={styles.viewBadge}>
                        <Ionicons name="chevron-forward" size={14} color="#0C5A58" />
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
                                key={`assessments-${columnCount}`}
                                data={assessments}
                                renderItem={renderItem}
                                keyExtractor={item => String(item.id)}
                                numColumns={columnCount}
                                contentContainerStyle={styles.gridContent}
                                columnWrapperStyle={styles.columnWrapper}
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
    gridContent: {
        padding: GRID_PADDING,
        paddingBottom: 40,
        gap: GRID_GAP,
    },
    columnWrapper: {
        gap: GRID_GAP,
    },
    cardContainer: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E7EFEA',
        overflow: 'hidden',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 1,
        position: 'relative',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.03)',
    },
    cardScoreText: {
        fontSize: 18,
        fontWeight: '800',
    },
    cardBody: {
        padding: 12,
        paddingTop: 8,
    },
    cardStatusText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#37474F',
        marginBottom: 8,
    },
    cardDateText: {
        fontSize: 11,
        color: '#5F7671',
        fontWeight: '600',
    },
    cardTimeText: {
        fontSize: 10,
        color: '#90A4AE',
        marginTop: 2,
    },
    viewBadge: {
        position: 'absolute',
        bottom: 8,
        right: 8,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#F1F8F6',
        justifyContent: 'center',
        alignItems: 'center',
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
