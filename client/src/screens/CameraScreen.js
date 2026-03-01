import React, { useRef, useEffect, useState, useContext } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  Easing,
  Image,
  Modal,
  FlatList
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import supabase from './config/supabaseClient';

import BottomNav from '../components/BottomNav';
import useCameraData from '../hooks/useCameraData';
import ActivityLevelChart from '../components/ActivityLevelChart';
import AlertEngine, { AlertEvents } from '../services/AlertEngine';
import PendingIdentityBanner from '../components/alert/PendingIdentityBanner';
import { GlobalAlertQueueContext } from '../services/GlobalAlertQueue';

const { width } = Dimensions.get('window');

// Create animated components
const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export default function CameraScreen({ onNavigate, session }) {
  const [showSetupIntro, setShowSetupIntro] = useState(null); // null | true | false
  const [cameraStatus, setCameraStatus] = useState('disconnected');
  const { data } = useCameraData(session, cameraStatus);
  const [currentCamera, setCurrentCamera] = useState(1);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [hasCriticalAlert, setHasCriticalAlert] = useState(false);
  const [pendingIdentityCount, setPendingIdentityCount] = useState(0);
  const [cats, setCats] = useState([]);
  const [selectedCat, setSelectedCat] = useState(null);
  const [showCatSwitcher, setShowCatSwitcher] = useState(false);
  const [environment, setEnvironment] = useState({ temperature: 25.4, humidity: 58 });
  const [proStats, setProStats] = useState({ ping: 42, bitrate: 1.2, fps: 30 });

  // Animations
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const entryAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Retrieve global queue context to open manual queue
  const { openPendingQueue } = useContext(GlobalAlertQueueContext);

  // Entry Animation
  useEffect(() => {
    Animated.timing(entryAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
      easing: Easing.out(Easing.exp),
    }).start();
  }, []);

  // Pulse Animation for Live Status
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.6, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true })
      ])
    ).start();
  }, []);

  // Animation for sticky banner
  useEffect(() => {
    if (hasCriticalAlert) {
      Animated.spring(bannerAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 40
      }).start();
    } else {
      Animated.timing(bannerAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [hasCriticalAlert]);

  // Subscribe to AlertEngine
  useEffect(() => {
    // Initial load
    setUnreadAlerts(AlertEngine.getUnreadCount());
    setHasCriticalAlert(AlertEngine.hasActiveCritical());
    setPendingIdentityCount(AlertEngine.getPendingIdentityCount());

    const handler = (data) => {
      setUnreadAlerts(data.unreadCount);
      setHasCriticalAlert(data.hasCritical);
      setPendingIdentityCount(AlertEngine.getPendingIdentityCount());
    };

    AlertEngine.on(AlertEvents.UPDATED, handler);
    return () => AlertEngine.off(AlertEvents.UPDATED, handler);
  }, []);

  useEffect(() => {
    const fetchStatusAndSetup = async () => {
      try {
        // Check for setup completion to prevent setup loop
        const hasSetup = await AsyncStorage.getItem('camera_setup_complete');
        setShowSetupIntro(prev => {
          const shouldShow = hasSetup !== 'true';
          // Prevent unnecessary re-renders if the value is the same
          return (prev === null || prev !== shouldShow) ? shouldShow : prev;
        });

        // Check for camera connection status
        const storedStatus = await AsyncStorage.getItem('camera_status');
        if (storedStatus) {
          setCameraStatus((prev) => (prev !== storedStatus ? storedStatus : prev));
        }
      } catch (e) {
        console.error("Failed to fetch status from storage:", e);
      }
    };

    fetchStatusAndSetup();

    const interval = setInterval(fetchStatusAndSetup, 2000);
    return () => clearInterval(interval);
  }, []);

  // Simulate environment data from camera stream
  useEffect(() => {
    let interval;
    if (cameraStatus === 'connected') {
      interval = setInterval(() => {
        setEnvironment(prev => {
          const tempChange = (Math.random() * 0.4) - 0.2;
          let newTemp = prev.temperature + tempChange;
          if (newTemp > 30) newTemp = 30;
          if (newTemp < 22) newTemp = 22;

          const humChange = Math.floor(Math.random() * 3) - 1;
          let newHum = prev.humidity + humChange;
          if (newHum > 70) newHum = 70;
          if (newHum < 40) newHum = 40;

          return { temperature: newTemp, humidity: newHum };
        });

        setProStats(prev => {
          const newPing = Math.max(12, Math.min(120, prev.ping + (Math.floor(Math.random() * 15) - 7)));
          const newBitrate = Math.max(0.5, Math.min(4.5, prev.bitrate + (Math.random() * 0.4 - 0.2)));
          const newFps = Math.max(24, Math.min(30, prev.fps + (Math.floor(Math.random() * 3) - 1)));
          return { ping: newPing, bitrate: newBitrate, fps: newFps };
        });
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [cameraStatus]);

  // Fetch Cats for Switcher
  useEffect(() => {
    const fetchCats = async () => {
      if (session?.user?.id) {
        const { data } = await supabase
          .from('cats')
          .select('*')
          .eq('owner_id', session.user.id);

        if (data && data.length > 0) {
          setCats(data);
          const lastCatId = await AsyncStorage.getItem('last_selected_cat_id');
          const found = data.find(c => c.id === lastCatId);
          setSelectedCat(found || data[0]);
        }
      }
    };
    fetchCats();
  }, [session]);

  const handleSelectCat = async (cat) => {
    setSelectedCat(cat);
    setShowCatSwitcher(false);
    await AsyncStorage.setItem('last_selected_cat_id', cat.id);
  };

  const toggleCamera = () => {
    // Return to the Phone intro/setup page
    onNavigate('Phone', { initialStep: 'intro' });
  };

  // Button Press Animation Helper
  const ButtonScale = ({ children, onPress, style }) => {
    const scaleValue = useRef(new Animated.Value(1)).current;

    const onPressIn = () => {
      Animated.spring(scaleValue, { toValue: 0.95, useNativeDriver: true }).start();
    };
    const onPressOut = () => {
      Animated.spring(scaleValue, { toValue: 1, useNativeDriver: true }).start();
    };

    return (
      <AnimatedTouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[style, { transform: [{ scale: scaleValue }] }]}
      >
        {children}
      </AnimatedTouchableOpacity>
    );
  };

  if (!data) return null;
  // --- Render Functions ---

  const CameraSetupIntro = ({ onSetup, onMaybeLater }) => {
    const FeatureItem = ({ icon, title, subtitle }) => (
      <View style={styles.introFeatureItem}>
        <View style={styles.introFeatureIcon}>
          <MaterialCommunityIcons name={icon} size={24} color="#0C5A58" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.introFeatureTitle}>{title}</Text>
          <Text style={styles.introFeatureSubtitle}>{subtitle}</Text>
        </View>
      </View>
    );

    return (
      <LinearGradient colors={['#F4FAF9', '#E0F2F1']} style={styles.introContainer}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.introHeader}>
            <TouchableOpacity onPress={onMaybeLater} style={styles.introBackButton}>
              <Ionicons name="chevron-back" size={24} color="#2F6A62" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.introScrollContent}>
            <View style={styles.introHero}>
              <Image
                source={require('../../assets/cover-blog-3.jpg')}
                style={styles.introImage}
                resizeMode="cover"
              />
            </View>
            <Text style={styles.introTitle}>Connect Your Camera</Text>
            <Text style={styles.introSubtitle}>Unlock AI-powered insights into your cat's health, behavior, and daily routines.</Text>

            <View style={[styles.introFeatureList, { marginTop: 20 }]}>
              <FeatureItem icon="run-fast" title="Activity Tracking" subtitle="Know when they eat, drink, or use the litter box." />
              <FeatureItem icon="shield-check-outline" title="Health Alerts" subtitle="Get notified of unusual patterns or potential issues." />
            </View>

            <TouchableOpacity style={styles.introPrimaryButton} onPress={onSetup}>
              <Text style={styles.introPrimaryButtonText}>Start Setup</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onMaybeLater} style={{ marginTop: 16 }}>
              <Text style={styles.introSkipText}>Maybe Later</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    );
  };

  if (showSetupIntro === null || !data) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4FAF9' }}>
        <ActivityIndicator size="large" color="#00695C" />
      </View>
    );
  }

  if (showSetupIntro) {
    return <CameraSetupIntro onSetup={() => onNavigate('Phone')} onMaybeLater={() => onNavigate('Home')} />;
  }

  const modeDisplay = data.settings?.monitoringMode
    ? data.settings.monitoringMode.charAt(0).toUpperCase() + data.settings.monitoringMode.slice(1)
    : 'Multi';
  const selectedCatsCount = data.settings?.selectedCats?.length ?? 0;
  const householdCatsCount = selectedCatsCount > 0 ? selectedCatsCount : data.cats;

  // Interpolate entry animation
  const translateY = entryAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [50, 0]
  });
  const opacity = entryAnim;

  return (
    <LinearGradient colors={['#F4FAF9', '#E0F2F1']} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>

          {/* Header */}
          <View style={styles.headerContainer}>
            {/* Cat Profile Summary Card (Switcher) */}
            <TouchableOpacity
              style={styles.catProfileCard}
              onPress={() => setShowCatSwitcher(true)}
              activeOpacity={0.8}
            >
              <View style={styles.catAvatarContainer}>
                <Image
                  source={selectedCat?.image_url ? { uri: selectedCat.image_url } : require('../../assets/cioncat.jpg')}
                  style={styles.catAvatar}
                />
                <View style={[styles.onlineIndicator, { backgroundColor: cameraStatus === 'connected' ? '#4CAF50' : '#B0BEC5' }]} />
              </View>
              <View style={styles.catInfo}>
                <Text style={styles.catName}>{selectedCat?.name || 'My Cat'}</Text>
                <Text style={[styles.catStatus, { color: cameraStatus === 'connected' ? '#4CAF50' : '#90A4AE' }]}>
                  {cameraStatus === 'connected' ? '● Active' : '○ Offline'}
                </Text>
              </View>
              <Ionicons name="chevron-down" size={18} color="#00695C" style={{ marginLeft: 8 }} />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => onNavigate('Alert')} style={styles.bellButton}>
              <Ionicons name="notifications-outline" size={26} color="#00695C" />
              {unreadAlerts > 0 ? <View style={styles.notificationDot} /> : null}
            </TouchableOpacity>
          </View>

          {hasCriticalAlert ? (
            <Animated.View style={[
              styles.overlayBannerWrapper,
              {
                opacity: bannerAnim,
                transform: [{
                  translateY: bannerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 0]
                  })
                }, {
                  scale: bannerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.95, 1]
                  })
                }]
              }
            ]}>
              <TouchableOpacity
                style={styles.overlayBanner}
                activeOpacity={0.8}
                onPress={() => onNavigate('Alert')}
              >
                <Ionicons name="warning" size={20} color="#fff" />
                <View style={styles.overlayTextContainer}>
                  <Text style={styles.overlayTitle}>Camera Issue Detected</Text>
                  <Text style={styles.overlayDesc}>Litter Box camera is offline.</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#fff" />
              </TouchableOpacity>
            </Animated.View>
          ) : null}

          {/* Pending Identity Banner for normal behaviors (or missed popups) */}
          <PendingIdentityBanner
            count={pendingIdentityCount}
            onPress={openPendingQueue}
          />

          {/* Main Content Animated Wrapper */}
          <Animated.View style={{ opacity, transform: [{ translateY }] }}>

            {/* Camera Section */}
            <View style={styles.cameraContainer}>
              <View style={styles.cameraFrame}>
                <View style={styles.videoPlaceholder}>
                  <MaterialCommunityIcons
                    name={currentCamera === 1 ? "videocam" : "camera-account"}
                    size={64}
                    color="#B0BEC5"
                  />
                  <Text style={styles.placeholderText}>Live Feed</Text>
                </View>

                <View style={[styles.cameraStatusBadge, { backgroundColor: cameraStatus === 'connected' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(30, 30, 30, 0.75)' }]}>
                  <Animated.View style={[styles.cameraStatusDot, {
                    opacity: cameraStatus === 'connected' ? pulseAnim : 1,
                    backgroundColor: cameraStatus === 'connected' ? '#4CAF50' :
                      cameraStatus === 'connecting' ? '#FFC107' : '#F44336'
                  }]} />
                  <Text style={[styles.cameraStatusText, { color: cameraStatus === 'connected' ? '#1B5E20' : '#fff' }]}>
                    {cameraStatus === 'connected' ? 'Connected' :
                      cameraStatus === 'connecting' ? 'Connecting...' : 'Camera Disconnected'}
                  </Text>
                </View>

                {/* Pro Data Overlays */}
                {cameraStatus === 'connected' && (
                  <>
                    {/* Top Right: Resolution & FPS */}
                    <View style={styles.topRightOverlay}>
                      <Text style={styles.overlayTextSmall}>1080p HD • {proStats.fps} FPS</Text>
                    </View>

                    {/* Top Center: AI Engine Status */}
                    <View style={styles.topCenterOverlay}>
                      <MaterialCommunityIcons name="brain" size={12} color="#4CAF50" style={{ marginRight: 4 }} />
                      <Text style={styles.overlayTextSmall}>AI Engine: Active Monitoring</Text>
                    </View>

                    {/* Bottom Left: Network Stats */}
                    <View style={styles.networkStatsOverlay}>
                      <MaterialCommunityIcons name="wifi" size={14} color="#4CAF50" style={{ marginRight: 4 }} />
                      <Text style={styles.overlayTextSmall}>{proStats.ping}ms • {proStats.bitrate.toFixed(1)} Mbps</Text>
                    </View>
                  </>
                )}

                {/* TEMPORARY DEV BUTTONS: Simulate behaviors for Auto-Popup testing */}
                <View style={styles.devToolsContainer}>
                  <TouchableOpacity
                    style={{
                      backgroundColor: 'rgba(211, 47, 47, 0.9)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12
                    }}
                    onPress={() => {
                      AlertEngine.logPendingIdentity({
                        behaviorLabel: 'vomiting', confidence: 0.88, sessionId: 'test_session_' + Date.now(),
                        source: 'Manual Test Button', isAbnormal: true, cropSnapshot: 'https://placekitten.com/300/300'
                      });
                    }}
                  >
                    <Text style={{ color: '#FFF', fontSize: 9, fontWeight: 'bold' }}>Test Abnormal</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      backgroundColor: 'rgba(230, 81, 0, 0.9)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12
                    }}
                    onPress={() => {
                      AlertEngine.logPendingIdentity({
                        behaviorLabel: 'eating', confidence: 0.95, sessionId: 'test_session_' + Date.now(),
                        source: 'Manual Test Button', isAbnormal: false, cropSnapshot: 'https://placekitten.com/300/300'
                      });
                    }}
                  >
                    <Text style={{ color: '#FFF', fontSize: 9, fontWeight: 'bold' }}>Test Normal</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.switchCameraButton}
                  onPress={toggleCamera}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="camera-flip" size={22} color="#00695C" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.galleryOverlayButton}
                  onPress={() => onNavigate('Gallery')}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="image-multiple" size={22} color="#00695C" />
                </TouchableOpacity>
              </View>

              <View style={styles.householdPill}>
                <MaterialCommunityIcons name="paw" size={14} color="#00695C" style={{ marginRight: 6 }} />
                <Text style={styles.householdText}>
                  {modeDisplay} Mode • {householdCatsCount} Cat{householdCatsCount !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>

            {/* Environment Status Bar */}
            <View style={styles.envContainer}>
              <View style={styles.envItem}>
                <MaterialCommunityIcons name="thermometer" size={20} color={cameraStatus === 'connected' ? "#FF8A65" : "#B0BEC5"} />
                <Text style={[styles.envText, { color: cameraStatus === 'connected' ? '#37474F' : '#90A4AE' }]}>
                  {cameraStatus === 'connected' ? `${environment.temperature.toFixed(1)}°C` : '--°C'}
                </Text>
              </View>
              <View style={styles.envDivider} />
              <View style={styles.envItem}>
                <MaterialCommunityIcons name="water-percent" size={20} color={cameraStatus === 'connected' ? "#4FC3F7" : "#B0BEC5"} />
                <Text style={[styles.envText, { color: cameraStatus === 'connected' ? '#37474F' : '#90A4AE' }]}>
                  {cameraStatus === 'connected' ? `${environment.humidity}%` : '--%'}
                </Text>
              </View>
            </View>

            {/* Recent Activity Scroll */}
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentScrollContent}
              style={styles.recentScroll}
            >
              {(data?.recentActivities || [
                { id: 1, type: 'Motion', time: '2m ago', icon: 'run', color: '#FFB74D' },
                { id: 2, type: 'Eating', time: '15m ago', icon: 'food', color: '#81C784' },
                { id: 3, type: 'Litter', time: '1h ago', icon: 'emoticon-poop', color: '#BA68C8' },
                { id: 4, type: 'Sleep', time: '3h ago', icon: 'sleep', color: '#90A4AE' },
              ]).map((item, index) => (
                <View key={item.id || index} style={styles.recentItem}>
                  <View style={[styles.recentIcon, { backgroundColor: item.color + '20' }]}>
                    <MaterialCommunityIcons name={item.icon} size={20} color={item.color} />
                  </View>
                  <View>
                    <Text style={styles.recentType}>{item.type}</Text>
                    <Text style={styles.recentTime}>{item.time}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <Text style={styles.sectionTitle}>Today's Insights</Text>

            {/* Activity Chart Card */}
            <View style={styles.cardContainer}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.cardTitle}>Activity Level</Text>
                  <Text style={styles.cardSubtitle}>
                    Status: <Text style={{ color: '#00695C', fontWeight: 'bold' }}>{data.posture.normal.name === 'Active' ? 'Active' : 'Moderate'}</Text>
                  </Text>
                </View>
                <View style={styles.iconCircleSmall}>
                  <MaterialCommunityIcons name="chart-bar" size={20} color="#00695C" />
                </View>
              </View>

              <ActivityLevelChart
                data={{
                  labels: ['6AM', '12AM', '6PM', 'NOW'],
                  activity: data.activity
                }}
              />
            </View>

            {/* Stats Grid */}
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { marginRight: 8 }]}>
                <View style={[styles.iconCircle, { backgroundColor: '#E0F2F1' }]}>
                  <MaterialCommunityIcons name="food-apple" size={24} color="#00695C" />
                </View>
                <Text style={styles.statValue}>{data.food}g</Text>
                <Text style={styles.statLabel}>Food Consumed</Text>
              </View>

              <View style={[styles.statCard, { marginLeft: 8 }]}>
                <View style={[styles.iconCircle, { backgroundColor: '#E0F2F1' }]}>
                  <MaterialCommunityIcons name="litter-box" size={24} color="#00695C" />
                </View>
                <Text style={styles.statValue}>{data.litter}</Text>
                <Text style={styles.statLabel}>Litter Visits</Text>
              </View>
            </View>

            {/* Posture Card */}
            <View style={styles.cardContainer}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Posture & Behavior</Text>
                <MaterialCommunityIcons name="dots-horizontal" size={20} color="#B0BEC5" />
              </View>

              <View style={styles.postureGrid}>
                {/* Normal Card */}
                <View style={[styles.postureCard, styles.postureCardNormal]}>
                  <View style={styles.postureIconBgNormal}>
                    <MaterialCommunityIcons name="cat" size={28} color="#00695C" />
                  </View>
                  <View style={styles.postureContent}>
                    <Text style={styles.postureValueNormal}>{data.posture.normal.percent}%</Text>
                    <Text style={styles.postureLabel}>Normal</Text>
                  </View>
                </View>

                {/* Abnormal Card */}
                <View style={[styles.postureCard, styles.postureCardAbnormal]}>
                  <View style={styles.postureIconBgAbnormal}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={28} color="#D32F2F" />
                  </View>
                  <View style={styles.postureContent}>
                    <Text style={styles.postureValueAbnormal}>{data.posture.abnormal.percent}%</Text>
                    <Text style={styles.postureLabel}>Attention</Text>
                  </View>
                </View>
              </View>

              <View style={styles.postureContext}>
                <Text style={styles.postureContextText}>
                  Most detected: <Text style={{ fontWeight: 'bold', color: '#00695C' }}>{data.posture.normal.name}</Text>
                </Text>
                {data.posture.abnormal.percent > 0 && <Text style={[styles.postureContextText, { color: '#D32F2F', marginTop: 4 }]}>Alert: {data.posture.abnormal.name}</Text>}
              </View>
            </View>

            {/* Pro Analytics Card */}
            <View style={styles.cardContainer}>
              <View style={styles.cardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="chart-arc" size={20} color="#00695C" style={{ marginRight: 6 }} />
                  <Text style={styles.cardTitle}>Behavior Analytics</Text>
                </View>
                <View style={{ backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, flexDirection: 'row', alignItems: 'center' }}>
                  <Animated.View style={[styles.cameraStatusDot, { backgroundColor: '#4CAF50', width: 6, height: 6, marginRight: 4, opacity: pulseAnim }]} />
                  <Text style={{ color: '#2E7D32', fontSize: 10, fontWeight: 'bold' }}>LIVE</Text>
                </View>
              </View>

              <View style={styles.insightsGrid}>
                {/* Energy Distribution */}
                <View style={styles.insightRow}>
                  <View style={styles.insightHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <MaterialCommunityIcons name="lightning-bolt-circle" size={16} color="#FF9800" style={{ marginRight: 6 }} />
                      <Text style={styles.insightLabel}>Energy Distribution</Text>
                    </View>
                    <Text style={styles.insightValue}>{data.behaviorAnalytics?.energy?.active || 0}% Active</Text>
                  </View>
                  <View style={[styles.progressBarBg, { backgroundColor: '#EEEEEE' }]}>
                    <Animated.View style={[styles.progressBarFill, { width: `${data.behaviorAnalytics?.energy?.active || 0}%`, backgroundColor: '#FF9800' }]} />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                    <Text style={styles.insightSubtextLeft}>High (Playing)</Text>
                    <Text style={styles.insightSubtext}>Low (Resting)</Text>
                  </View>
                </View>

                {/* Routine Consistency */}
                <View style={[styles.insightRow, { marginTop: 12 }]}>
                  <View style={styles.insightHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <MaterialCommunityIcons name="calendar-check" size={16} color="#2196F3" style={{ marginRight: 6 }} />
                      <Text style={styles.insightLabel}>Routine Consistency</Text>
                    </View>
                    <Text style={[styles.insightValue, { color: '#2196F3' }]}>{data.behaviorAnalytics?.routine?.status || 'No Data'}</Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <Animated.View style={[styles.progressBarFill, { width: `${data.behaviorAnalytics?.routine?.score || 0}%`, backgroundColor: '#2196F3' }]} />
                  </View>
                  <Text style={styles.insightSubtextLeft}>Consistent feeding and litter habits</Text>
                </View>

                {/* Wellness Index */}
                <View style={[styles.insightRow, { marginTop: 12 }]}>
                  <View style={styles.insightHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <MaterialCommunityIcons name="heart-pulse" size={16} color="#4CAF50" style={{ marginRight: 6 }} />
                      <Text style={styles.insightLabel}>Wellness Index</Text>
                    </View>
                    <Text style={[styles.insightValue, { color: '#4CAF50' }]}>{data.behaviorAnalytics?.wellness?.status || 'No Data'}</Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <Animated.View style={[styles.progressBarFill, { width: `${data.behaviorAnalytics?.wellness?.score || 0}%`, backgroundColor: '#4CAF50' }]} />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                    <Text style={styles.insightSubtextLeft}>Relaxed</Text>
                    <Text style={styles.insightSubtext}>Stressed</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Action Buttons */}
            <ButtonScale style={styles.actionButton} onPress={() => onNavigate('Timeline')}>
              <MaterialCommunityIcons name="timeline-clock-outline" size={22} color="#00695C" />
              <Text style={styles.actionButtonText}>View Timeline</Text>
              <Ionicons name="chevron-forward" size={20} color="#B2DFDB" />
            </ButtonScale>

            <ButtonScale style={styles.actionButton} onPress={() => onNavigate('Gallery')}>
              <MaterialCommunityIcons name="image-multiple-outline" size={22} color="#00695C" />
              <Text style={styles.actionButtonText}>Activity Gallery</Text>
              <Ionicons name="chevron-forward" size={20} color="#B2DFDB" />
            </ButtonScale>

            <ButtonScale style={styles.actionButton} onPress={() => onNavigate('Setcamera')}>
              <Ionicons name="settings-outline" size={22} color="#00695C" />
              <Text style={styles.actionButtonText}>Camera Settings</Text>
              <Ionicons name="chevron-forward" size={20} color="#B2DFDB" />
            </ButtonScale>

            <View style={{ height: 100 }} />
          </Animated.View>
        </ScrollView>

        <BottomNav current="Camera" onNavigate={onNavigate} />

        {/* Cat Switcher Modal */}
        <Modal
          visible={showCatSwitcher}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowCatSwitcher(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowCatSwitcher(false)}
          >
            <View style={styles.switcherContainer}>
              <Text style={styles.switcherTitle}>Switch Profile</Text>
              <FlatList
                data={cats}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.switcherItem, selectedCat?.id === item.id && styles.switcherItemActive]}
                    onPress={() => handleSelectCat(item)}
                  >
                    <Image
                      source={item.image_url ? { uri: item.image_url } : require('../../assets/cioncat.jpg')}
                      style={styles.switcherAvatar}
                    />
                    <Text style={[styles.switcherName, selectedCat?.id === item.id && styles.switcherNameActive]}>
                      {item.name}
                    </Text>
                    {selectedCat?.id === item.id && (
                      <Ionicons name="checkmark-circle" size={20} color="#00695C" />
                    )}
                  </TouchableOpacity>
                )}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      </SafeAreaView>
    </LinearGradient >
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    color: '#004D40',
  },
  // Cat Profile Card Styles
  catProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  catAvatarContainer: {
    position: 'relative',
  },
  catAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#E0F2F1',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  catInfo: {
    marginLeft: 10,
  },
  catName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#37474F',
  },
  catStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  bellButton: {
    width: 40,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notificationDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF5252',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  overlayBannerWrapper: {
    marginBottom: 16,
    zIndex: 10,
  },
  overlayBanner: {
    backgroundColor: '#FF5252',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#FF5252',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  overlayTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  overlayTitle: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  overlayDesc: {
    color: '#ffebee',
    fontSize: 12,
  },
  cameraContainer: {
    marginBottom: 24,
    alignItems: 'center',
  },
  cameraFrame: {
    width: '100%',
    height: 220,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#ECEFF1',
    position: 'relative',
    elevation: 2,
    shadowColor: '#546E7A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#ECEFF1',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#90A4AE',
    marginTop: 10,
    fontWeight: '600',
  },
  cameraStatusBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  cameraStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 4,
    marginRight: 6,
  },
  cameraStatusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  switchCameraButton: {
    position: 'absolute',
    bottom: 12,
    right: 14,
    backgroundColor: '#FFFFFF',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 20,
  },
  galleryOverlayButton: {
    position: 'absolute',
    bottom: 12,
    left: 14,
    backgroundColor: '#FFFFFF',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 20,
  },
  devToolsContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 100,
    gap: 6,
    alignItems: 'flex-end'
  },
  topRightOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  topCenterOverlay: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  networkStatsOverlay: {
    position: 'absolute',
    bottom: 60,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  overlayTextSmall: {
    color: '#ECEFF1',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  householdPill: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -16, // Overlap camera slightly
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  householdText: {
    color: '#00695C',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 18,
    marginTop: 20,
    marginBottom: 12,
    fontWeight: '700',
    color: '#37474F',
    marginLeft: 4,
  },
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#90A4AE',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    elevation: 5, // Increased elevation for better pop
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#37474F',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#78909C',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 24,
    alignItems: 'center',
    shadowColor: '#90A4AE',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconCircleSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0F2F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#37474F',
  },
  statLabel: {
    fontSize: 12,
    color: '#78909C',
    marginTop: 2,
  },
  // Posture Redesign
  postureGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 12,
  },
  postureCard: {
    flex: 1,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  postureCardNormal: {
    backgroundColor: '#E0F2F1', // Light Teal
  },
  postureCardAbnormal: {
    backgroundColor: '#FFEBEE', // Light Red
  },
  postureIconBgNormal: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  postureIconBgAbnormal: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  postureContent: {
    flex: 1,
  },
  postureValueNormal: {
    fontSize: 20,
    fontWeight: '800',
    color: '#00695C',
  },
  postureValueAbnormal: {
    fontSize: 20,
    fontWeight: '800',
    color: '#D32F2F',
  },
  postureLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#546E7A',
  },
  postureContext: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#ECEFF1',
  },
  postureContextText: {
    fontSize: 12,
    color: '#78909C',
  },
  actionButton: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 24,
    marginBottom: 16,
    shadowColor: '#90A4AE',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  actionButtonText: {
    flex: 1,
    marginLeft: 16,
    fontSize: 16,
    color: '#37474F',
    fontWeight: '700',
  },
  // Environment Styles
  envContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#FFFFFF', // White background for contrast
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    shadowColor: '#B0BEC5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  envItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  envText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#37474F',
  },
  envLabel: {
    fontSize: 11,
    color: '#90A4AE',
    fontWeight: '500',
    marginLeft: 2,
  },
  envDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#ECEFF1',
  },
  // Recent Activity Styles
  recentScroll: {
    marginBottom: 8,
  },
  recentScrollContent: {
    paddingRight: 16,
  },
  recentItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 10,
    paddingRight: 16,
    marginRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#90A4AE',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  recentIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  recentType: {
    fontSize: 13,
    fontWeight: '700',
    color: '#37474F',
  },
  recentTime: {
    fontSize: 11,
    color: '#90A4AE',
    marginTop: 2,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  switcherContainer: {
    width: '80%',
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 20,
    maxHeight: '50%',
  },
  switcherTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#37474F',
    marginBottom: 16,
    textAlign: 'center',
  },
  switcherItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  switcherItemActive: {
    backgroundColor: '#F0F4F8',
    borderRadius: 12,
    paddingHorizontal: 8,
  },
  switcherAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
  },
  switcherName: {
    fontSize: 16,
    color: '#37474F',
    flex: 1,
  },
  switcherNameActive: {
    fontWeight: 'bold',
    color: '#00695C',
  },

  // Pro Widgets Styles
  insightsGrid: {
    marginTop: 12,
    gap: 16,
  },
  insightRow: {
    marginBottom: 4,
  },
  insightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  insightLabel: {
    fontSize: 13,
    color: '#455A64',
    fontWeight: '600',
  },
  insightValue: {
    fontSize: 13,
    color: '#37474F',
    fontWeight: 'bold',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#ECEFF1',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  insightSubtext: {
    fontSize: 11,
    color: '#90A4AE',
    marginTop: 4,
    textAlign: 'right',
  },
  insightSubtextLeft: {
    fontSize: 11,
    color: '#90A4AE',
  },

  // --- Intro Screen Styles ---
  introContainer: {
    flex: 1,
  },
  introHeader: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  introBackButton: {
    padding: 5,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 12,
    width: 40,
    alignItems: 'center',
  },
  introScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    alignItems: 'center',
  },
  introHero: {
    alignItems: 'center',
    marginBottom: 30,
    marginTop: 20,
  },
  introImage: {
    width: width * 0.5,
    height: width * 0.5,
    borderRadius: (width * 0.5) / 2,
    borderWidth: 4,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  introTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0C5A58',
    textAlign: 'center',
    marginBottom: 10,
  },
  introSubtitle: {
    fontSize: 14,
    color: '#285855',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  introFeatureList: {
    width: '100%',
    marginBottom: 30,
    gap: 12,
  },
  introFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 16,
    padding: 16,
  },
  introFeatureIcon: {
    marginRight: 16,
  },
  introFeatureTitle: {
    fontWeight: 'bold',
    color: '#0C5A58',
    fontSize: 16,
  },
  introFeatureSubtitle: {
    color: '#333',
    fontSize: 12,
    marginTop: 2,
  },
  introPrimaryButton: {
    backgroundColor: '#147C78',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    width: '100%',
  },
  introPrimaryButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  introSkipText: {
    color: '#285855',
    fontSize: 14,
    fontWeight: '600',
  },
});
