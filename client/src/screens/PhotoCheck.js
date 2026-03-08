import React from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
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
                    paddingBottom: 40
                 }}
                showsVerticalScrollIndicator={false}
            >
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
                            style={{
                                width: '45%',
                                aspectRatio: 1,
                                backgroundColor: '#FFF',
                                borderRadius: 15,
                                borderStyle: 'dashed',
                                borderWidth: 2,
                                borderColor: '#00796B',
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
                                <Ionicons name="add" size={30} color="#B0BEC5" />
                            </View>
                            <Text style={{ fontSize: 12, color: '#00796B', fontWeight: '600' }}>Upload</Text>
                            <Text style={{ fontSize: 10, color: '#00796B' }}>Picture Body</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Info Text */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 25, paddingHorizontal: 10 }}>
                    <Ionicons name="information-circle" size={24} color="#546E7A" style={{ marginRight: 10 }} />
                    <Text style={{ fontSize: 12, color: '#546E7A', flex: 1 }}>
                        You can upload up to 4 images: an image of a body shape, a face, poop, and urine. AAA
                    </Text>
                </View>

                {/* Start AI Check Button */}
                <TouchableOpacity 
                    style={{
                        backgroundColor: '#00897B',
                        width: '100%',
                        paddingVertical: 18,
                        borderRadius: 30,
                        flexDirection: 'row',
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginTop: 25,
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.2,
                        shadowRadius: 5,
                        elevation: 5,
                    }}
                    onPress={handleStartAiCheck}
                >
                    <Ionicons name="paw" size={24} color="#80CBC4" style={{ marginRight: 10 }} />
                    <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold' }}>Start AI Check</Text>
                </TouchableOpacity>
            </ScrollView>
            <BottomNav 
                current="Home" 
                onNavigate={onNavigate} 
            />
        </SafeAreaView>
    );
}
