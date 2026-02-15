import React, { useState, useEffect } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import supabase from './config/supabaseClient';
import BottomNav from '../components/BottomNav';

export default function AnalysisResult({ onNavigate, session }) {
    const [dailyLog, setDailyLog] = useState(null);
    const [loading, setLoading] = useState(true);
    const [catId, setCatId] = useState(null);

    useEffect(() => {
        if (session?.user?.id) {
            fetchCatAndLog();
        }
    }, [session]);

    const fetchCatAndLog = async () => {
        try {
            setLoading(true);
            
            // 1. Fetch Cat ID first (standard pattern in this app)
            const { data: catData, error: catError } = await supabase
                .from('cats')
                .select('id')
                .eq('owner_id', session.user.id)
                .limit(1)
                .single();

            if (catError) throw catError;
            if (!catData) return;

            setCatId(catData.id);

            // 2. Fetch Daily Log using local date ถ้ากรอกlog วันนี้มันจะขึ้น
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const localDateString = `${year}-${month}-${day}`;

            const { data: logData, error: logError } = await supabase
                .from('daily_logs')
                .select('*')
                .eq('cat_id', catData.id)
                .eq('log_date', localDateString)
                .maybeSingle();

            if (logData) {
                setDailyLog(logData);
            }
        } catch (err) {
            console.log("Error fetching analysis data:", err);
            // Don't alert here to avoid annoying the user if they're offline, 
            // the UI handles null log state.
        } finally {
            setLoading(false);
        }
    };

    const formatDate = () => {
        const d = new Date();
        const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF' }}>
            {/* Custom Header */}
            <View style={{ 
                flexDirection: 'row', 
                alignItems: 'center', 
                paddingHorizontal: 20, 
                paddingVertical: 15,
                backgroundColor: '#FFF'
            }}>
                <TouchableOpacity onPress={() => onNavigate('PhotoCheck')} style={{ padding: 5 }}>
                    <Ionicons name="chevron-back" size={28} color="#2D3748" />
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: 'center', marginRight: 33 }}>
                    <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#2D3748' }}>Analysis Result</Text>
                </View>
            </View>

            <ScrollView 
                style={{ flex: 1 }} 
                contentContainerStyle={{ flexGrow: 1 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Image Section */}
                <View style={{ padding: 20, backgroundColor: '#FFF' }}>
                    <View style={{ position: 'relative' }}>
                        <Image 
                            source={require('../../assets/makky.jpg')} 
                            style={{ width: '100%', height: 280, borderRadius: 20 }}
                        />
                        {/* Mock Scan Box */}
                        <View style={{ 
                            position: 'absolute', 
                            top: 20, left: 20, right: 20, bottom: 60, 
                            borderWidth: 2, 
                            borderColor: '#81C784', 
                            borderRadius: 10 
                        }} />
                        {/* Scan Badge */}
                        <View style={{ 
                            position: 'absolute', 
                            bottom: 70, 
                            alignSelf: 'center',
                            backgroundColor: 'rgba(45, 55, 72, 0.8)',
                            paddingHorizontal: 15,
                            paddingVertical: 5,
                            borderRadius: 20,
                            flexDirection: 'row',
                            alignItems: 'center'
                        }}>
                            <Ionicons name="color-filter" size={14} color="#66BB6A" style={{ marginRight: 5 }} />
                            <Text style={{ color: '#FFF', fontSize: 10 }}>Scan Complete</Text>
                        </View>
                    </View>

                    {/* Status Badge */}
                    <View style={{ 
                        backgroundColor: '#C8E6C9', 
                        alignSelf: 'center', 
                        paddingHorizontal: 20, 
                        paddingVertical: 8, 
                        borderRadius: 20, 
                        marginTop: -20,
                        flexDirection: 'row',
                        alignItems: 'center',
                        zIndex: 10
                    }}>
                        <Ionicons name="checkmark-circle" size={18} color="#43A047" style={{ marginRight: 5 }} />
                        <Text style={{ color: '#43A047', fontWeight: 'bold', fontSize: 12 }}>SIGNAL STRENGTH: HIGH</Text>
                    </View>

                    <Text style={{ fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginTop: 20, color: '#1A202C' }}>
                        Ideal Condition
                    </Text>
                    <Text style={{ textAlign: 'center', color: '#718096', fontSize: 12, marginTop: 5 }}>
                        Based on spinal curvature and rib visibility analysis.
                    </Text>
                </View>

                {/* Daily Log Section */}
                <View style={{ 
                    backgroundColor: '#B2E1DB', 
                    padding: 20, 
                    borderTopLeftRadius: 30, 
                    borderTopRightRadius: 30, 
                    marginTop: 10,
                    flex: 1,
                    paddingBottom: 100 // Padding for BottomNav
                }}>
                    <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#2D3748' }}>{formatDate()}</Text>
                    <Text style={{ fontSize: 13, color: '#4A5568', marginTop: 5 }}>Daily health check-in record</Text>

                    {loading ? (
                        <ActivityIndicator size="small" color="#00796B" style={{ marginTop: 40 }} />
                    ) : dailyLog ? (
                        <>
                            {/* Food and Water Row */}
                            <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255, 255, 255, 0.5)', borderRadius: 20, padding: 20, marginTop: 20 }}>
                                <View style={{ flex: 1, borderRightWidth: 1, borderColor: '#A0AEC0' }}>
                                    <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#2D6A64' }}>FOOD</Text>
                                    <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#FFF' }}>{dailyLog.food_intake || 0} g</Text>
                                </View>
                                <View style={{ flex: 1, paddingLeft: 20 }}>
                                    <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#2D6A64' }}>WATER</Text>
                                    <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#FFF' }}>{dailyLog.water_level || 0} ml</Text>
                                </View>
                            </View>

                            {/* Urine and Stool Row */}
                            <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.5)', borderRadius: 20, padding: 20, marginTop: 15 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                                    <View style={{ width: 30 }}><Ionicons name="water" size={20} color="#00ACC1" /></View>
                                    <Text style={{ color: '#2D3748' }}>Urine: <Text style={{ fontWeight: 'bold' }}>{dailyLog.urine_level_enum || 'Normal'}</Text></Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <View style={{ width: 30 }}><Ionicons name="help-circle" size={20} color="#00ACC1" /></View>
                                    <Text style={{ color: '#2D3748' }}>Stool: <Text style={{ fontWeight: 'bold' }}>{dailyLog.stool_level_enum || 'Normal'}</Text></Text>
                                </View>
                            </View>
                        </>
                    ) : (
                        <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.3)', borderRadius: 20, padding: 30, marginTop: 20, alignItems: 'center' }}>
                            <Ionicons name="calendar-outline" size={40} color="#00796B" />
                            <Text style={{ marginTop: 10, color: '#00796B', fontWeight: 'bold' }}>No Log Data for Today</Text>
                        </View>
                    )}

                    {/* Analyzation Button */}
                    <TouchableOpacity 
                        style={{
                            backgroundColor: '#00D18F',
                            borderRadius: 30,
                            paddingVertical: 18,
                            flexDirection: 'row',
                            justifyContent: 'center',
                            alignItems: 'center',
                            marginTop: 30,
                            shadowColor: "#000",
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.2,
                            shadowRadius: 5,
                            elevation: 5,
                        }}
                    >
                        <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold' }}>Analyzation</Text>
                        <Ionicons name="arrow-forward" size={22} color="#FFF" style={{ marginLeft: 10 }} />
                    </TouchableOpacity>
                </View>
            </ScrollView>

            <BottomNav current="Home" onNavigate={onNavigate} />
        </SafeAreaView>
    );
}
