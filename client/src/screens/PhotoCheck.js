import React, { useState } from 'react';
import {
    View, Text, SafeAreaView, ScrollView,
    TouchableOpacity, Image, Alert, ActivityIndicator,
} from 'react-native';
import HomeHeader from '../components/HomeHeader';
import BottomNav from '../components/BottomNav';
import styles from '../styles/homeStyles';
import { Ionicons } from '@expo/vector-icons';
import AlertEngine from '../services/AlertEngine';

export default function PhotoCheck({ onNavigate }) {
    const handleStartAiCheck = () => {
        AlertEngine.logEvent({
            type: 'photo_check_started',
            severity: 'info',
            title: 'Photo Check Started',
            desc: 'User started AI photo health screening.',
            dedupeKey: `photo_check_started:${new Date().toISOString().slice(0, 16)}`,
            cooldownMs: 45 * 1000,
        }).catch(() => {});
        onNavigate('AnalysisResult');
    };

    return (
        <SafeAreaView style={styles.container}>
            <HomeHeader
                profileImage={null}
                profileName={null}
                onNotify={() => onNavigate && onNavigate('Alert')}
                onSetting={() => onNavigate('UserInfo')}
            />

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                    padding: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexGrow: 1,
                    paddingBottom: 40,
                }}
                showsVerticalScrollIndicator={false}
            >
                {/* 2x2 Grid */}
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
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.15,
                    shadowRadius: 10,
                    elevation: 5,
                }}>
                    {PHOTO_SLOTS.map((slot, index) => (
                        <TouchableOpacity
                            key={slot.key}
                            onPress={() => handlePickImage(index)}
                            disabled={loading}
                            style={{
                                width: '45%',
                                aspectRatio: 1,
                                backgroundColor: phoneCameraEnabled ? '#FFF' : '#F1F5F9',
                                borderRadius: 15,
                                borderStyle: images[index] ? 'solid' : 'dashed',
                                borderWidth: 2,
                                borderColor: images[index] ? '#00897B' : '#00796B',
                                justifyContent: 'center',
                                alignItems: 'center',
                                overflow: 'hidden',
                            }}
                        >
                            {images[index] ? (
                                <>
                                    <Image
                                        source={{ uri: images[index] }}
                                        style={{ width: '100%', height: '100%', borderRadius: 13 }}
                                        resizeMode="cover"
                                    />
                                    <View style={{
                                        position: 'absolute',
                                        bottom: 0, left: 0, right: 0,
                                        backgroundColor: 'rgba(0,0,0,0.45)',
                                        paddingVertical: 5,
                                        alignItems: 'center',
                                    }}>
                                        <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '600' }}>{slot.label}</Text>
                                    </View>
                                </>
                            ) : (
                                <>
                                    <View style={{
                                        backgroundColor: '#F0F4F8',
                                        borderRadius: 8,
                                        padding: 10,
                                        marginBottom: 5,
                                    }}>
                                        <Ionicons name="add" size={30} color="#B0BEC5" />
                                    </View>
                                    <Text style={{ fontSize: 12, color: '#00796B', fontWeight: '600' }}>Upload</Text>
                                    <Text style={{ fontSize: 10, color: '#00796B' }}>{slot.label}</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Info */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 25, paddingHorizontal: 10 }}>
                    <Ionicons name="information-circle" size={24} color="#546E7A" style={{ marginRight: 10 }} />
                    <Text style={{ fontSize: 12, color: '#546E7A', flex: 1 }}>
                        You can upload up to 4 images: an image of a body shape, a face, poop, and vomit.
                    </Text>
                </View>

                {/* Start AI Check Button */}
                <TouchableOpacity
                    style={{
                        backgroundColor: loading ? '#80CBC4' : '#00897B',
                        width: '100%',
                        paddingVertical: 18,
                        borderRadius: 30,
                        flexDirection: 'row',
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginTop: 25,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.2,
                        shadowRadius: 5,
                        elevation: phoneCameraEnabled ? 5 : 0,
                    }}
                    onPress={handleStartAiCheck}
                >
                    {loading ? (
                        <ActivityIndicator color="#FFF" style={{ marginRight: 10 }} />
                    ) : (
                        <Ionicons name="paw" size={24} color="#80CBC4" style={{ marginRight: 10 }} />
                    )}
                    <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold' }}>
                        {loading ? 'กำลังอัปโหลด...' : 'Start AI Check'}
                    </Text>
                </TouchableOpacity>
            </ScrollView>

            <BottomNav current="Home" onNavigate={onNavigate} />
        </SafeAreaView>
    );
}


