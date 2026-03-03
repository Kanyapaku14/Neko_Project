import React, { useState, useEffect } from "react";
import BottomNav from "../components/BottomNav";
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    SafeAreaView,
    Image,
    ImageBackground,
    DeviceEventEmitter,
    Dimensions,
    Linking
} from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import supabase from "../screens/config/supabaseClient";
import { Ionicons } from "@expo/vector-icons";
import HomeHeader from "../components/HomeHeader";
import Paw from "../components/Paw";
import styles from "../styles/homeStylesOld";



export default function HomeScreenNew({ onAssess, onLogDaily, onSetting, onNavigate }) {
    const [activeCat, setActiveCat] = useState(null);
    const [lastCheckText, setLastCheckText] = useState("Not assessed yet");

    useEffect(() => {
        const fetchLastAssessment = async (catId) => {
            if (!catId) return;
            try {
                const { data, error } = await supabase
                    .from('assessments')
                    .select('created_at')
                    .eq('cat_id', catId)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (data && data.length > 0) {
                    const lastDate = new Date(data[0].created_at);
                    const today = new Date();
                    const diffTime = Math.abs(today - lastDate);
                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                    if (diffDays === 0) {
                        setLastCheckText("Last check today");
                    } else if (diffDays === 1) {
                        setLastCheckText("Last check 1 day ago");
                    } else {
                        setLastCheckText(`Last check ${diffDays} days ago`);
                    }
                } else {
                    setLastCheckText("Not assessed yet");
                }
            } catch (err) {
                console.log("Error fetching last assessment:", err);
                setLastCheckText("Not assessed yet");
            }
        };

        const fetchActiveCat = async () => {
            try {
                const storedCatId = await AsyncStorage.getItem('selectedCatId');
                if (storedCatId) {
                    const { data, error } = await supabase
                        .from('cats')
                        .select('*')
                        .eq('id', storedCatId)
                        .single();

                    if (data) {
                        setActiveCat(data);
                        fetchLastAssessment(data.id);
                    }
                }
            } catch (error) {
                console.error('Error fetching active cat:', error);
            }
        };

        fetchActiveCat();

        const subscription = DeviceEventEmitter.addListener('catChanged', (cat) => {
            setActiveCat(cat);
            if (cat && cat.id) {
                fetchLastAssessment(cat.id);
            } else {
                setLastCheckText("Not assessed yet");
            }
        });



        return () => {
            subscription.remove();
        };
    }, []);

    return (
        <LinearGradient
            colors={['#FFFFFF', '#B2E1DB']}
            locations={[0.42, 1]}
            style={styles.container}
        >
            <SafeAreaView style={{ flex: 1 }}>
                <Paw />
                {/* ===== Header ===== */}
                <HomeHeader
                    profileImage={null}
                    profileName={null}
                    onSetting={onSetting} // Link setting
                />

                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingBottom: 100 }} // Space for bottom nav
                    showsVerticalScrollIndicator={false}
                >

                    {/* 1. ส่วนรูปแมว (แยกออกมาแล้ว) */}
                    <View style={{ alignItems: 'center', marginTop: 20, marginBottom: 10 }}>
                        <View style={styles.circleCatContainer}>
                            <Image
                                source={activeCat?.image_url ? { uri: activeCat.image_url } : require('../../assets/cioncat.jpg')}
                                style={styles.circleCat}
                            />
                            <View style={styles.loveIcon}>
                                <Ionicons name="heart" size={20} color="#FFF" />
                            </View>
                        </View>
                    </View>

                    {/* 2. ส่วนข้อความ (Hero Section เดิม เหลือแค่ Text) */}
                    <View style={styles.heroSection}>
                        <Text style={styles.heroTitle}>
                            Welcome to NekoCare
                        </Text>
                        <Text style={styles.heroSubtitle}>
                            Your cat profile is ready.{"\n"}Let's start the first health check.
                        </Text>

                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                            <Ionicons name="time-outline" size={14} color="#A0AEC0" />
                            <Text style={styles.lastCheckText}> {lastCheckText}</Text>
                        </View>
                    </View>

                    {/* ===== Action Buttons ===== */}
                    <View style={styles.actionContainer}>
                        {/* 1. Assess Health Risk */}
                        <TouchableOpacity
                            style={styles.assessButton}
                            onPress={onAssess}
                            activeOpacity={0.85}
                        >
                            <Ionicons name="medical-outline" size={24} color="#FFF" />
                            <Text style={styles.assessButtonText}>Assess Health Risk</Text>
                        </TouchableOpacity>

                        {/* 2. Photo Health Check */}
                        <View style={styles.photoCard}>
                            <View style={styles.photoLeft}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                                    <Ionicons name="camera-outline" size={20} color="#2D6A64" style={{ marginRight: 8 }} />
                                    <Text style={styles.photoTitle}>Photo Health Check</Text>
                                </View>
                                <Text style={styles.photoDesc}>Take a photo to screen your cat's health risk</Text>
                            </View>
                            <TouchableOpacity
                                style={styles.photoBtn}
                                onPress={() => onNavigate('PhotoCheck')}
                            >
                                <Text style={styles.photoBtnText}>Start Assessment</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* ===== 3. GETTING STARTED TIMELINE ===== */}
                    <View style={styles.gettingStartedSection}>
                        <Text style={styles.gettingStartedTitle}>Getting Started</Text>

                        {/* Item 1: Cat profile completed */}
                        <View style={styles.timelineContainer}>
                            <View style={styles.timelineCheck}>
                                <Ionicons name="checkmark" size={16} color="#FFF" />
                            </View>
                            <View style={styles.timelineLine} />
                            <Text style={styles.timelineText}>Cat profile completed</Text>
                        </View>

                        {/* Item 2: First health assessment */}
                        <View style={styles.timelineContainer}>
                            <View style={styles.timelineEmpty} />
                            <View style={styles.timelineLine} />
                            <Text style={styles.timelineText}>First health assessment</Text>
                        </View>

                        {/* Item 3: Daily monitoring */}
                        <View style={styles.timelineContainer}>
                            <View style={styles.timelineEmpty} />
                            <Text style={styles.timelineText}>Daily monitoring</Text>
                        </View>
                    </View>

                    {/* ===== 4. SMART MONITORING CARD ===== */}
                    <View style={styles.smartMonitoringCard}>
                        <View style={styles.smartMonLeft}>
                            <Text style={styles.smartMonTitle}>Smart Monitoring</Text>
                            <Text style={styles.smartMonDesc}>Connect your camera to track daily activity{"\n"}and litter behavior</Text>
                        </View>
                        <TouchableOpacity style={styles.smartMonBtn}>
                            <Text style={styles.smartMonBtnText}>Set up camera 🐾</Text>
                        </TouchableOpacity>
                    </View>

                </ScrollView>

                {/* ===== Bottom Nav ===== */}
                <BottomNav
                    current="Home"
                    onNavigate={onNavigate}
                />
            </SafeAreaView>
        </LinearGradient>
    );
}
