// ==============================================
// 1. ส่วนการนำเข้า Libraries และ Components (Imports)
// ==============================================
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, TextInput, Animated, LayoutAnimation, UIManager, Platform, Modal, Alert } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import supabase from './config/supabaseClient';
import { LinearGradient } from 'expo-linear-gradient'; // Import LinearGradient

import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import AlertEngine from '../services/AlertEngine'; // Global Alert Manager

const CAMERA_BRANDS = [
    { id: 'tapo', label: 'TP-Link Tapo', icon: 'link-variant', api: 'Tapo Cloud API' },
    { id: 'xiaomi', label: 'Xiaomi Mi Home', icon: 'shield-home', api: 'Xiaomi Cloud API' },
    { id: 'ezviz', label: 'EZVIZ', icon: 'video-check', api: 'EZVIZ Cloud API' },
    { id: 'custom', label: 'Other (Manual)', icon: 'cog-outline', api: 'Manual API setup' },
];

const PREVIEW_FRAMES = [
    require('../../assets/cioncat.jpg'),
    require('../../assets/cover-blog-3.jpg'),
    require('../../assets/ebo-air-2.jpg'),
    require('../../assets/makky.jpg'),
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const DecorativeCatEars = () => (
    <View style={styles.earContainer} pointerEvents="none">
        <View style={[styles.ear, styles.earLeft]} />
        <View style={[styles.ear, styles.earRight]} />
    </View>
);

// ==============================================
// 2. Main Component (หน้าจอตั้งค่า)
// ==============================================
export default function SetcameraScreen({ onNavigate, session }) {
    const defaultZoneLabel = 'Litter Box Zone';
    // State simulating connection status
    const [cameraStatus, setCameraStatus] = useState("disconnected"); // 'disconnected' | 'connecting' | 'connected'
    const [lastScanAt, setLastScanAt] = useState(null);
    const [previewFrameIndex, setPreviewFrameIndex] = useState(0);
    const [zoneLabel, setZoneLabel] = useState(defaultZoneLabel);
    const [isUpdateMode, setIsUpdateMode] = useState(false);

    // Monitoring Mode State
    const [monitoringMode, setMonitoringMode] = useState('multi'); // 'single' | 'multi'
    // Mock user cats
    const [myCats, setMyCats] = useState([]);
    const [selectedCats, setSelectedCats] = useState([]);

    // Hardware State
    const [selectedCameraPreset, setSelectedCameraPreset] = useState(null);
    const [committedCameraBrand, setCommittedCameraBrand] = useState(null);
    const [customCameraBrand, setCustomCameraBrand] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmTitle, setConfirmTitle] = useState('Confirm Connection');
    const [confirmMessage, setConfirmMessage] = useState('Connect or update this camera?');
    const [showSourceRequiredModal, setShowSourceRequiredModal] = useState(false);
    const [sourceRequiredTitle, setSourceRequiredTitle] = useState('Camera source required');
    const [sourceRequiredMessage, setSourceRequiredMessage] = useState('');
    const [isChangingConnectedBrand, setIsChangingConnectedBrand] = useState(false);
    const [isDuplicateConnectAttempt, setIsDuplicateConnectAttempt] = useState(false);
    const [cameraId, setCameraId] = useState(null);

    // Animation values
    const successAnim = React.useRef(new Animated.Value(0)).current;

    // Scale animations for each brand
    const brandScales = React.useRef({
        tapo: new Animated.Value(1),
        xiaomi: new Animated.Value(1),
        ezviz: new Animated.Value(1),
        custom: new Animated.Value(1),
    }).current;

    const animateSelection = (brandId) => {
        Object.keys(brandScales).forEach(id => {
            Animated.spring(brandScales[id], {
                toValue: id === brandId ? 1.03 : 1,
                useNativeDriver: true,
                friction: 8,
            }).start();
        });
    };

    const openSourceRequiredModal = (title, message) => {
        setSourceRequiredTitle(title || 'Camera source required');
        setSourceRequiredMessage(message || '');
        setShowSourceRequiredModal(true);
    };

    // Load initial settings and fetch cats
    React.useEffect(() => {
        const load = async () => {
            try {
                await AlertEngine.setScope(session?.user?.id || 'anonymous');
                // Load saved selection settings (always, even before cats are loaded)
                const mode = await AsyncStorage.getItem('camera_monitoringMode');
                const savedCatsJson = await AsyncStorage.getItem('camera_selectedCats');
                const savedStatus = await AsyncStorage.getItem('camera_status');
                const savedBrand = await AsyncStorage.getItem('camera_brand');
                const savedCameraId = await AsyncStorage.getItem('camera_id');
                const savedZoneLabel = await AsyncStorage.getItem('camera_zone_summary');

                if (mode) setMonitoringMode(mode);
                if (savedStatus) setCameraStatus(savedStatus);
                if (savedBrand && savedStatus === 'connected') {
                    setSelectedCameraPreset(savedBrand);
                    setCommittedCameraBrand(savedBrand);
                    animateSelection(savedBrand);
                    setIsUpdateMode(true);
                    successAnim.setValue(1);
                } else {
                    setSelectedCameraPreset(null);
                    setCommittedCameraBrand(null);
                    animateSelection('');
                }
                if (savedCameraId) setCameraId(savedCameraId);
                if (!savedCameraId && session?.user?.id) {
                    const { data: existingCamera } = await supabase
                        .from('cameras')
                        .select('id, brand, ai_connection_status')
                        .eq('owner_id', session.user.id)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    if (existingCamera?.id) {
                        setCameraId(existingCamera.id);
                        await AsyncStorage.setItem('camera_id', existingCamera.id);
                        if (existingCamera.brand && !savedBrand && existingCamera.ai_connection_status === 'online') {
                            setSelectedCameraPreset(existingCamera.brand);
                            setCommittedCameraBrand(existingCamera.brand);
                            animateSelection(existingCamera.brand);
                        }
                        if (existingCamera.ai_connection_status === 'online') {
                            setCameraStatus('connected');
                            setIsUpdateMode(true);
                        }
                    }
                }
                if (savedZoneLabel) {
                    setZoneLabel(savedZoneLabel);
                }

                // Fetch real cats if session exists
                if (session?.user?.id) {
                    const { data: cats, error } = await supabase
                        .from('cats')
                        .select('*')
                        .eq('owner_id', session.user.id);

                    if (error) throw error;
                    setMyCats(cats || []);

                    if (cats && cats.length === 1) {
                        // Hard rule: one-cat households should default to single mode.
                        const onlyCat = [cats[0].id];
                        setMonitoringMode('single');
                        setSelectedCats(onlyCat);
                        await AsyncStorage.setItem('camera_monitoringMode', 'single');
                        await AsyncStorage.setItem('camera_selectedCats', JSON.stringify(onlyCat));
                    } else if (savedCatsJson) {
                        setSelectedCats(JSON.parse(savedCatsJson));
                    } else if (cats && cats.length > 0) {
                        // Default selection if none saved: first cat for single, all for multi
                        if (mode === 'single') {
                            setSelectedCats([cats[0].id]);
                        } else {
                            setSelectedCats(cats.map(c => c.id));
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to load settings or cats", e);
            }
        };
        load();
    }, [session]);

    React.useEffect(() => {
        if (cameraStatus !== 'connected') return undefined;
        const timer = setInterval(() => {
            setPreviewFrameIndex((prev) => (prev + 1) % PREVIEW_FRAMES.length);
            setLastScanAt(new Date());
        }, 3500);
        return () => clearInterval(timer);
    }, [cameraStatus]);

    const syncCameraCatsAssignment = async (targetCameraId, catIds) => {
        if (!targetCameraId || !Array.isArray(catIds)) return;
        try {
            const uniqueCatIds = [...new Set(catIds)].filter(Boolean);
            const { error: deleteErr } = await supabase
                .from('camera_cats')
                .delete()
                .eq('camera_id', targetCameraId);
            if (deleteErr) throw deleteErr;

            if (uniqueCatIds.length > 0) {
                const rows = uniqueCatIds.map((id, idx) => ({
                    camera_id: targetCameraId,
                    cat_id: id,
                    is_primary: idx === 0,
                }));
                const { error: insertErr } = await supabase.from('camera_cats').insert(rows);
                if (insertErr) throw insertErr;
            }
        } catch (err) {
            console.warn('Failed to sync camera_cats:', err?.message || err);
        }
    };

    const clearCameraZonesInDb = async (targetCameraId) => {
        if (!targetCameraId) return;
        try {
            const { error } = await supabase
                .from('camera_zones')
                .delete()
                .eq('camera_id', targetCameraId);
            if (error) throw error;
        } catch (err) {
            console.warn('Failed to clear camera_zones:', err?.message || err);
        }
    };

    const upsertCameraConfig = async (overrides = {}) => {
        if (!session?.user?.id) return null;
        const effectiveBrand = overrides.brand || selectedCameraPreset || committedCameraBrand || 'custom';
        const modeValue = (overrides.mode || monitoringMode) === 'single' ? 'single_cat' : 'multi_cat';
        const connectionStatus = overrides.aiConnectionStatus || (cameraStatus === 'connected' ? 'online' : 'offline');
        const name = overrides.name || `${effectiveBrand.toUpperCase()} Camera`;

        try {
            const payload = {
                owner_id: session.user.id,
                name,
                brand: effectiveBrand,
                model: effectiveBrand,
                mode: modeValue,
                assigned_by_user: true,
                is_ai_enabled: true,
                ai_mode: modeValue,
                ai_connection_status: connectionStatus,
                is_primary: true,
            };

            let resolvedCameraId = cameraId;

            if (resolvedCameraId) {
                const { error: updateErr } = await supabase
                    .from('cameras')
                    .update(payload)
                    .eq('id', resolvedCameraId)
                    .eq('owner_id', session.user.id);
                if (updateErr) throw updateErr;
            } else {
                const { data: inserted, error: insertErr } = await supabase
                    .from('cameras')
                    .insert(payload)
                    .select('id')
                    .single();
                if (insertErr) throw insertErr;
                resolvedCameraId = inserted?.id || null;
            }

            if (resolvedCameraId) {
                setCameraId(resolvedCameraId);
                await AsyncStorage.setItem('camera_id', resolvedCameraId);
                await syncCameraCatsAssignment(resolvedCameraId, selectedCats);
            }

            return resolvedCameraId;
        } catch (err) {
            console.warn('Failed to upsert camera config:', err?.message || err);
            return null;
        }
    };

    const ensureCameraSourceReady = async (targetCameraId) => {
        if (!targetCameraId || !session?.user?.id) return false;
        try {
            const { data: cameraRow, error } = await supabase
                .from('cameras')
                .select('id, stream_source')
                .eq('id', targetCameraId)
                .eq('owner_id', session.user.id)
                .maybeSingle();
            if (error) throw error;
            const source = (cameraRow?.stream_source || '').trim();
            if (!source) {
                openSourceRequiredModal(
                    'Camera source required',
                    'Please set stream_source (video/webcam/rtsp link) in DB for this account before entering Camera.'
                );
                return false;
            }
            return true;
        } catch (err) {
            console.warn('Failed to validate camera source:', err?.message || err);
            openSourceRequiredModal('Validation failed', 'Could not validate camera stream source from DB.');
            return false;
        }
    };

    const updateCameraStatus = async (status) => {
        const previousStatus = cameraStatus;
        setCameraStatus(status);
        await AsyncStorage.setItem('camera_status', status);

        if (session?.user?.id && cameraId) {
            const aiConnectionStatus = status === 'connected' ? 'online' : status === 'connecting' ? 'online' : 'offline';
            try {
                await supabase
                    .from('cameras')
                    .update({ ai_connection_status: aiConnectionStatus })
                    .eq('id', cameraId)
                    .eq('owner_id', session.user.id);
            } catch (err) {
                console.warn('Failed to update camera status in DB:', err?.message || err);
            }
        }

        // Global Alert Engine Triggers
        if (status === 'disconnected' && previousStatus === 'connected') {
            await AlertEngine.logEvent({
                type: 'camera_connection',
                severity: 'critical',
                title: 'Camera Disconnected',
                desc: 'Lost connection to Litter Box camera.',
                details: 'The camera feed cannot be established. Please check power or Wi-Fi.'
            });
        } else if (status === 'connected' && previousStatus !== 'connected') {
            await AlertEngine.resolveActiveAlerts('camera_connection', {
                title: 'System Online',
                desc: 'Camera connection restored automatically.',
                details: 'All systems functioning normally.'
            });
        }
    };

    const executeConnectCamera = () => {
        setIsConnecting(true);
        setTimeout(async () => {
            setIsConnecting(false);
            setIsUpdateMode(true);
            setLastScanAt(new Date());
            await updateCameraStatus('connected');
            await AsyncStorage.setItem('camera_brand', selectedCameraPreset);
            await AsyncStorage.setItem('camera_setup_complete', 'true');
            setCommittedCameraBrand(selectedCameraPreset);

            Animated.sequence([
                Animated.spring(successAnim, {
                    toValue: 1,
                    tension: 50,
                    friction: 7,
                    useNativeDriver: true,
                }),
                Animated.delay(200),
                Animated.spring(successAnim, {
                    toValue: 1.05,
                    useNativeDriver: true,
                }),
                Animated.spring(successAnim, {
                    toValue: 1,
                    friction: 3,
                    useNativeDriver: true,
                })
            ]).start();
        }, 1500);
    };

    const handleConnectCamera = () => {
        if (!selectedCameraPreset) return;

        const duplicateConnectedBrand = cameraStatus === 'connected'
            && committedCameraBrand
            && selectedCameraPreset === committedCameraBrand;
        if (duplicateConnectedBrand) {
            setIsDuplicateConnectAttempt(true);
            setIsChangingConnectedBrand(false);
            setConfirmTitle('Camera Already Connected');
            setConfirmMessage('This camera is already connected. Select another brand if you want to replace the current connection.');
            setShowConfirmModal(true);
            return;
        }

        const changingConnectedBrand = cameraStatus === 'connected'
            && committedCameraBrand
            && selectedCameraPreset !== committedCameraBrand;
        setIsDuplicateConnectAttempt(false);
        setIsChangingConnectedBrand(changingConnectedBrand);
        setConfirmTitle(changingConnectedBrand ? 'Change Camera' : 'Confirm Connection');
        setConfirmMessage(
            changingConnectedBrand
                ? 'This will disconnect the current camera and reset setup.'
                : 'Connect or update this camera?'
        );
        setShowConfirmModal(true);
    };

    const handleConfirmConnect = async () => {
        setShowConfirmModal(false);
        if (isDuplicateConnectAttempt) {
            setIsDuplicateConnectAttempt(false);
            return;
        }
        setIsConnecting(true);
        try {
            await wait(900);
            if (isChangingConnectedBrand) {
                await applyBrandChange(selectedCameraPreset);
                onNavigate('Phone', {
                    initialStep: 2,
                    mode: 'new',
                    brand: selectedCameraPreset,
                    returnTo: 'Setcamera',
                    isHideSkipButton: true,
                });
                return;
            }
            const resolvedCameraId = await upsertCameraConfig({
                brand: selectedCameraPreset,
                aiConnectionStatus: 'online',
            });
            if (!resolvedCameraId) {
                Alert.alert('Connection failed', 'Unable to create/update camera in database.');
                setSelectedCameraPreset(null);
                setCommittedCameraBrand(null);
                animateSelection('');
                await updateCameraStatus('disconnected');
                await AsyncStorage.removeItem('camera_brand');
                await AsyncStorage.removeItem('camera_setup_complete');
                return;
            }
            const sourceReady = await ensureCameraSourceReady(resolvedCameraId);
            if (!sourceReady) {
                setSelectedCameraPreset(null);
                setCommittedCameraBrand(null);
                animateSelection('');
                await updateCameraStatus('disconnected');
                await AsyncStorage.removeItem('camera_brand');
                await AsyncStorage.removeItem('camera_setup_complete');
                return;
            }
            await updateCameraStatus('connected');
            await AsyncStorage.setItem('camera_brand', selectedCameraPreset);
            await AsyncStorage.setItem('camera_setup_complete', 'true');
            setCommittedCameraBrand(selectedCameraPreset);
            setIsUpdateMode(true);
            setLastScanAt(new Date());
            onNavigate('Phone', {
                initialStep: 2,
                mode: 'new',
                brand: selectedCameraPreset,
                returnTo: 'Setcamera',
                isHideSkipButton: true,
            });
        } catch (e) {
            console.error('Camera connection failed', e);
            setSelectedCameraPreset(null);
            setCommittedCameraBrand(null);
            animateSelection('');
            await AsyncStorage.removeItem('camera_brand');
            await AsyncStorage.removeItem('camera_setup_complete');
        } finally {
            setIsConnecting(false);
        }
    };

    const handleCancelConnect = () => {
        setShowConfirmModal(false);
        setIsDuplicateConnectAttempt(false);
        if (isChangingConnectedBrand && committedCameraBrand) {
            setSelectedCameraPreset(committedCameraBrand);
            animateSelection(committedCameraBrand);
        }
    };

    const resetSetupForNewCamera = async (targetCameraId = null) => {
        await AsyncStorage.multiRemove([
            'camera_monitoringMode',
            'camera_selectedCats',
            'camera_setup_complete',
            'camera_zone_summary',
            'camera_zone_feeding',
            'camera_zone_litter',
        ]);
        if (targetCameraId) {
            await clearCameraZonesInDb(targetCameraId);
        }
        setMonitoringMode('multi');
        setSelectedCats(myCats.map((cat) => cat.id));
        setZoneLabel(defaultZoneLabel);
        setIsUpdateMode(false);
        setPreviewFrameIndex(0);
    };

    const applyBrandChange = async (brandId) => {
        if (brandId === committedCameraBrand) return;
        animateSelection(brandId);
        successAnim.setValue(0);
        await updateCameraStatus("disconnected");
        await resetSetupForNewCamera(cameraId);
        await AsyncStorage.removeItem('camera_brand');
        setCommittedCameraBrand(null);
        await upsertCameraConfig({
            brand: brandId,
            aiConnectionStatus: 'offline',
        });
    };

    const handleSelectCameraBrand = (brandId) => {
        if (brandId === selectedCameraPreset) return;
        setSelectedCameraPreset(brandId);
        animateSelection(brandId);
    };

    const handleTestConnection = () => {
        // Test only refreshes an already connected camera. It must not create a new connection.
        if (cameraStatus === 'connected') {
            updateCameraStatus('connecting');
            setTimeout(() => updateCameraStatus('connected'), 800);
        } else {
            updateCameraStatus('disconnected');
        }
    };

    const toggleCatSelection = async (id) => {
        let newSelected = selectedCats;
        if (monitoringMode === 'single') {
            newSelected = [id];
        } else {
            if (selectedCats.includes(id)) {
                if (selectedCats.length > 1) {
                    newSelected = selectedCats.filter(catId => catId !== id);
                }
            } else {
                newSelected = [...selectedCats, id];
            }
        }
        setSelectedCats(newSelected);
        await AsyncStorage.setItem('camera_selectedCats', JSON.stringify(newSelected));
        if (cameraStatus === 'connected' && cameraId) {
            await syncCameraCatsAssignment(cameraId, newSelected);
        }
    };

    const handleModeChange = async (mode) => {
        if (myCats.length === 1 && mode !== 'single') {
            Alert.alert('Single-cat mode only', 'This account has one cat, so monitoring mode stays on Single Cat.');
            return;
        }
        setMonitoringMode(mode);
        await AsyncStorage.setItem('camera_monitoringMode', mode);
        if (cameraStatus === 'connected') {
            await upsertCameraConfig({ mode });
        }
        // Reset selection logic based on mode if needed
        if (mode === 'single') {
            if (myCats && myCats.length > 0) {
                const first = [myCats[0].id];
                setSelectedCats(first);
                await AsyncStorage.setItem('camera_selectedCats', JSON.stringify(first));
                if (cameraStatus === 'connected' && cameraId) {
                    await syncCameraCatsAssignment(cameraId, first);
                }
            } else {
                setSelectedCats([]);
            }
        }
    };

    return (
        <View style={{ flex: 1, backgroundColor: '#f5fffdff' }}>
            <StatusBar style="dark" translucent backgroundColor="transparent" />
            <LinearGradient
                colors={['#f5fffdff', '#f5fffdff']}
                style={{ flex: 1 }}
            >
                <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => onNavigate('Camera')} style={styles.backBtnStyle} activeOpacity={0.85}>
                            <Ionicons name="chevron-back" size={28} color="#333" />
                        </TouchableOpacity>
                        <View style={styles.titleContainer}>
                            <Text style={styles.headerTitle}>Camera Settings</Text>
                        </View>
                        <View style={styles.headerIconBtn} />
                    </View>

                    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                        {/* 1. Connection Status Banner */}
                        <View style={styles.card}>
                            <View style={styles.connectionHeader}>
                                <View style={styles.statusRow}>
                                    <View style={[styles.statusDot, {
                                        backgroundColor: cameraStatus === 'connected' ? '#4CAF50' :
                                            cameraStatus === 'connecting' ? '#FFB300' : '#F44336'
                                    }]} />
                                    <Text style={styles.sectionTitleWhite}>
                                        {cameraStatus === 'connected' ? 'Camera Connected' :
                                            cameraStatus === 'connecting' ? 'Connecting...' : 'Camera Disconnected'}
                                    </Text>
                                </View>
                                {/* Status Icon Top Right */}
                                <View style={[styles.statusIconBg, {
                                    backgroundColor: cameraStatus === 'connected' ? '#75c776ff' :
                                        cameraStatus === 'connecting' ? '#FFB300' : '#F44336'
                                }]}>
                                    <View style={[styles.statusIconBg,
                                    { backgroundColor: cameraStatus === 'connected' ? '#4CAF50' : cameraStatus === 'connecting' ? '#FFB300' : '#F44336' }
                                    ]}>
                                        <Ionicons name={cameraStatus === 'connected' ? "checkmark" : cameraStatus === "connecting" ? "sync" : "alert-outline"} size={16} color="#fff" />
                                    </View>
                                </View>
                            </View>

                            <Text style={styles.statusDesc}>
                                {cameraStatus === 'connected'
                                    ? 'Connection Health: Excellent \nSignal Strength: Strong'
                                    : cameraStatus === 'connecting'
                                        ? 'Establishing secure connection...'
                                        : 'No signal received from this camera\nPlease check the camera power and internet connection'
                                }
                            </Text>

                            <TouchableOpacity
                                style={[
                                    styles.actionButtonGray,
                                    cameraStatus === 'connected' && { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
                                    cameraStatus === 'connecting' && { opacity: 0.6 },
                                    cameraStatus === 'disconnected' && { opacity: 0.65 }
                                ]}
                                onPress={handleTestConnection}
                                disabled={cameraStatus === 'connecting' || cameraStatus !== 'connected'}
                            >
                                <Text style={[
                                    styles.actionButtonText,
                                    cameraStatus === 'connected' && { color: '#fff' }
                                ]}>
                                    {cameraStatus === 'connected' ? 'Refresh Signal' :
                                        cameraStatus === 'connecting' ? 'Connecting...' : 'Test Connection'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* 2. Live Preview */}
                        <View style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
                            <View style={styles.previewHeader}>
                                <Ionicons name="videocam-outline" size={18} color="#1C1C1E" style={{ marginRight: 8 }} />
                                <Text style={styles.sectionTitleWhite}>Live Preview</Text>
                            </View>

                            <View style={styles.previewContent}>
                                <DecorativeCatEars />
                                {/* Placeholder Image or Message */}
                                {cameraStatus === 'connected' ? (
                                    <View style={styles.previewConnectedWrap}>
                                        <Image
                                            source={PREVIEW_FRAMES[previewFrameIndex]}
                                            style={styles.previewImage}
                                            resizeMode="cover"
                                        />
                                        <View style={styles.zoneMarkerFixed}>
                                            <Text style={styles.zoneMarkerText}>{zoneLabel}</Text>
                                        </View>
                                        <Text style={styles.scanUpdateText}>
                                            Scan updated: {lastScanAt ? lastScanAt.toLocaleTimeString() : '--'}
                                        </Text>
                                    </View>
                                ) : (
                                    <View style={styles.previewPlaceholder}>
                                        <Text style={styles.errorText}>
                                            {cameraStatus === 'connecting' ? 'Connecting to camera...' : 'The camera in the litter box area has lost connection.'}
                                        </Text>
                                        <Text style={styles.errorSubText}>
                                            {cameraStatus === 'connecting' ? 'Please wait' : 'Health monitoring is temporarily paused.'}
                                        </Text>
                                    </View>
                                )}

                                <TouchableOpacity
                                    style={[
                                        styles.overlayButton,
                                        cameraStatus !== 'connected' && styles.overlayButtonDisabled
                                    ]}
                                    disabled={cameraStatus !== 'connected'}
                                    onPress={() => {
                                        onNavigate('Phone', {
                                            initialStep: 'zone_setup',
                                            mode: 'update',
                                            returnTo: 'Setcamera',
                                            brand: selectedCameraPreset,
                                        });
                                    }}
                                >
                                    <MaterialCommunityIcons
                                        name="crop-free"
                                        size={16}
                                        color={cameraStatus === 'connected' ? '#fff' : '#CBD5E1'}
                                        style={{ marginRight: 8 }}
                                    />
                                    <Text style={[
                                        styles.overlayButtonText,
                                        cameraStatus !== 'connected' && styles.overlayButtonTextDisabled
                                    ]}>
                                        {cameraStatus === 'connected' ? 'Edit Label Zones' : 'Detection locked'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* 3. Monitoring Mode */}
                        <View style={styles.card}>
                            <Text style={styles.sectionTitle}>Monitoring Mode</Text>

                            {/* Toggle Switch */}
                            <View style={styles.toggleContainer}>
                                <TouchableOpacity
                                    style={[styles.toggleBtn, monitoringMode === 'single' && styles.toggleBtnActive]}
                                    onPress={() => handleModeChange('single')}
                                >
                                    <Text style={[styles.toggleText, monitoringMode === 'single' && styles.toggleTextActive]}>Single Cat</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.toggleBtn, monitoringMode === 'multi' && styles.toggleBtnActive]}
                                    onPress={() => handleModeChange('multi')}
                                    disabled={myCats.length === 1}
                                >
                                    <Text style={[styles.toggleText, monitoringMode === 'multi' && styles.toggleTextActive, myCats.length === 1 && { color: '#94A3B8' }]}>Multi cat mode</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Cat Selection */}
                            <View style={styles.catSelectionRow}>
                                {myCats.map((cat) => (
                                    <TouchableOpacity
                                        key={cat.id}
                                        style={[styles.catItem, selectedCats.includes(cat.id) ? {} : { opacity: 0.5 }]}
                                        onPress={() => toggleCatSelection(cat.id)}
                                    >
                                        <View style={[styles.catAvatar, selectedCats.includes(cat.id) && styles.catAvatarSelected]}>
                                            {cat.image_url ? (
                                                <Image source={{ uri: cat.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                            ) : (
                                                <Image source={require('../../assets/cioncat.jpg')} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                            )}
                                        </View>
                                        <Text style={styles.catName}>{cat.name}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <View style={styles.infoRow}>
                                <Ionicons name="information-circle" size={14} color="#555" />
                                <Text style={styles.infoText}>Used when {monitoringMode} cats share the same camera</Text>
                            </View>
                        </View>

                        {/* 4. Camera Hardware Accordion */}
                        <View style={styles.card}>
                            <TouchableOpacity
                                style={styles.accordionHeader}
                                onPress={() => {
                                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                    setIsDropdownOpen(!isDropdownOpen);
                                }}
                                activeOpacity={0.7}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <MaterialCommunityIcons name="webcam" size={22} color="#26A69A" style={{ marginRight: 10 }} />
                                    <Text style={styles.sectionTitle}>Camera Hardware & Brand</Text>
                                </View>
                                <Ionicons name={isDropdownOpen ? "chevron-up" : "chevron-down"} size={20} color="#00695C" />
                            </TouchableOpacity>

                            {isDropdownOpen && (
                                <Animated.View style={styles.accordionContent}>
                                    <Text style={styles.label}>Select camera brand</Text>

                                    <View style={styles.brandCardStack}>
                                        {CAMERA_BRANDS.map((brand) => {
                                            const isSelected = selectedCameraPreset === brand.id;
                                            return (
                                                <Animated.View key={brand.id} style={{ transform: [{ scale: brandScales[brand.id] || 1 }] }}>
                                                    <TouchableOpacity
                                                        activeOpacity={0.9}
                                                        onPress={() => handleSelectCameraBrand(brand.id)}
                                                        style={[
                                                            styles.brandCardSmall,
                                                            isSelected && styles.brandCardSelected,
                                                        ]}
                                                    >
                                                        <View style={styles.brandHeader}>
                                                            <View style={[styles.brandIconBg, isSelected && { backgroundColor: '#B2DFDB' }]}>
                                                                <MaterialCommunityIcons
                                                                    name={brand.icon}
                                                                    size={20}
                                                                    color={isSelected ? "#004D40" : "#90A4AE"}
                                                                />
                                                            </View>
                                                            <View style={{ flex: 1, marginLeft: 12 }}>
                                                                <Text style={[styles.brandNameTitle, isSelected && { color: '#004D40' }]}>
                                                                    {brand.label}
                                                                </Text>
                                                                <Text style={styles.brandApiSub}>Connect to app</Text>
                                                            </View>
                                                            {isSelected && (
                                                                <Ionicons name="checkmark-circle" size={20} color="#00695C" />
                                                            )}
                                                        </View>
                                                    </TouchableOpacity>
                                                </Animated.View>
                                            );
                                        })}
                                    </View>

                                    {selectedCameraPreset === 'custom' && (
                                        <View style={styles.inputRow}>
                                            <MaterialCommunityIcons name="webcam" size={16} color="#555" style={{ marginRight: 8 }} />
                                            <TextInput
                                                style={styles.input}
                                                value={customCameraBrand}
                                                onChangeText={setCustomCameraBrand}
                                                placeholder="Type camera brand/model..."
                                                placeholderTextColor="#999"
                                            />
                                        </View>
                                    )}

                                    <TouchableOpacity
                                        style={[
                                            styles.actionButtonGray,
                                            { backgroundColor: '#00897B', borderColor: '#00897B' },
                                            !selectedCameraPreset && { backgroundColor: '#9CA3AF', borderColor: '#9CA3AF' }
                                        ]}
                                        onPress={handleConnectCamera}
                                        disabled={isConnecting || !selectedCameraPreset}
                                    >
                                        <Text style={[styles.actionButtonText, { color: '#fff' }]}>
                                            {isConnecting
                                                ? 'Connecting...'
                                                : !selectedCameraPreset
                                                    ? 'Select Camera First'
                                                    : isUpdateMode
                                                        ? 'Update Connection'
                                                        : 'Connect Camera'}
                                        </Text>
                                    </TouchableOpacity>

                                    <View style={styles.infoRow}>
                                        <Ionicons name="information-circle" size={14} color="#555" />
                                        <Text style={styles.infoText}>
                                            {cameraStatus === 'connected'
                                                ? 'Connected. If you change camera, setup will reset and camera signal will disconnect automatically.'
                                                : !selectedCameraPreset
                                                    ? 'Please select a camera hardware first.'
                                                    : 'Choose camera and connect with app. No API setup required.'}
                                        </Text>
                                    </View>
                                </Animated.View>
                            )}
                        </View>

                        {/* 5. Usage Note */}
                        <View style={styles.card}>
                            <Text style={styles.sectionTitle}>How To Use</Text>
                            <Text style={styles.statusDesc}>
                                1. Select your camera hardware in the Hardware section.
                                {'\n'}2. Tap Connect to open setup flow and verify live feed.
                                {'\n'}3. After connection, edit and update detection zones.
                                {'\n'}4. Use Test Connection only to refresh an already connected camera.
                            </Text>
                        </View>

                        <View style={{ height: 40 }} />
                    </ScrollView>

                    <Modal
                        transparent
                        visible={showConfirmModal}
                        animationType="fade"
                        onRequestClose={handleCancelConnect}
                    >
                        <View style={styles.confirmOverlay}>
                            <View style={styles.confirmCard}>
                                <Text style={styles.confirmTitle}>{confirmTitle}</Text>
                                <Text style={styles.confirmMessage}>{confirmMessage}</Text>
                                <View style={styles.confirmActions}>
                                    <TouchableOpacity
                                        style={styles.confirmCancelBtn}
                                        onPress={handleCancelConnect}
                                    >
                                        <Text style={styles.confirmCancelText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.confirmPrimaryBtn}
                                        onPress={handleConfirmConnect}
                                    >
                                        <Text style={styles.confirmPrimaryText}>Confirm</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Modal>
                    <Modal
                        transparent
                        visible={showSourceRequiredModal}
                        animationType="fade"
                        onRequestClose={() => setShowSourceRequiredModal(false)}
                    >
                        <View style={styles.confirmOverlay}>
                            <View style={styles.confirmCard}>
                                <Text style={styles.dangerModalTitle}>{sourceRequiredTitle}</Text>
                                <Text style={styles.dangerModalMessage}>{sourceRequiredMessage}</Text>
                                <View style={styles.confirmActions}>
                                    <TouchableOpacity
                                        style={styles.dangerModalButton}
                                        onPress={() => setShowSourceRequiredModal(false)}
                                    >
                                        <Text style={styles.dangerModalButtonText}>OK</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Modal>
                </SafeAreaView>
            </LinearGradient>
        </View>
    );
}

// ==============================================
// 3. Styles (สไตล์การตกแต่ง)
// ==============================================
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5fffdff',
    },
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
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#E5E5EA',
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerIconBtn: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'flex-end',
    },
    backBtnStyle: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    titleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
    },
    titleLogo: {
        fontSize: 20,
        fontFamily: 'Inter-Bold',
        color: '#00695C',
        marginHorizontal: 2,
    },
    headerTitle: {
        fontSize: 16,
        fontFamily: 'Inter-Bold',
        color: '#2F6A62',
        textAlign: 'center',
        flex: 1,
    },
    content: {
        padding: 12,
        paddingTop: 0,
    },
    // Cards
    card: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1.5,
        borderColor: '#E0F2F1',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
        overflow: 'hidden',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    sectionTitle: {
        color: '#1C1C1E',
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 10,
    },
    sectionTitleWhite: {
        color: '#1C1C1E',
        fontSize: 13,
        fontWeight: '700',
    },

    // Connection Status
    connectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 8,
    },
    statusIconBg: {
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    statusDesc: {
        color: '#3A3A3C',
        fontSize: 12,
        marginBottom: 16,
        lineHeight: 18,
    },
    actionButtonGray: {
        backgroundColor: '#EEF2FF',
        paddingVertical: 10,
        borderRadius: 999,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#D6E4FF'
    },
    actionButtonText: {
        color: '#1A56C5',
        fontWeight: '600',
    },

    // Live Preview
    previewHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        backgroundColor: '#F8FAFC'
    },
    previewContent: {
        height: 180,
        backgroundColor: '#ECEFF1',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        position: 'relative',
    },
    previewPlaceholder: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    previewConnectedWrap: {
        width: '100%',
        height: '100%',
    },
    previewImage: {
        width: '100%',
        height: '100%',
    },
    zoneMarkerFixed: {
        position: 'absolute',
        top: 24,
        left: 18,
        backgroundColor: 'rgba(0, 105, 92, 0.9)',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    zoneMarkerText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '700',
    },
    scanUpdateText: {
        position: 'absolute',
        right: 12,
        bottom: 56,
        color: '#FFFFFF',
        fontSize: 10,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 10,
    },
    confirmOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.28)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    confirmCard: {
        width: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        paddingHorizontal: 18,
        paddingTop: 18,
        paddingBottom: 14,
    },
    confirmTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#1C1C1E',
        marginBottom: 8,
    },
    confirmMessage: {
        fontSize: 13,
        color: '#4B5563',
        lineHeight: 19,
        marginBottom: 16,
    },
    confirmActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 10,
    },
    confirmCancelBtn: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: '#F5F5F5',
    },
    confirmCancelText: {
        color: '#374151',
        fontSize: 13,
        fontWeight: '600',
    },
    confirmPrimaryBtn: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: '#111827',
    },
    confirmPrimaryText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
    },
    dangerModalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#7F1D1D',
        marginBottom: 8,
    },
    dangerModalMessage: {
        fontSize: 13,
        color: '#111827',
        lineHeight: 19,
        marginBottom: 16,
    },
    dangerModalButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: '#111827',
    },
    dangerModalButtonText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
    },
    errorText: {
        color: '#374151',
        textAlign: 'center',
        fontSize: 12,
        fontWeight: '600',
    },
    errorSubText: {
        color: '#6B7280',
        textAlign: 'center',
        fontSize: 10,
        marginTop: 4,
    },
    overlayButton: {
        position: 'absolute',
        bottom: 16,
        backgroundColor: '#3C8FDD',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
    },
    overlayButtonDisabled: {
        backgroundColor: '#9CA3AF',
    },
    overlayButtonText: {
        color: '#fff',
        fontSize: 12,
    },
    overlayButtonTextDisabled: {
        color: '#E5E7EB',
    },
    // Monitoring Mode
    toggleContainer: {
        flexDirection: 'row',
        backgroundColor: '#F2F4F7',
        backgroundColor: '#E0F2F1',
        borderRadius: 20,
        padding: 4,
        marginBottom: 16,
    },
    toggleBtn: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 16,
    },
    toggleBtnActive: {
        backgroundColor: '#fff',
        backgroundColor: '#B2DFDB',
        elevation: 2
    },
    toggleText: {
        color: '#757575',
        color: '#00695C',
        fontSize: 12,
    },
    toggleTextActive: {
        color: '#00695C',
        color: '#004D40',
        fontWeight: 'bold',
    },
    catSelectionRow: {
        flexDirection: 'row',
        marginBottom: 16,
    },
    catItem: {
        alignItems: 'center',
        marginRight: 16,
    },
    catAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#ddd',
        marginBottom: 4,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: 'transparent',
    },
    catAvatarSelected: {
        borderColor: '#00695C',
        borderColor: '#26A69A',
    },
    catName: {
        color: '#333',
        fontSize: 12,
        fontWeight: '600'
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
    },
    infoText: {
        color: '#6D6D72',
        fontSize: 10,
        marginLeft: 6,
    },
    // Hardware
    label: {
        color: '#3A3A3C',
        fontSize: 12,
        marginTop: 8,
        marginBottom: 4,
        fontWeight: '600'
    },
    dropdownHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 8,
        paddingHorizontal: 12,
        height: 44,
    },
    dropdownHeaderText: {
        color: '#1F2937',
        fontSize: 12,
    },
    dropdownListContainer: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 8,
        marginTop: 4,
        overflow: 'hidden',
    },
    dropdownItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    dropdownItemText: {
        color: '#555',
        fontSize: 12,
    },
    dropdownItemTextSelected: {
        color: '#00695C',
        fontWeight: 'bold',
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 8,
        paddingHorizontal: 8,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB'
    },
    input: {
        flex: 1,
        height: 40,
        color: '#333',
        fontSize: 12,
    },
    copyButton: {
        backgroundColor: '#3C8FDD',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    copyText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
    },
    // Accordion Styles
    accordionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 4,
    },
    accordionContent: {
        marginTop: 15,
        borderTopWidth: 1,
        borderTopColor: '#F0F0F0',
        paddingTop: 15,
    },
    // Brand Card Styles
    brandCardStack: {
        gap: 10,
        marginBottom: 16,
    },
    brandCardSmall: {
        backgroundColor: "#fff",
        borderRadius: 13,
        padding: 10,
        borderWidth: 1.5,
        borderColor: "rgba(0,0,0,0.05)",
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 1,
    },
    brandCardSelected: {
        borderColor: "#00897B",
        backgroundColor: "#F4FAF9",
        borderColor: "#26A69A",
        backgroundColor: "#F0FAF9",
    },
    brandHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    brandIconBg: {
        width: 32,
        height: 32,
        borderRadius: 9,
        backgroundColor: '#F5F7FA',
        justifyContent: 'center',
        alignItems: 'center',
    },
    brandNameTitle: {
        fontSize: 13,
        fontWeight: "700",
        color: "#37474F",
        color: "#546E7A",
    },
    brandApiSub: {
        fontSize: 10,
        color: "#78909C",
        marginTop: 1,
    },
    loginButtonSmall: {
        marginTop: 12,
    },
    gradientBtnSmall: {
        paddingVertical: 8,
        borderRadius: 12,
        alignItems: "center",
        flexDirection: 'row',
        justifyContent: 'center',
    },
    loginTextSmall: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 13,
    },
    connectedBoxSmall: {
        marginTop: 12,
        padding: 10,
        borderRadius: 12,
        backgroundColor: "#E8F5E9",
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    connectedTextSmall: {
        color: "#1B5E20",
        fontWeight: "700",
        fontSize: 13,
    },
    brandActionLinks: {
        flexDirection: 'row',
        marginTop: 12,
        gap: 8,
        justifyContent: 'space-between',
    },
    brandActionLink: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        justifyContent: 'flex-start',
        paddingVertical: 8,
        backgroundColor: '#F0F4F4',
        paddingHorizontal: 12,
        backgroundColor: '#E8F5E9',
        borderRadius: 8,
        gap: 6,
    },
    brandActionText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#00695C',
        color: '#1B5E20',
    },
    // Cat Ear Styles
    earContainer: {
        position: 'absolute',
        top: -8,
        left: 12,
        right: 12,
        height: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        zIndex: -1,
    },
    ear: {
        width: 20,
        height: 16,
        backgroundColor: '#ECEFF1',
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
    },
    earLeft: {
        transform: [{ rotate: '-15deg' }],
    },
    earRight: {
        transform: [{ rotate: '15deg' }],
    },
});
