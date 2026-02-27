// ==============================================
// 1. ส่วนการนำเข้า Libraries และ Components (Imports)
// ==============================================
import React, { useState } from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, StyleSheet, ScrollView, Image, TextInput } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import supabase from './config/supabaseClient';
import { LinearGradient } from 'expo-linear-gradient'; // Import LinearGradient

import AsyncStorage from '@react-native-async-storage/async-storage';
import AlertEngine from '../services/AlertEngine'; // Global Alert Manager

const CAMERA_BRANDS = [
    { label: 'TP-Link Tapo C200', value: 'tapo_c200', api: 'Tapo Cloud API' },
    { label: 'Reolink E1 Pro', value: 'reolink_e1_pro', api: 'Reolink Local API' },
    { label: 'Hikvision DS-2CD', value: 'hikvision_ds_2cd', api: 'ISAPI' },
    { label: 'Neko Cam Gen 1', value: 'neko_cam_gen_1', api: 'Neko Device API' },
    { label: 'Other (Type manually)', value: 'custom', api: 'Manual API setup required' },
];
// ==============================================
// 2. Main Component (หน้าจอตั้งค่า)
// ==============================================
export default function SetcameraScreen({ onNavigate, session }) {
    // State simulating connection status
    const [streamUrl, setStreamUrl] = useState(null);
    const [lastSignal, setLastSignal] = useState(null);
    const [cameraStatus, setCameraStatus] = useState("disconnected"); // 'disconnected' | 'connecting' | 'connected'

    // Monitoring Mode State
    const [monitoringMode, setMonitoringMode] = useState('multi'); // 'single' | 'multi'
    // Mock user cats
    const [myCats, setMyCats] = useState([]);
    const [selectedCats, setSelectedCats] = useState([]);

    // Hardware State
    const [selectedCameraPreset, setSelectedCameraPreset] = useState('tapo_c200');
    const [customCameraBrand, setCustomCameraBrand] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const selectedCameraMeta = CAMERA_BRANDS.find((item) => item.value === selectedCameraPreset);
    const selectedCameraApi = selectedCameraMeta?.api || 'Manual API setup required';

    // Load initial settings and fetch cats
    React.useEffect(() => {
        const load = async () => {
            try {
                // Fetch real cats if session exists
                if (session?.user?.id) {
                    const { data: cats, error } = await supabase
                        .from('cats')
                        .select('*')
                        .eq('owner_id', session.user.id);

                    if (error) throw error;
                    setMyCats(cats || []);

                    // Load saved selection settings
                    const mode = await AsyncStorage.getItem('camera_monitoringMode');
                    const savedCatsJson = await AsyncStorage.getItem('camera_selectedCats');
                    const savedStatus = await AsyncStorage.getItem('camera_status');

                    if (mode) setMonitoringMode(mode);
                    if (savedStatus) setCameraStatus(savedStatus);

                    if (savedCatsJson) {
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

    const updateCameraStatus = async (status) => {
        setCameraStatus(status);
        await AsyncStorage.setItem('camera_status', status);

        // Global Alert Engine Triggers
        if (status === 'disconnected') {
            await AlertEngine.logEvent({
                type: 'camera_connection',
                severity: 'critical',
                title: 'Camera Disconnected',
                desc: 'Lost connection to Litter Box camera.',
                details: 'The camera feed cannot be established. Please check power or Wi-Fi.'
            });
        } else if (status === 'connected') {
            await AlertEngine.resolveActiveAlerts('camera_connection', {
                title: 'System Online',
                desc: 'Camera connection restored automatically.',
                details: 'All systems functioning normally.'
            });
        }
    };

    const handleTestConnection = () => {
        // Here you would eventually add your real frontend fetch/reconnect logic
        if (cameraStatus === 'disconnected') {
            updateCameraStatus('connecting');
            setTimeout(() => updateCameraStatus('connected'), 1500);
        } else if (cameraStatus === 'connected') {
            updateCameraStatus('connecting');
            setTimeout(() => updateCameraStatus('connected'), 800);
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
    };

    const handleModeChange = async (mode) => {
        setMonitoringMode(mode);
        await AsyncStorage.setItem('camera_monitoringMode', mode);
        // Reset selection logic based on mode if needed
        if (mode === 'single') {
            const first = [myCats[0].id];
            setSelectedCats(first);
            await AsyncStorage.setItem('camera_selectedCats', JSON.stringify(first));
        }
    };

    return (
        <LinearGradient
            colors={['#FFFFFF', '#95e4e4ff']} // Match CameraScreen Gradient
            style={{ flex: 1 }}
        >
            <SafeAreaView style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => onNavigate('Camera')} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color="#0C5A58" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Camera Settings</Text>
                    <View style={styles.backButton} />
                </View>

                <ScrollView contentContainerStyle={styles.content}>

                    {/* 1. Connection Status Banner */}
                    <View style={[styles.card, { backgroundColor: 'rgba(0,0,0,0.25)' }]}>
                        <View style={styles.connectionHeader}>
                            <View style={styles.statusRow}>
                                <View style={[styles.statusDot, {
                                    backgroundColor: cameraStatus === 'connected' ? '#56b059ff' :
                                        cameraStatus === 'connecting' ? '#FFC107' : '#F44336'
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
                                <Ionicons name={cameraStatus === 'connected' ? "checkmark" : cameraStatus === "connecting" ? "sync" : "alert-outline"} size={16} color="#fff" />
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
                                cameraStatus === 'connecting' && { opacity: 0.6 }
                            ]}
                            onPress={handleTestConnection}
                            disabled={cameraStatus === 'connecting'}
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
                    <View style={[styles.card, { padding: 0, overflow: 'hidden', backgroundColor: '#555' }]}>
                        <View style={styles.previewHeader}>
                            <Ionicons name="videocam-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                            <Text style={[styles.sectionTitleWhite, { color: '#fff' }]}>Live Preview</Text>
                        </View>

                        <View style={styles.previewContent}>
                            {/* Placeholder Image or Message */}
                            {cameraStatus === 'connected' ? (
                                <View style={styles.previewPlaceholder}>
                                    <Ionicons name="image-outline" size={48} color="#ccc" />
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
                                style={styles.overlayButton}
                                onPress={() => onNavigate('Phone', { initialStep: 'zone_setup' })}
                            >
                                <MaterialCommunityIcons name="crop-free" size={16} color="#fff" style={{ marginRight: 8 }} />
                                <Text style={styles.overlayButtonText}>Detection Zone Set</Text>
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
                            >
                                <Text style={[styles.toggleText, monitoringMode === 'multi' && styles.toggleTextActive]}>Multi cat mode</Text>
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

                    {/* 4. Camera Hardware */}
                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>Camera Hardware</Text>
                        <Text style={styles.label}>Camera brand (API compatible)</Text>
                        <View style={{ marginBottom: 12 }}>
                            <TouchableOpacity
                                style={styles.dropdownHeader}
                                onPress={() => setIsDropdownOpen(!isDropdownOpen)}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.dropdownHeaderText}>
                                    {selectedCameraMeta?.label || 'Select Camera'}
                                </Text>
                                <Ionicons name={isDropdownOpen ? "chevron-up" : "chevron-down"} size={20} color="#555" />
                            </TouchableOpacity>

                            {isDropdownOpen && (
                                <View style={styles.dropdownListContainer}>
                                    {CAMERA_BRANDS.map((camera, index) => (
                                        <TouchableOpacity
                                            key={camera.value}
                                            style={[
                                                styles.dropdownItem,
                                                index === CAMERA_BRANDS.length - 1 && { borderBottomWidth: 0 }
                                            ]}
                                            onPress={() => {
                                                if (selectedCameraPreset !== camera.value) {
                                                    setSelectedCameraPreset(camera.value);
                                                    setIsDropdownOpen(false);

                                                    // Reset states to prevent state sticking
                                                    setStreamUrl(null);
                                                    setLastSignal(null);
                                                    updateCameraStatus("disconnected");
                                                } else {
                                                    setIsDropdownOpen(false);
                                                }
                                            }}
                                        >
                                            <Text style={[
                                                styles.dropdownItemText,
                                                selectedCameraPreset === camera.value && styles.dropdownItemTextSelected
                                            ]}>
                                                {camera.label}
                                            </Text>
                                            {selectedCameraPreset === camera.value && (
                                                <Ionicons name="checkmark" size={18} color="#00695C" />
                                            )}
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
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

                        <View style={styles.infoRow}>
                            <Ionicons name="link-outline" size={14} color="#555" />
                            <Text style={styles.infoText}>API profile: {selectedCameraApi}</Text>
                        </View>
                        <Text style={styles.label}>Webhook Configuration</Text>
                        <View style={styles.inputRow}>
                            <Ionicons name="lock-closed-outline" size={16} color="#aaa" style={{ marginRight: 8 }} />
                            <TextInput
                                style={styles.input}
                                value="https://api.7917&t=URRbNgm9U8Q9IPFj-0"
                                editable={false}
                            />
                            <TouchableOpacity style={styles.copyButton}>
                                <Text style={styles.copyText}>COPY</Text>
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity style={styles.actionButtonGray}>
                            <Text style={styles.actionButtonText}>Update & Reconnect</Text>
                        </TouchableOpacity>

                        <View style={styles.infoRow}>
                            <Ionicons name="information-circle" size={14} color="#555" />
                            <Text style={styles.infoText}>Used for receiving camera events and AI detection signals</Text>
                        </View>
                    </View>

                    <View style={{ height: 40 }} />
                </ScrollView>
            </SafeAreaView>
        </LinearGradient>
    );
}

// ==============================================
// 3. Styles (สไตล์การตกแต่ง)
// ==============================================
const styles = StyleSheet.create({
    container: {
        flex: 1,
        // backgroundColor: '#fff', // Removed for gradient
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 16,
    },
    backButton: {
        width: 32,
    },
    headerTitle: {
        fontSize: 24, // Match CameraScreen
        fontWeight: 'bold',
        color: '#0C5A58', // Match CameraScreen
        textAlign: 'center',
        flex: 1,
    },
    content: {
        padding: 16,
        paddingTop: 0,
    },
    // Cards
    card: {
        backgroundColor: 'rgba(0, 0, 0, 0.25)', // Match CameraScreen Card Style
        borderWidth: 0.5,
        borderColor: '#898989',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        overflow: 'hidden',
    },
    sectionTitle: {
        color: '#FFFFFF', // Changed to White for contrast
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    sectionTitleWhite: {
        color: '#333', // Dark text for contrast on gray card
        fontSize: 16,
        fontWeight: 'bold',
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
        color: '#333', // Dark text
        fontSize: 12,
        marginBottom: 16,
        lineHeight: 18,
    },
    actionButtonGray: {
        backgroundColor: 'rgba(0,0,0,0.1)',
        paddingVertical: 12,
        borderRadius: 20,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#ddd'
    },
    actionButtonText: {
        color: '#333',
        fontWeight: '600',
    },

    // Live Preview
    previewHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: 'rgba(37, 40, 40, 0.1)'
    },
    previewContent: {
        height: 180,
        backgroundColor: '#abb2b1ff', // Placeholder bg
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    previewPlaceholder: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    errorText: {
        color: '#fff',
        textAlign: 'center',
        fontSize: 12,
        fontWeight: '600',
    },
    errorSubText: {
        color: '#eee',
        textAlign: 'center',
        fontSize: 10,
        marginTop: 4,
    },
    overlayButton: {
        position: 'absolute',
        bottom: 16,
        backgroundColor: 'rgba(70, 73, 73, 0.5)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
    },
    overlayButtonText: {
        color: '#fff',
        fontSize: 12,
    },

    // Monitoring Mode
    toggleContainer: {
        flexDirection: 'row',
        backgroundColor: '#CFD8DC', // Lighter gray for toggle bg
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
        backgroundColor: '#fff', // White active
        elevation: 2
    },
    toggleText: {
        color: '#757575',
        fontSize: 12,
    },
    toggleTextActive: {
        color: '#00695C',
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
        color: '#555',
        fontSize: 10,
        marginLeft: 6,
    },

    // Hardware
    label: {
        color: '#333',
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
        borderColor: '#CFD8DC',
        borderRadius: 8,
        paddingHorizontal: 12,
        height: 44,
    },
    dropdownHeaderText: {
        color: '#333',
        fontSize: 12,
    },
    dropdownListContainer: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#CFD8DC',
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
        borderColor: '#CFD8DC'
    },
    input: {
        flex: 1,
        height: 40,
        color: '#333',
        fontSize: 12,
    },
    copyButton: {
        backgroundColor: '#00695C',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    copyText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
    },
});




