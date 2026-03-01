import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, Modal, ActivityIndicator, Alert, Platform, Animated, Easing, useWindowDimensions } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AlertEngine, { AlertEvents } from '../services/AlertEngine';
import supabase from './config/supabaseClient';
import AddPostScreen from './AddPostScreen';
import HomeHeader from '../components/HomeHeader';

const GRID_GAP = 10;
const GRID_PADDING = 16;
const LIVE_WINDOW_MS = 5 * 60 * 1000;
const SAVED_LIMIT = 500;
const SAVED_STORAGE_KEY = 'gallery_saved_snapshots_v1';

const getResponsiveColumns = (screenWidth) => {
    if (screenWidth >= 1024) return 5;
    if (screenWidth >= 768) return 4;
    if (screenWidth >= 480) return 3;
    return 2;
};

export default function GalleryScreen({ onBack, session, onNavigate }) {
    const { width: screenWidth } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const columnCount = getResponsiveColumns(screenWidth);
    const imageSize = (screenWidth - (GRID_PADDING * 2) - (GRID_GAP * (columnCount - 1))) / columnCount;

    const [images, setImages] = useState([]);
    const [selectedImage, setSelectedImage] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showShareModal, setShowShareModal] = useState(false);
    const [userProfile, setUserProfile] = useState(null);
    const [saveConfirmVisible, setSaveConfirmVisible] = useState(false);
    const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
    const [activeZone, setActiveZone] = useState('live');
    const [savedSnapshots, setSavedSnapshots] = useState([]);
    const [nowTs, setNowTs] = useState(Date.now());
    const pageAnim = useRef(new Animated.Value(0)).current;
    const headerAnim = useRef(new Animated.Value(0)).current;
    const [showStatsModal, setShowStatsModal] = useState(false);

    useEffect(() => {
        loadSavedSnapshots();
    }, []);

    useEffect(() => {
        loadImages();
        fetchUserProfile();

        const handler = () => loadImages();
        AlertEngine.on(AlertEvents.UPDATED, handler);
        return () => AlertEngine.off(AlertEvents.UPDATED, handler);
    }, [session]);

    useEffect(() => {
        const timer = setInterval(() => setNowTs(Date.now()), 15000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        Animated.parallel([
            Animated.timing(pageAnim, {
                toValue: 1,
                duration: 420,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.spring(headerAnim, {
                toValue: 1,
                useNativeDriver: true,
                stiffness: 220,
                damping: 22,
                mass: 0.8,
            }),
        ]).start();
    }, [pageAnim, headerAnim]);

    const fetchUserProfile = async () => {
        if (!session?.user?.id) return;
        const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        if (data) setUserProfile(data);
    };

    const persistSavedSnapshots = async (items) => {
        try {
            await AsyncStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(items));
        } catch (e) {
            console.error('Failed to save gallery snapshots', e);
        }
    };

    const loadSavedSnapshots = async () => {
        try {
            const raw = await AsyncStorage.getItem(SAVED_STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                setSavedSnapshots(parsed);
            }
        } catch (e) {
            console.error('Failed to load saved snapshots', e);
        }
    };

    const isSaved = (id) => savedSnapshots.some((item) => item.id === id);

    const keepSnapshot = async (snapshot) => {
        if (!snapshot?.id || !snapshot?.uri) return;
        const next = [
            {
                ...snapshot,
                savedAt: new Date().toISOString(),
            },
            ...savedSnapshots.filter((item) => item.id !== snapshot.id),
        ].slice(0, SAVED_LIMIT);
        setSavedSnapshots(next);
        await persistSavedSnapshots(next);
    };

    const unkeepSnapshot = async (snapshotId) => {
        const next = savedSnapshots.filter((item) => item.id !== snapshotId);
        setSavedSnapshots(next);
        await persistSavedSnapshots(next);
    };

    const loadImages = async () => {
        setLoading(true);
        try {
            // 1. Get Local History
            const history = AlertEngine.getHistory();
            let allAlerts = [...history];

            // 2. Future DB Integration: Fetch from Supabase
            if (session?.user?.id) {
                // Example structure for future implementation:
                // const { data } = await supabase
                //   .from('alerts')
                //   .select('*')
                //   .eq('user_id', session.user.id)
                //   .not('snapshot_url', 'is', null);
                // if (data) {
                //    // Merge logic here
                // }
            }

            // Filter alerts that have snapshots
            const snapshotAlerts = allAlerts.filter(alert => alert.snapshotUrl || alert.cropSnapshot);

            // Sort by timestamp descending
            snapshotAlerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            const formattedImages = snapshotAlerts.map(alert => ({
                id: alert.id,
                uri: alert.snapshotUrl || alert.cropSnapshot,
                date: alert.timestamp,
                title: alert.title,
                type: alert.type
            }));

            setImages(formattedImages);
        } catch (error) {
            console.error("Error loading gallery:", error);
        } finally {
            setLoading(false);
        }
    };

    const requestDeleteConfirm = () => {
        if (!selectedImage) return;
        setDeleteConfirmVisible(true);
    };

    const handleDelete = async () => {
        if (!selectedImage) return;
        if (isSaved(selectedImage.id)) {
            await unkeepSnapshot(selectedImage.id);
        }
        await AlertEngine.deleteAlert(selectedImage.id);
        setSelectedImage(null);
    };

    const handleSaveToDevice = async () => {
        if (!selectedImage?.uri) return;

        if (Platform.OS === 'web') {
            Alert.alert('Not Supported', 'Saving directly to gallery is not supported on web.');
            return;
        }

        try {
            const permission = await MediaLibrary.requestPermissionsAsync();
            if (permission.status !== 'granted') {
                Alert.alert('Permission Required', 'Please allow photo library access to save images.');
                return;
            }

            let targetUri = selectedImage.uri;
            if (/^https?:\/\//i.test(selectedImage.uri)) {
                const fileExt = (selectedImage.uri.split('.').pop() || 'jpg').split('?')[0].toLowerCase();
                const safeExt = fileExt.length <= 5 ? fileExt : 'jpg';
                const fileName = `neko_snapshot_${Date.now()}.${safeExt}`;
                const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
                const downloaded = await FileSystem.downloadAsync(selectedImage.uri, fileUri);
                targetUri = downloaded.uri;
            }

            await MediaLibrary.saveToLibraryAsync(targetUri);
            Alert.alert('Saved', 'Image saved to your gallery.');
        } catch (error) {
            Alert.alert('Save Failed', error?.message || 'Could not save image.');
        }
    };

    const requestSaveToDevice = () => {
        if (!selectedImage?.uri) return;
        setSaveConfirmVisible(true);
    };

    const handleKeepToggle = async () => {
        if (!selectedImage) return;
        if (isSaved(selectedImage.id)) {
            await unkeepSnapshot(selectedImage.id);
        } else {
            await keepSnapshot(selectedImage);
        }
    };

    const handlePostSubmit = async (postData) => {
        try {
            setLoading(true);
            let uploadedImageUrl = postData.image;

            // If local URI, upload it
            if (postData.image && !postData.image.startsWith('http')) {
                const fileName = `${session.user.id}_${Date.now()}.jpg`;
                const response = await fetch(postData.image);
                const arrayBuffer = await response.arrayBuffer();

                const { error: uploadError } = await supabase.storage
                    .from('posts')
                    .upload(fileName, arrayBuffer, { contentType: 'image/jpeg', upsert: true });

                if (uploadError) throw uploadError;

                const { data } = supabase.storage.from('posts').getPublicUrl(fileName);
                uploadedImageUrl = data.publicUrl;
            }

            const { error } = await supabase.from('posts').insert({
                user_id: session.user.id,
                content: postData.content,
                image_url: uploadedImageUrl
            });

            if (error) throw error;

            Alert.alert("Success", "Shared to Community!");
            setShowShareModal(false);
            setSelectedImage(null);
            if (onNavigate) onNavigate('Community');
        } catch (e) {
            Alert.alert("Error", e.message);
        } finally {
            setLoading(false);
        }
    };

    const liveImages = images.filter((item) => {
        if (isSaved(item.id)) return false;
        const ts = new Date(item.date).getTime();
        return Number.isFinite(ts) && (nowTs - ts) <= LIVE_WINDOW_MS;
    });

    const sortedSavedImages = [...savedSnapshots].sort(
        (a, b) => new Date(b.savedAt || b.date || 0).getTime() - new Date(a.savedAt || a.date || 0).getTime()
    );

    const zoneData = activeZone === 'saved' ? sortedSavedImages : liveImages;

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
        const itemScale = pageAnim.interpolate({
            inputRange: [start, start + 0.25, 1],
            outputRange: [0.96, 1, 1],
            extrapolate: 'clamp',
        });

        return (
            <Animated.View style={{ opacity: itemOpacity, transform: [{ translateY: itemTranslateY }, { scale: itemScale }] }}>
                <TouchableOpacity
                    style={[styles.imageContainer, { width: imageSize, height: imageSize }]}
                    onPress={() => setSelectedImage(item)}
                    activeOpacity={0.86}
                >
                    <Image source={{ uri: item.uri }} style={styles.thumbnail} />
                    <View style={styles.typeBadge}>
                        <Ionicons name="paw" size={11} color="#FFFFFF" />
                    </View>
                </TouchableOpacity>
            </Animated.View>
        );
    };

    if (showShareModal) {
        return (
            <AddPostScreen
                onClose={() => setShowShareModal(false)}
                onSubmit={handlePostSubmit}
                initialPost={{ image: selectedImage?.uri }}
                userProfile={userProfile}
                currentUserId={session?.user?.id}
            />
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: '#F5FBFB' }}>
            <StatusBar style="dark" translucent backgroundColor="transparent" />
            <LinearGradient colors={['#F4FAF9', '#E0F2F1']} style={{ flex: 1 }}>
                <SafeAreaView style={styles.container}>
                    {/* Header */}
                    <HomeHeader
                        leftComponent={
                            <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.85}>
                                <Ionicons name="chevron-back" size={22} color="#1C1C1E" />
                            </TouchableOpacity>
                        }
                        rightComponent={
                            <View style={styles.headerRight}>
                                <TouchableOpacity
                                    style={styles.headerPill}
                                    onPress={() => setShowStatsModal(true)}
                                    activeOpacity={0.7}
                                >
                                    <MaterialCommunityIcons name="cat" size={14} color="#0C5A58" />
                                    <Text style={styles.headerPillText}>{images.length}</Text>
                                </TouchableOpacity>
                            </View>
                        }
                    />

                    <View style={styles.zoneSwitchWrap}>
                        <TouchableOpacity
                            style={[styles.zoneChip, activeZone === 'live' && styles.zoneChipActive]}
                            onPress={() => setActiveZone('live')}
                            activeOpacity={0.85}
                        >
                            <Ionicons name="flash-outline" size={14} color={activeZone === 'live' ? '#FFFFFF' : '#0C5A58'} />
                            <Text style={[styles.zoneChipText, activeZone === 'live' && styles.zoneChipTextActive]}>Live ({liveImages.length})</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.zoneChip, activeZone === 'saved' && styles.zoneChipActive]}
                            onPress={() => setActiveZone('saved')}
                            activeOpacity={0.85}
                        >
                            <Ionicons name="heart-outline" size={14} color={activeZone === 'saved' ? '#FFFFFF' : '#0C5A58'} />
                            <Text style={[styles.zoneChipText, activeZone === 'saved' && styles.zoneChipTextActive]}>Saved ({sortedSavedImages.length})</Text>
                        </TouchableOpacity>
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
                                key={`gallery-${columnCount}`}
                                data={zoneData}
                                renderItem={renderItem}
                                keyExtractor={item => item.id}
                                numColumns={columnCount}
                                contentContainerStyle={styles.gridContent}
                                columnWrapperStyle={styles.columnWrapper}
                                ListHeaderComponent={
                                    <View style={styles.galleryIntroCard}>
                                        <View style={styles.galleryIntroIconWrap}>
                                            <Ionicons name="images-outline" size={18} color="#0C5A58" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.galleryIntroText}>{activeZone === 'live' ? 'Live Activity Feed' : 'Your Saved Cat Moments'}</Text>
                                            <Text style={styles.galleryIntroSubText}>
                                                {activeZone === 'live'
                                                    ? 'Auto-updates from recent detections'
                                                    : 'Only snapshots you kept'}
                                            </Text>
                                        </View>
                                        <TouchableOpacity
                                            style={styles.simulateButton}
                                            onPress={() => {
                                                AlertEngine.logPendingIdentity({
                                                    behaviorLabel: Math.random() > 0.5 ? 'eating' : 'grooming',
                                                    confidence: 0.92,
                                                    cropSnapshot: 'https://placekitten.com/g/200/300',
                                                    sessionId: 'test_' + Date.now(),
                                                    source: 'Manual Simulator',
                                                    isAbnormal: false
                                                });
                                            }}
                                        >
                                            <Text style={styles.simulateText}>TEST</Text>
                                        </TouchableOpacity>
                                    </View>
                                }
                                ListEmptyComponent={
                                    <View style={styles.emptyState}>
                                        <Ionicons name="images-outline" size={64} color="#B0BEC5" />
                                        <Text style={styles.emptyText}>{activeZone === 'live' ? 'No live snapshots now' : 'No saved snapshots yet'}</Text>
                                        <Text style={styles.emptySubText}>
                                            {activeZone === 'live'
                                                ? 'New detections will appear here in real time'
                                                : 'Tap Keep on a snapshot to save it here'}
                                        </Text>
                                    </View>
                                }
                            />
                        </Animated.View>
                    )}

                    {/* Image Preview Modal */}
                    <Modal visible={!!selectedImage} transparent={true} animationType="fade">
                        <View style={styles.modalContainer}>
                            {selectedImage && (
                                <View style={[styles.previewCard, { width: Math.min(screenWidth - 24, 430), marginTop: insets.top > 0 ? 0 : 12 }]}>
                                    <View style={styles.previewHeader}>
                                        <View style={styles.previewTitleWrap}>
                                            <View style={styles.previewPawBadge}>
                                                <Ionicons name="paw" size={14} color="#FFFFFF" />
                                            </View>
                                            <Text style={styles.previewHeaderText}>Cat Moment</Text>
                                        </View>
                                        <TouchableOpacity
                                            style={styles.previewCloseButton}
                                            onPress={() => setSelectedImage(null)}
                                            activeOpacity={0.85}
                                        >
                                            <Ionicons name="close" size={20} color="#1F2937" />
                                        </TouchableOpacity>
                                    </View>

                                    <View style={styles.previewImageWrap}>
                                        <Image source={{ uri: selectedImage.uri }} style={styles.previewImage} resizeMode="contain" />
                                    </View>

                                    <View style={styles.imageInfo}>
                                        <Text style={styles.imageTitle}>{selectedImage.title}</Text>
                                        <Text style={styles.imageDate}>{new Date(selectedImage.date).toLocaleString()}</Text>
                                    </View>

                                    <View style={styles.actionContainer}>
                                        <TouchableOpacity style={[styles.actionButton, styles.keepButton]} onPress={handleKeepToggle}>
                                            <Ionicons name={isSaved(selectedImage.id) ? 'heart' : 'heart-outline'} size={22} color="#E6517A" />
                                            <Text style={[styles.actionText, styles.keepActionText]}>
                                                {isSaved(selectedImage.id) ? 'Kept' : 'Keep'}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.actionButton, styles.saveButton]} onPress={requestSaveToDevice}>
                                            <Ionicons name="download-outline" size={22} color="#1A56C5" />
                                            <Text style={[styles.actionText, styles.saveActionText]}>Save</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={requestDeleteConfirm}>
                                            <Ionicons name="trash-outline" size={22} color="#FF5252" />
                                            <Text style={[styles.actionText, { color: '#FF5252' }]}>Delete</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.actionButton, styles.shareButton]} onPress={() => setShowShareModal(true)}>
                                            <Ionicons name="share-social-outline" size={22} color="#0C5A58" />
                                            <Text style={[styles.actionText, styles.shareActionText]}>Share</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                        </View>
                    </Modal>

                    <Modal visible={saveConfirmVisible} transparent animationType="fade" onRequestClose={() => setSaveConfirmVisible(false)}>
                        <View style={styles.confirmOverlay}>
                            <View style={styles.confirmContent}>
                                <View style={styles.confirmIconCircle}>
                                    <Ionicons name="download-outline" size={36} color="#2A69C7" />
                                </View>
                                <Text style={styles.confirmTitle}>Save Snapshot</Text>
                                <Text style={styles.confirmText}>Do you want to save this snapshot to your device gallery?</Text>
                                <View style={styles.confirmActions}>
                                    <TouchableOpacity style={styles.confirmCancel} onPress={() => setSaveConfirmVisible(false)}>
                                        <Text style={styles.confirmCancelText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.confirmPrimary}
                                        onPress={async () => {
                                            setSaveConfirmVisible(false);
                                            await handleSaveToDevice();
                                        }}
                                    >
                                        <Text style={styles.confirmPrimaryText}>Save</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Modal>

                    <Modal visible={deleteConfirmVisible} transparent animationType="fade" onRequestClose={() => setDeleteConfirmVisible(false)}>
                        <View style={styles.confirmOverlay}>
                            <View style={styles.confirmContent}>
                                <View style={styles.confirmIconCircle}>
                                    <Ionicons name="alert-circle-outline" size={36} color="#2A69C7" />
                                </View>
                                <Text style={styles.confirmTitle}>Delete Snapshot</Text>
                                <Text style={styles.confirmText}>Are you sure you want to delete this snapshot? This cannot be undone.</Text>
                                <View style={styles.confirmActions}>
                                    <TouchableOpacity style={styles.confirmCancel} onPress={() => setDeleteConfirmVisible(false)}>
                                        <Text style={styles.confirmCancelText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.confirmPrimary}
                                        onPress={async () => {
                                            setDeleteConfirmVisible(false);
                                            await handleDelete();
                                        }}
                                    >
                                        <Text style={styles.confirmPrimaryText}>Delete</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Modal>

                    <Modal visible={showStatsModal} transparent animationType="slide">
                        <View style={styles.statsModalOverlay}>
                            <View style={styles.statsModalContent}>
                                <View style={styles.statsHeader}>
                                    <Text style={styles.statsTitle}>Capture Statistics</Text>
                                    <TouchableOpacity onPress={() => setShowStatsModal(false)}>
                                        <Ionicons name="close" size={24} color="#1F2937" />
                                    </TouchableOpacity>
                                </View>

                                <View style={styles.statsGrid}>
                                    <View style={styles.statBox}>
                                        <Text style={styles.statNum}>{images.length}</Text>
                                        <Text style={styles.statLabel}>Total Captures</Text>
                                    </View>
                                    <View style={styles.statBox}>
                                        <Text style={styles.statNum}>{liveImages.length}</Text>
                                        <Text style={styles.statLabel}>Recent Live</Text>
                                    </View>
                                    <View style={styles.statBox}>
                                        <Text style={styles.statNum}>{savedSnapshots.length}</Text>
                                        <Text style={styles.statLabel}>Saved Moments</Text>
                                    </View>
                                </View>

                                <TouchableOpacity
                                    style={styles.closeStatsBtn}
                                    onPress={() => setShowStatsModal(false)}
                                >
                                    <Text style={styles.closeStatsText}>Dismiss</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </Modal>
                </SafeAreaView>
            </LinearGradient>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 12,
        marginBottom: 4,
    },
    backButton: {
        width: 42,
        height: 42,
        borderRadius: 21,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E5E5EA',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
    },
    brandContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    brandText: {
        fontSize: 20,
        color: '#00695C',
        fontFamily: 'Inter-Bold',
        marginHorizontal: 3,
    },
    headerRight: {
        width: 42,
        alignItems: 'flex-end',
    },
    headerPill: {
        minWidth: 38,
        height: 26,
        borderRadius: 13,
        backgroundColor: '#E0F2F1',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 8,
        gap: 4,
    },
    headerPillText: {
        fontSize: 12,
        color: '#0C5A58',
        fontFamily: 'Inter-Bold',
    },
    simulateButton: {
        backgroundColor: '#E6F5F5',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        marginLeft: 8,
    },
    simulateText: {
        fontSize: 10,
        fontFamily: 'Inter-Bold',
        color: '#0C5A58',
    },
    zoneSwitchWrap: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        marginBottom: 10,
        gap: 8,
    },
    zoneChip: {
        flex: 1,
        height: 38,
        borderRadius: 19,
        backgroundColor: '#EAF4F4',
        borderWidth: 1,
        borderColor: '#D2E7E6',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    zoneChipActive: {
        backgroundColor: '#0C5A58',
        borderColor: '#0C5A58',
    },
    zoneChipText: {
        color: '#0C5A58',
        fontSize: 12,
        fontFamily: 'Inter-Bold',
    },
    zoneChipTextActive: {
        color: '#FFFFFF',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    gridContent: {
        paddingHorizontal: GRID_PADDING,
        paddingBottom: 24,
    },
    galleryIntroCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E5E5EA',
        padding: 12,
        marginBottom: 14,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 1,
    },
    galleryIntroIconWrap: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: '#E6F5F5',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    galleryIntroText: {
        flex: 1,
        color: '#1F2937',
        fontSize: 14,
        fontFamily: 'Inter-Bold',
    },
    galleryIntroSubText: {
        color: '#6B7280',
        fontSize: 12,
        fontFamily: 'Inter-Medium',
    },
    columnWrapper: {
        gap: GRID_GAP,
        marginBottom: GRID_GAP,
    },
    imageContainer: {
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: '#ECEFF1',
        position: 'relative',
        borderWidth: 1,
        borderColor: '#E5E5EA',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
    },
    thumbnail: {
        width: '100%',
        height: '100%',
    },
    typeBadge: {
        position: 'absolute',
        bottom: 6,
        right: 6,
        backgroundColor: 'rgba(12, 90, 88, 0.82)',
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 100,
    },
    emptyText: {
        marginTop: 16,
        fontSize: 18,
        fontFamily: 'Inter-Bold',
        color: '#90A4AE',
    },
    emptySubText: {
        marginTop: 8,
        fontSize: 14,
        color: '#B0BEC5',
        fontFamily: 'Inter-Medium',
    },
    // Stats Modal Styles
    statsModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    statsModalContent: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
    },
    statsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    statsTitle: {
        fontSize: 18,
        fontFamily: 'Inter-Bold',
        color: '#1F2937',
    },
    statsGrid: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 24,
    },
    statBox: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    statNum: {
        fontSize: 24,
        fontFamily: 'Inter-Bold',
        color: '#0C5A58',
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 10,
        fontFamily: 'Inter-Medium',
        color: '#64748B',
        textAlign: 'center',
    },
    closeStatsBtn: {
        backgroundColor: '#0C5A58',
        borderRadius: 14,
        height: 50,
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeStatsText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontFamily: 'Inter-Bold',
    },
    modalContainer: {
        flex: 1,
        backgroundColor: 'rgba(21, 34, 38, 0.48)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 12,
    },
    previewCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#E6EDF2',
        padding: 14,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 20,
        elevation: 14,
    },
    previewHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    previewTitleWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    previewPawBadge: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#2EA6A4',
        justifyContent: 'center',
        alignItems: 'center',
    },
    previewHeaderText: {
        color: '#1F2937',
        fontSize: 14,
        fontFamily: 'Inter-Bold',
    },
    previewCloseButton: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: '#F2F6F8',
        justifyContent: 'center',
        alignItems: 'center',
    },
    previewImageWrap: {
        width: '100%',
        aspectRatio: 1.1,
        backgroundColor: '#F6FBFB',
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#E7EEF2',
    },
    previewImage: {
        width: '100%',
        height: '100%',
    },
    imageInfo: {
        marginTop: 12,
        alignItems: 'center',
    },
    actionContainer: {
        marginTop: 14,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        paddingHorizontal: 0,
        justifyContent: 'center',
        width: '100%',
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0C5A58',
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderRadius: 25,
        gap: 6,
        minWidth: 100,
        justifyContent: 'center',
    },
    deleteButton: {
        backgroundColor: '#FFF2F2',
        borderWidth: 1,
        borderColor: '#FFD8D8',
    },
    saveButton: {
        backgroundColor: '#E8F0FF',
        borderWidth: 1,
        borderColor: '#C8D8FF',
    },
    saveActionText: {
        color: '#1A56C5',
    },
    shareButton: {
        backgroundColor: '#E0F2F1',
        borderWidth: 1,
        borderColor: '#BFE3E1',
    },
    shareActionText: {
        color: '#0C5A58',
    },
    keepButton: {
        backgroundColor: '#FFEAF1',
        borderWidth: 1,
        borderColor: '#FFD3E2',
    },
    keepActionText: {
        color: '#C43C6B',
    },
    actionText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontFamily: 'Inter-Bold',
    },
    imageTitle: {
        color: '#1F2937',
        fontSize: 16,
        fontFamily: 'Inter-Bold',
        marginBottom: 4,
        textAlign: 'center',
    },
    imageDate: {
        color: '#708090',
        fontSize: 12,
        fontFamily: 'Inter-Medium',
    },
    confirmOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    confirmContent: {
        width: '100%',
        maxWidth: 360,
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 10,
    },
    confirmIconCircle: {
        width: 68,
        height: 68,
        borderRadius: 34,
        backgroundColor: '#E8F0FF',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 14,
    },
    confirmTitle: {
        fontSize: 18,
        color: '#1A3B34',
        fontFamily: 'Inter-Bold',
        marginBottom: 8,
        textAlign: 'center',
    },
    confirmText: {
        fontSize: 14,
        color: '#5C706B',
        textAlign: 'center',
        fontFamily: 'Inter-Regular',
        lineHeight: 20,
        marginBottom: 24,
    },
    confirmActions: {
        flexDirection: 'row',
        width: '100%',
        gap: 12,
    },
    confirmCancel: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: '#F0F4F4',
        alignItems: 'center',
    },
    confirmCancelText: {
        color: '#5C706B',
        fontSize: 15,
        fontFamily: 'Inter-SemiBold',
    },
    confirmPrimary: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: '#2A69C7',
        alignItems: 'center',
    },
    confirmPrimaryText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontFamily: 'Inter-SemiBold',
    },
});
