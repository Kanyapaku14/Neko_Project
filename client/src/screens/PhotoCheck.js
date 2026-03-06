import React, { useState, useEffect } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, StyleSheet, AppState } from 'react-native';
import HomeHeader from '../components/HomeHeader';
import BottomNav from '../components/BottomNav';
import styles from '../styles/homeStyles';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function PhotoCheck({ onNavigate }) {
    const [phoneCameraEnabled, setPhoneCameraEnabled] = useState(true);

    // Load camera permission state every time screen is focused / app becomes active
    const loadCameraState = async () => {
        const val = await AsyncStorage.getItem('phone_camera_enabled');
        setPhoneCameraEnabled(val === null ? true : val === 'true');
    };

    useEffect(() => {
        loadCameraState();

        // Re-check whenever app comes back to foreground (user toggled in Settings and returned)
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') loadCameraState();
        });
        return () => sub.remove();
    }, []);

    return (
        <SafeAreaView style={styles.container}>
            <HomeHeader
                profileImage={null}
                profileName={null}
                onSetting={() => onNavigate('UserInfo')}
            />

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                    padding: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexGrow: 1,
                    paddingBottom: 40
                }}
                showsVerticalScrollIndicator={false}
            >
                {/* Camera OFF Banner */}
                {!phoneCameraEnabled && (
                    <View style={localStyles.offBanner}>
                        <Ionicons name="camera-off-outline" size={18} color="#B91C1C" style={{ marginRight: 8 }} />
                        <Text style={localStyles.offBannerText}>
                            Phone camera is off — enable in Settings &gt; Phone Camera
                        </Text>
                    </View>
                )}

                {/* 2x2 Grid Container */}
                <View style={{
                    backgroundColor: '#B2DFDB',
                    borderRadius: 25,
                    padding: 15,
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 15,
                    width: '100%',
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.15,
                    shadowRadius: 10,
                    elevation: 5,
                }}>
                    {[1, 2, 3, 4].map((item) => (
                        <TouchableOpacity
                            key={item}
                            disabled={!phoneCameraEnabled}
                            activeOpacity={phoneCameraEnabled ? 0.7 : 1}
                            style={{
                                width: '45%',
                                aspectRatio: 1,
                                backgroundColor: phoneCameraEnabled ? '#FFF' : '#F1F5F9',
                                borderRadius: 15,
                                borderStyle: 'dashed',
                                borderWidth: 2,
                                borderColor: phoneCameraEnabled ? '#00796B' : '#CBD5E1',
                                justifyContent: 'center',
                                alignItems: 'center',
                            }}
                        >
                            <View style={{
                                backgroundColor: '#F0F4F8',
                                borderRadius: 8,
                                padding: 10,
                                marginBottom: 5
                            }}>
                                {phoneCameraEnabled
                                    ? <Ionicons name="add" size={30} color="#B0BEC5" />
                                    : <Ionicons name="lock-closed-outline" size={26} color="#94A3B8" />
                                }
                            </View>
                            <Text style={{ fontSize: 12, color: phoneCameraEnabled ? '#00796B' : '#94A3B8', fontWeight: '600' }}>
                                {phoneCameraEnabled ? 'Upload' : 'Locked'}
                            </Text>
                            <Text style={{ fontSize: 10, color: phoneCameraEnabled ? '#00796B' : '#94A3B8' }}>
                                {phoneCameraEnabled ? 'Picture Body' : 'Camera off'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Info Text */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 25, paddingHorizontal: 10 }}>
                    <Ionicons name="information-circle" size={24} color="#546E7A" style={{ marginRight: 10 }} />
                    <Text style={{ fontSize: 12, color: '#546E7A', flex: 1 }}>
                        You can upload up to 4 images: an image of a body shape, a face, poop, and urine.
                    </Text>
                </View>

                {/* Start AI Check Button */}
                <TouchableOpacity
                    disabled={!phoneCameraEnabled}
                    style={{
                        backgroundColor: phoneCameraEnabled ? '#00897B' : '#CBD5E1',
                        width: '100%',
                        paddingVertical: 18,
                        borderRadius: 30,
                        flexDirection: 'row',
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginTop: 25,
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: phoneCameraEnabled ? 4 : 0 },
                        shadowOpacity: phoneCameraEnabled ? 0.2 : 0,
                        shadowRadius: 5,
                        elevation: phoneCameraEnabled ? 5 : 0,
                    }}
                    onPress={() => phoneCameraEnabled && onNavigate('AnalysisResult')}
                >
                    {phoneCameraEnabled
                        ? <Ionicons name="paw" size={24} color="#80CBC4" style={{ marginRight: 10 }} />
                        : <Ionicons name="lock-closed-outline" size={20} color="#94A3B8" style={{ marginRight: 10 }} />
                    }
                    <Text style={{ color: phoneCameraEnabled ? '#FFF' : '#94A3B8', fontSize: 18, fontWeight: 'bold' }}>
                        {phoneCameraEnabled ? 'Start AI Check' : 'Camera is Off'}
                    </Text>
                </TouchableOpacity>
            </ScrollView>

            <BottomNav
                current="Home"
                onNavigate={onNavigate}
            />
        </SafeAreaView>
    );
}

const localStyles = StyleSheet.create({
    offBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEE2E2',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        marginBottom: 16,
        width: '100%',
        borderWidth: 1,
        borderColor: '#FECACA',
    },
    offBannerText: {
        fontSize: 12,
        color: '#B91C1C',
        fontWeight: '600',
        flex: 1,
    },
});
