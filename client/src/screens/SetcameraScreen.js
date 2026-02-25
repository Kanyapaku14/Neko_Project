// ==============================================
// 1. ส่วนการนำเข้า Libraries และ Components (Imports)
// ==============================================
import React, { useState } from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, StyleSheet, ScrollView, Image, TextInput } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import supabase from './config/supabaseClient';
import { LinearGradient } from 'expo-linear-gradient'; // Import LinearGradient
import { Picker } from '@react-native-picker/picker';

import AsyncStorage from '@react-native-async-storage/async-storage';

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
    // State simulating connection status (Toggle for demo)
    const [isConnected, setIsConnected] = useState(true);

    // Monitoring Mode State
    const [monitoringMode, setMonitoringMode] = useState('multi'); // 'single' | 'multi'
    // Mock user cats
    const [myCats, setMyCats] = useState([]);
    const [selectedCats, setSelectedCats] = useState([]);

    // Hardware State
    const [selectedCameraPreset, setSelectedCameraPreset] = useState('tapo_c200');
    const [customCameraBrand, setCustomCameraBrand] = useState('');
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

                    if (mode) setMonitoringMode(mode);

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

    const toggleConnection = () => {
        setIsConnected(!isConnected);
    };

    const toggleCatSelection = async (id) => {
        let newSelected = selectedCats;
        if (monitoringMode === 'single') {
            newSelected = [id];
        } else {
            if (selectedCats.includes(id)) {
                // Prevent deselecting all if you want at least one?
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
                                <View style={[styles.statusDot, { backgroundColor: isConnected ? '#56b059ff' : '#F44336' }]} />
                                <Text style={styles.sectionTitleWhite}>
                                    {isConnected ? 'Camera Connected' : 'Camera Disconnected'}
                                </Text>
                            </View>
                            {/* Status Icon Top Right */}
                            <View style={[styles.statusIconBg, { backgroundColor: isConnected ? '#75c776ff' : '#F44336' }]}>
                                <Ionicons name={isConnected ? "refresh" : "alert-outline"} size={16} color="#fff" />
                            </View>
                        </View>

                        <Text style={styles.statusDesc}>
                            {isConnected
                                ? 'Connection Health: Excellent \nSignal Strength: Strong'
                                : 'No signal received from this camera\nPlease check the camera power and internet connection'
                            }
                        </Text>

                        <TouchableOpacity
                            style={styles.actionButtonGray}
                            onPress={toggleConnection}
                        >
                            <Text style={styles.actionButtonText}>Test Connection</Text>
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
                            {isConnected ? (
                                <View style={styles.previewPlaceholder}>
                                    <Ionicons name="image-outline" size={48} color="#ccc" />
                                </View>
                            ) : (
                                <View style={styles.previewPlaceholder}>
                                    <Text style={styles.errorText}>The camera in the litter box area has lost connection.</Text>
                                    <Text style={styles.errorSubText}>Health monitoring is temporarily paused.</Text>
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
                        <View style={styles.pickerContainer}>
                            <Picker
                                selectedValue={selectedCameraPreset}
                                onValueChange={(itemValue) => {
                                    setSelectedCameraPreset(itemValue);
                                }}
                                style={styles.picker}
                                mode="dropdown"
                                dropdownIconColor="#333"
                            >
                                {CAMERA_BRANDS.map((camera) => (
                                    <Picker.Item key={camera.value} label={camera.label} value={camera.value} />
                                ))}
                            </Picker>
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
    pickerContainer: {
        backgroundColor: '#fff',
        borderRadius: 8,
        overflow: 'hidden',
        marginBottom: 12,
        height: 40,
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#CFD8DC'
    },
    picker: {
        width: '100%',
        color: '#333',
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




