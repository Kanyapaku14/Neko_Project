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
import styles from "../styles/homeStyles";

const { width } = Dimensions.get('window');

const CAT_NEWS_POOL = [
    { id: 'n1', type: 'news', title: 'ไม่ใช่คลิป AI! น้องแมวสายสตรองโชว์งัด "ไมโครเวฟเครื่องใหม่เอี่ยม" ร่วงคาบ้าน', link: 'https://www.sanook.com/news/9866962/', image: 'https://images.unsplash.com/photo-1543852786-1cf6624b9987?q=80&w=800&auto=format&fit=crop' },
    { id: 'n2', type: 'news', title: 'อภิชาตแมว! เจ้าเหมียว "คิตตี้" ต่อสู้โจรปล้นบ้าน ปกป้องเจ้าของจนเกือบเอาชีวิตไม่รอด', link: 'https://www.sanook.com/news/9862010/', image: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?q=80&w=800&auto=format&fit=crop' },
    { id: 'n3', type: 'news', title: 'แม่ใช้คุ้มมาก! น้องแมว "ปิกาจู" โชว์สกิลปิดประตู ตรงบรีฟเป๊ะ...', link: 'https://www.sanook.com/news/9861854/', image: 'https://images.unsplash.com/photo-1495360010541-f48722b34f7d?q=80&w=800&auto=format&fit=crop' },
    { id: 'n4', type: 'news', title: 'เตือนทาสแมว! "4 ท่านอนสุดอันตราย" ที่คุณเห็นว่าน่ารัก แต่อาจเป็นสัญญาณ...', link: 'https://www.sanook.com/news/9857090/', image: 'https://images.unsplash.com/photo-1513245543132-31f507417b26?q=80&w=800&auto=format&fit=crop' },
    { id: 'n5', type: 'news', title: 'ทำไมไม่ถึงสักทีนะ? แมวเดินขึ้นบันไดเลื่อนผิดฝั่ง โชคดีมีหนุ่มใจดีเข้าช่วย', link: 'https://www.sanook.com/news/9847490/', image: 'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?q=80&w=800&auto=format&fit=crop' },
    { id: 'n6', type: 'news', title: 'มนุษย์เริ่มเลี้ยงแมวตั้งแต่เมื่อไหร่? เชื่อไหมว่าเลี้ยงมาเป็น "หมื่นปี"...', link: 'https://www.sanook.com/news/9848342/', image: 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?q=80&w=800&auto=format&fit=crop' }
];

export default function HomeScreen({ onAssess, onLogDaily, onSetting, onNavigate }) {
    const [activeCat, setActiveCat] = useState(null);
    const [lastCheckText, setLastCheckText] = useState("Not assessed yet");
    const [activeBannerIndex, setActiveBannerIndex] = useState(0);
    const [bannerData, setBannerData] = useState([]);

    const handleScroll = (event) => {
        const slideSize = event.nativeEvent.layoutMeasurement.width;
        const index = Math.floor(event.nativeEvent.contentOffset.x / slideSize);
        if (index !== activeBannerIndex) {
            setActiveBannerIndex(index);
        }
    };

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

        // Setup random banners
        const shuffled = [...CAT_NEWS_POOL].sort(() => 0.5 - Math.random());
        const selectedNews = shuffled.slice(0, 4);
        setBannerData(selectedNews);

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
                            Everything looks great todays!
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

                        {/* 3. Log Daily */}
                        <View style={styles.logCard}>
                            <View style={styles.logLeft}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                                    <Ionicons name="calendar-outline" size={20} color="#2D6A64" style={{ marginRight: 8 }} />
                                    <Text style={styles.logTitle}>Log Daily</Text>
                                </View>
                                <Text style={styles.logDesc}>Track your cat's daily activities and behaviors</Text>
                            </View>
                            <TouchableOpacity
                                style={styles.logBtn}
                                onPress={onLogDaily}
                            >
                                <Text style={styles.logBtnText}>Add Log</Text>
                            </TouchableOpacity>
                        </View>

                    </View>

                    {/* ===== Banner Carousel Section ===== */}
                    <View style={styles.bannerSectionContainer}>
                        <ScrollView
                            horizontal
                            pagingEnabled
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.bannerScrollContent}
                            onScroll={handleScroll}
                            scrollEventThrottle={16}
                            snapToInterval={342} // width (330) + marginRight (12)
                            decelerationRate="fast"
                        >
                            {bannerData.map((banner) => {
                                return (
                                    <TouchableOpacity
                                        key={banner.id}
                                        style={styles.bannerCard}
                                        activeOpacity={0.9}
                                        onPress={() => {
                                            if (banner.link) {
                                                Linking.openURL(banner.link).catch(err => console.error("Couldn't load page", err));
                                            }
                                        }}
                                    >
                                        <Image
                                            source={{ uri: banner.image }}
                                            style={styles.bannerImage}
                                            resizeMode="cover"
                                        />
                                        <LinearGradient
                                            colors={['transparent', 'rgba(0,0,0,0.8)']}
                                            style={styles.bannerGradient}
                                        >
                                            <Text style={styles.bannerTitle} numberOfLines={2}>
                                                {banner.title}
                                            </Text>
                                        </LinearGradient>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>

                        {/* Pagination Dots */}
                        <View style={styles.paginationContainer}>
                            {bannerData.map((_, index) => (
                                <View
                                    key={index}
                                    style={index === activeBannerIndex ? styles.paginationDotActive : styles.paginationDot}
                                />
                            ))}
                        </View>
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
