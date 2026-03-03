import React, { useRef, useEffect, useState, useContext } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  Easing,
  Image,
  Modal,
  FlatList,
  ActivityIndicator,
  Platform
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import supabase from './config/supabaseClient';
import HomeHeader from '../components/HomeHeader';


import BottomNav from '../components/BottomNav';
import useCameraData from '../hooks/useCameraData';
import ActivityLevelChart from '../components/ActivityLevelChart';
import AlertEngine, { AlertEvents } from '../services/AlertEngine';
import PendingIdentityBanner from '../components/alert/PendingIdentityBanner';
import { GlobalAlertQueueContext } from '../services/GlobalAlertQueue';

const { width } = Dimensions.get('window');

const HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
// Change 5000 to 3000 if using a proxy, or your PC's IP if on a physical device
const VIDEO_STREAM_URL = `http://${HOST}:5000/api/video_feed`;

// Create animated components
const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

const DecorativeCatEars = () => (
  <View style={styles.earContainer} pointerEvents="none">
    <View style={[styles.ear, styles.earLeft]} />
    <View style={[styles.ear, styles.earRight]} />
  </View>
);

export default function CameraScreen({ onNavigate, session }) {
  const [showSetupIntro, setShowSetupIntro] = useState(null); // null | true | false
  const [requireSetcamera, setRequireSetcamera] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('disconnected');
  const [currentCamera, setCurrentCamera] = useState(1);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [hasCriticalAlert, setHasCriticalAlert] = useState(false);
  const [pendingIdentityCount, setPendingIdentityCount] = useState(0);
  const [cats, setCats] = useState([]);
  const [selectedCat, setSelectedCat] = useState(null);
  const [showCatSwitcher, setShowCatSwitcher] = useState(false);
  const [environment, setEnvironment] = useState({ temperature: 25.4, humidity: 58 });
  const [proStats, setProStats] = useState({ ping: 42, bitrate: 1.2, fps: 30 });
  const [livePreviewUri, setLivePreviewUri] = useState(null);

  const { data } = useCameraData(session, cameraStatus);

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

  const showCameraIssueBanner = hasCriticalAlert && cameraStatus !== 'connected';

  // Animation for sticky banner
  useEffect(() => {
    if (showCameraIssueBanner) {
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
  }, [showCameraIssueBanner]);

  // Subscribe to AlertEngine
  useEffect(() => {
    // Initial load
    setUnreadAlerts(AlertEngine.getUnreadCount());
    setHasCriticalAlert(AlertEngine.hasActiveCritical());
    setPendingIdentityCount(AlertEngine.getPendingIdentityCount());

    const handler = (data) => {
      setUnreadAlerts(data.unreadCount);
      setHasCriticalAlert(data.hasCritical);
      setPendingIdentityCount(data.pendingIdentityCount);
    };

    AlertEngine.on(AlertEvents.UPDATED, handler);
    return () => AlertEngine.off(AlertEvents.UPDATED, handler);
  }, []);

  useEffect(() => {
    const fetchStatusAndSetup = async () => {
      try {
        const hasSetup = await AsyncStorage.getItem('camera_setup_complete');
        let hasValidSource = false;
        const storedCameraId = await AsyncStorage.getItem('camera_id');
        let cameraId = storedCameraId;

        if (!cameraId && session?.user?.id) {
          const { data: latestCamera } = await supabase
            .from('cameras')
            .select('id, stream_source')
            .eq('owner_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (latestCamera?.id) {
            cameraId = latestCamera.id;
            await AsyncStorage.setItem('camera_id', cameraId);
            hasValidSource = Boolean((latestCamera.stream_source || '').trim());
          }
        }

        if (cameraId && !hasValidSource && session?.user?.id) {
          const { data: camRow } = await supabase
            .from('cameras')
            .select('stream_source')
            .eq('id', cameraId)
            .eq('owner_id', session.user.id)
            .maybeSingle();
          hasValidSource = Boolean((camRow?.stream_source || '').trim());
        }

        setRequireSetcamera(!hasValidSource);
        setShowSetupIntro(prev => {
          const shouldShow = hasSetup !== 'true';
          // Prevent unnecessary re-renders if the value is the same
          return (prev === null || prev !== shouldShow) ? shouldShow : prev;
        });

        // Check for camera connection status
        const storedStatus = await AsyncStorage.getItem('camera_status');
        if (storedStatus && hasValidSource) {
          setCameraStatus((prev) => (prev !== storedStatus ? storedStatus : prev));
        } else if (!hasValidSource) {
          setCameraStatus('disconnected');
        }
      } catch (e) {
        console.error("Failed to fetch status from storage:", e);
      }
    };

    fetchStatusAndSetup();

    const interval = setInterval(fetchStatusAndSetup, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let timer;
    const fetchLatestPreview = async () => {
      try {
        const cameraId = await AsyncStorage.getItem('camera_id');
        if (!cameraId) {
          setLivePreviewUri(null);
          return;
        }

        const { data: latest, error } = await supabase
          .from('ai_cat_identity_review')
          .select('snapshot_url, occurred_at')
          .eq('camera_id', cameraId)
          .not('snapshot_url', 'is', null)
          .order('occurred_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.warn('Failed to load live preview:', error?.message || error);
          return;
        }

        const uri = latest?.snapshot_url || null;
        if (uri && /^https?:\/\//i.test(uri)) {
          setLivePreviewUri(uri);
        } else {
          setLivePreviewUri(null);
        }
      } catch (e) {
        console.warn('Failed to fetch live preview:', e?.message || e);
      }
    };

    if (cameraStatus === 'connected') {
      fetchLatestPreview();
      timer = setInterval(fetchLatestPreview, 6000);
    } else {
      setLivePreviewUri(null);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [cameraStatus]);

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
    onNavigate('Setcamera');
  };

  // Button Press Animation Helper
  const ButtonScale = ({ children, onPress, style, disabled = false }) => {
    const scaleValue = useRef(new Animated.Value(1)).current;

    const onPressIn = () => {
      Animated.spring(scaleValue, { toValue: 0.95, useNativeDriver: true }).start();
    };
    const onPressOut = () => {
      Animated.spring(scaleValue, { toValue: 1, useNativeDriver: true }).start();
    };

    return (
      <AnimatedTouchableOpacity
        activeOpacity={disabled ? 1 : 0.9}
        onPress={disabled ? undefined : onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[style, disabled && { opacity: 0.45 }, { transform: [{ scale: scaleValue }] }]}
      >
        {children}
      </AnimatedTouchableOpacity>
    );
  };

  if (!data) return null;
  // --- Render Functions ---

  const CameraSetupIntro = ({ onSetup, onMaybeLater }) => {
    const FeatureCard = ({ icon, title, subtitle }) => (
      <View style={styles.introFeatureCard}>
        <View style={styles.introFeatureIcon}>
          <MaterialCommunityIcons name={icon} size={28} color="#00695C" />
        </View>
        <Text style={styles.introFeatureTitle}>{title}</Text>
        <Text style={styles.introFeatureSubtitle}>{subtitle}</Text>
      </View>
    );

    return (
      <LinearGradient colors={['#F5FBFB', '#E8F5E9']} style={styles.introContainer}>
        <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
          <View style={styles.introHeader}>
            <TouchableOpacity onPress={onMaybeLater} style={styles.introBackButton}>
              <Ionicons name="close" size={24} color="#2F6A62" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.introScrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.introHeroIcon}>
              <MaterialCommunityIcons name="camera-plus-outline" size={64} color="#00695C" />
            </View>
            <Text style={styles.introTitle}>Connect Your Camera</Text>
            <Text style={styles.introSubtitle}>
              Turn your home camera into a smart health monitor for your cat.
            </Text>

            <View style={styles.introFeatureGrid}>
              <FeatureCard
                icon="video-check-outline"
                title="AI Detection"
                subtitle="Tracks eating, drinking, and litter box visits."
              />
              <FeatureCard
                icon="chart-bell-curve-cumulative"
                title="Health Trends"
                subtitle="Identifies changes in behavior over time."
              />
              <FeatureCard
                icon="shield-alert-outline"
                title="Smart Alerts"
                subtitle="Notifies you of potential health issues."
              />
              <FeatureCard
                icon="image-multiple-outline"
                title="Activity Gallery"
                subtitle="Creates a visual diary of your cat's day."
              />
            </View>

            <View style={styles.introButtonContainer}>
              <TouchableOpacity style={styles.introPrimaryButton} onPress={onSetup}>
                <Text style={styles.introPrimaryButtonText}>Start Camera Setup</Text>
                <Ionicons name="arrow-forward" size={20} color="#FFF" style={{ marginLeft: 8 }} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onMaybeLater} style={styles.introSkipButton}>
                <Text style={styles.introSkipText}>I'll do this later</Text>
              </TouchableOpacity>
            </View>
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

  const SectionOverlay = ({ children }) => {
    if (cameraStatus !== 'disconnected') return children;

    return (
      <View style={styles.sectionOverlayWrapper}>
        <View pointerEvents="none">
          {children}
        </View>
        <View style={styles.sectionOverlayContent}>
          <View style={styles.sectionOverlayHint}>
            <Text style={styles.sectionOverlayHintText}>Connect camera to unlock this section</Text>
          </View>
        </View>
      </View>
    );
  };

  const SetupPromptCard = () => (
    <View style={styles.setupCardWrapper}>
      <LinearGradient colors={['#F4FCF9', '#EAF7F2']} style={styles.setupCardGradient}>
        <View style={styles.setupCardIconContainer}>
          <MaterialCommunityIcons name="video-plus" size={26} color="#0F766E" />
        </View>
        <View style={styles.setupCardTextContainer}>
          <Text style={styles.setupCardTitle}>Connect Your Camera</Text>
          <Text style={styles.setupCardSubtitle}>Enable AI behavior monitoring for your pet.</Text>
        </View>
        <TouchableOpacity
          style={styles.setupCardButton}
          onPress={() => onNavigate('Phone', { initialStep: 'intro' })}
        >
          <Text style={styles.setupCardButtonText}>Connect Now</Text>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );

  if (showSetupIntro && !requireSetcamera) {
    return <CameraSetupIntro onSetup={() => onNavigate('Setcamera')} onMaybeLater={() => onNavigate('Home')} />;
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
    <View style={{ flex: 1, backgroundColor: '#f5fffdff' }}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      <LinearGradient colors={['#f5fffdff', '#f5fffdff']} style={{ flex: 1 }}>
        <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
          <HomeHeader
            leftComponent={
              <TouchableOpacity
                style={styles.catProfileCard}
                onPress={() => setShowCatSwitcher(!showCatSwitcher)}
                activeOpacity={0.8}
              >
                <View style={styles.catAvatarContainer}>
                  <Image
                    source={selectedCat?.image_url ? { uri: selectedCat.image_url } : require('../../assets/cioncat.jpg')}
                    style={styles.catAvatar}
                  />
                  <View style={[styles.onlineIndicator, { backgroundColor: cameraStatus === 'connected' ? '#4CAF50' : '#B0BEC5' }]} />
                </View>
              </TouchableOpacity>
            }
            rightComponent={
              <TouchableOpacity onPress={() => onNavigate('Alert')} style={styles.bellButton}>
                <Ionicons name="notifications-outline" size={26} color="#00695C" />
                {unreadAlerts > 0 ? <View style={styles.notificationDot} /> : null}
              </TouchableOpacity>
            }
          />

          {showCameraIssueBanner ? (
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

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

            {cameraStatus === 'disconnected' && <SetupPromptCard />}

            {/* Main Content Animated Wrapper */}
            <Animated.View style={{ opacity, transform: [{ translateY }] }}>

              {/* Camera Section */}
              <View style={styles.cameraContainer}>
                <View style={styles.cameraFrame}>
                  {cameraStatus === 'connected' ? (
                    <Image source={{ uri: VIDEO_STREAM_URL }} style={styles.livePreviewImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.videoPlaceholder}>
                      <Text style={styles.liveFeedLabel}>Live Feed</Text>
                    </View>
                  )}

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
                </View>

                <View style={styles.householdPill}>
                  <MaterialCommunityIcons name="paw" size={14} color="#00695C" style={{ marginRight: 6 }} />
                  <Text style={styles.householdText}>
                    {modeDisplay} Mode • {householdCatsCount} Cat{householdCatsCount !== 1 ? 's' : ''}
                  </Text>
                </View>
              </View>

              {/* Environment Status */}
              <View style={styles.envRow}>
                <LinearGradient
                  colors={['#DDE7FF', '#EEF2FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.weatherWidget}
                >
                  <View style={styles.weatherLeft}>
                    <Text style={styles.weatherLabel}>Current location</Text>
                    <Text style={styles.weatherCity}>Home</Text>
                    <Text style={styles.weatherCondition}>
                      {cameraStatus === 'connected'
                        ? (environment.humidity > 70 ? 'Humid' : environment.temperature > 30 ? 'Warm' : 'Comfort')
                        : 'No Signal'}
                    </Text>
                  </View>

                  <View style={styles.weatherRight}>
                    <View style={styles.weatherIconWrap}>
                      <MaterialCommunityIcons name="weather-partly-cloudy" size={28} color="#6366F1" />
                    </View>
                    <Text style={styles.weatherTemp}>
                      {cameraStatus === 'connected' ? `${environment.temperature.toFixed(1)}°C` : '--°C'}
                    </Text>
                    <View style={styles.weatherHumidityPill}>
                      <MaterialCommunityIcons name="water-percent" size={12} color="#5B67D6" style={{ marginRight: 4 }} />
                      <Text style={styles.weatherHumidity}>
                        {cameraStatus === 'connected' ? `${environment.humidity}%` : '--%'}
                      </Text>
                    </View>
                  </View>
                </LinearGradient>
              </View>

              {/* Recent Activity Scroll */}
              <SectionOverlay>
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
                    { id: 3, type: 'Litter', time: '1h ago', icon: 'delete-outline', color: '#BA68C8' }, // Fixed icon
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
              </SectionOverlay>

              <Text style={styles.sectionTitle}>Today's Insights</Text>

              {/* Activity Chart Card */}
              <SectionOverlay>
                <View style={styles.cardContainer}>
                  <DecorativeCatEars />
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.cardTitle}>Activity Level</Text>
                      <Text style={styles.cardSubtitle}>
                        Status: <Text style={{ color: '#FF6D00', fontWeight: 'bold' }}>{data.posture.normal.name === 'Active' ? 'Active' : 'Moderate'}</Text>
                      </Text>
                    </View>
                    <View style={styles.iconCircleSmall}>
                      <MaterialCommunityIcons name="chart-bar" size={20} color="#FF6D00" />
                    </View>
                  </View>

                  <ActivityLevelChart
                    data={{
                      labels: ['00:00', '06:00', '12:00', '18:00', '24:00'],
                      activity: data.activity
                    }}
                  />
                </View>
              </SectionOverlay>

              {/* Stats Grid */}
              <SectionOverlay>
                <View style={styles.statsRow}>
                  <View style={styles.statCardGlowFood}>
                    <View style={[styles.statCard, styles.statCardFood]}>
                      <MaterialCommunityIcons name="paw" size={80} color="rgba(255, 109, 0, 0.05)" style={styles.statWatermark} />
                      <View style={[styles.iconCircle, styles.iconCircleFood]}>
                        <MaterialCommunityIcons name="food-apple" size={26} color="#FF6D00" />
                      </View>
                      <View style={styles.statContent}>
                        <Text style={styles.statValue}>{data.food}g</Text>
                        <Text style={styles.statLabel}>Food Consumed</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.statCardGlowLitter}>
                    <View style={[styles.statCard, styles.statCardLitter]}>
                      <MaterialCommunityIcons name="paw" size={80} color="rgba(2, 136, 209, 0.05)" style={styles.statWatermark} />
                      <View style={[styles.iconCircle, styles.iconCircleLitter]}>
                        <MaterialCommunityIcons name="delete-outline" size={26} color="#0288D1" />
                      </View>
                      <View style={styles.statContent}>
                        <Text style={styles.statValue}>{data.litter}</Text>
                        <Text style={styles.statLabel}>Litter Visits</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </SectionOverlay>

              {/* Posture Card */}
              <SectionOverlay>
                <View style={styles.cardContainer}>
                  <DecorativeCatEars />
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
                        <MaterialCommunityIcons name="medical-bag" size={28} color="#D32F2F" />
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
              </SectionOverlay>

              {/* Pro Analytics Card */}
              <SectionOverlay>
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
                  <Text style={[styles.cardSubtitle, { marginTop: -4, marginBottom: 8 }]}>
                    Insights improve with more recorded behavior over time.
                  </Text>

                  <View style={styles.insightsGrid}>
                    {/* Energy Distribution */}
                    <View style={styles.insightRow}>
                      <View style={styles.insightHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                          <MaterialCommunityIcons name="lightning-bolt-circle" size={16} color="#FF9800" style={{ marginRight: 6 }} />
                          <Text style={styles.insightLabel} numberOfLines={1}>Energy Distribution</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 8 }}>
                          <MaterialCommunityIcons name="paw" size={12} color="#FF9800" style={{ marginRight: 4 }} />
                          <Text style={styles.insightValue} numberOfLines={1}>{data.behaviorAnalytics?.energy?.active || 0}% Active</Text>
                        </View>
                      </View>
                      <View style={styles.progressBarBg}>
                        <View style={styles.progressBarGray} />
                        <Animated.View style={[styles.progressBarFill, { width: `${data.behaviorAnalytics?.energy?.active || 0}%` }]}>
                          <View style={[styles.progressBarColor, { backgroundColor: '#FFAB40' }]} />
                          <MaterialCommunityIcons name="paw" size={24} color="#FF6D00" style={styles.progressPaw} />
                        </Animated.View>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 0 }}>
                        <Text style={styles.insightSubtextLeft}>High (Playing)</Text>
                        <Text style={styles.insightSubtext}>Low (Resting)</Text>
                      </View>
                    </View>

                    {/* Routine Consistency */}
                    <View style={[styles.insightRow, { marginTop: 12 }]}>
                      <View style={styles.insightHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                          <MaterialCommunityIcons name="calendar-check" size={16} color="#2196F3" style={{ marginRight: 6 }} />
                          <Text style={styles.insightLabel} numberOfLines={1}>Routine Consistency</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 8 }}>
                          <MaterialCommunityIcons name="paw" size={12} color="#2196F3" style={{ marginRight: 4 }} />
                          <Text style={[styles.insightValue, { color: '#2196F3' }]} numberOfLines={1}>{data.behaviorAnalytics?.routine?.status || 'No Data'}</Text>
                        </View>
                      </View>
                      <View style={styles.progressBarBg}>
                        <View style={styles.progressBarGray} />
                        <Animated.View style={[styles.progressBarFill, { width: `${data.behaviorAnalytics?.routine?.score || 0}%` }]}>
                          <View style={[styles.progressBarColor, { backgroundColor: '#64B5F6' }]} />
                          <MaterialCommunityIcons name="paw" size={24} color="#0D47A1" style={styles.progressPaw} />
                        </Animated.View>
                      </View>
                      <Text style={[styles.insightSubtextLeft, { marginTop: 0 }]}>Consistent feeding and litter habits</Text>
                    </View>

                    {/* Wellness Index */}
                    <View style={[styles.insightRow, { marginTop: 12 }]}>
                      <View style={styles.insightHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                          <MaterialCommunityIcons name="heart-pulse" size={16} color="#4CAF50" style={{ marginRight: 6 }} />
                          <Text style={styles.insightLabel} numberOfLines={1}>Wellness Index</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 8 }}>
                          <MaterialCommunityIcons name="paw" size={12} color="#4CAF50" style={{ marginRight: 4 }} />
                          <Text style={[styles.insightValue, { color: '#4CAF50' }]} numberOfLines={1}>{data.behaviorAnalytics?.wellness?.status || 'No Data'}</Text>
                        </View>
                      </View>
                      <View style={styles.progressBarBg}>
                        <View style={styles.progressBarGray} />
                        <Animated.View style={[styles.progressBarFill, { width: `${data.behaviorAnalytics?.wellness?.score || 0}%` }]}>
                          <View style={[styles.progressBarColor, { backgroundColor: '#81C784' }]} />
                          <MaterialCommunityIcons name="paw" size={24} color="#1B5E20" style={styles.progressPaw} />
                        </Animated.View>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 0 }}>
                        <Text style={styles.insightSubtextLeft}>Relaxed</Text>
                        <Text style={styles.insightSubtext}>Stressed</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </SectionOverlay>

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

          <View style={styles.footerBar}>
            <BottomNav current="Camera" onNavigate={onNavigate} />
          </View>

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
                  showsVerticalScrollIndicator={false}
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
      </LinearGradient>
    </View >
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5fffdff',
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 68,
  },
  footerBar: {
    backgroundColor: '#FFFFFF',
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    width: 42,
    height: 42,
    borderRadius: 21,
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
    width: 36,
    height: 36,
    borderRadius: 18,
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
    flexShrink: 1,
  },
  catName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#37474F',
    maxWidth: 140,
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
    marginTop: 12,
    marginBottom: 24,
    alignItems: 'center',
  },
  cameraFrame: {
    width: '100%',
    height: 220,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  livePreviewImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E5E7EB',
  },
  liveFeedLabel: {
    color: '#64748B',
    fontSize: 14,
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
  networkStatsOverlay: {
    position: 'absolute',
    bottom: 60,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  overlayTextSmall: {
    fontSize: 10,
    color: '#1B5E20',
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
    fontSize: 15,
    marginTop: 16,
    marginBottom: 10,
    fontWeight: '700',
    color: '#37474F',
    marginLeft: 4,
  },
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 13,
    marginBottom: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#37474F',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 11,
    color: '#78909C',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 11,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row', // Horizontal layout for better premium feel
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.015,
    shadowRadius: 2,
    elevation: 0,
  },
  statCardFood: {
    borderLeftWidth: 4,
    borderLeftColor: '#FF6D00',
  },
  statCardLitter: {
    borderLeftWidth: 4,
    borderLeftColor: '#0288D1',
  },
  statCardGlowFood: {
    flex: 1,
    marginRight: 6,
    borderRadius: 18,
    shadowColor: '#FF6D00',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 1,
  },
  statCardGlowLitter: {
    flex: 1,
    marginLeft: 6,
    borderRadius: 18,
    shadowColor: '#0288D1',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 1,
  },
  statContent: {
    marginLeft: 12,
    flex: 1,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircleFood: {
    backgroundColor: '#FFF3E0',
  },
  iconCircleLitter: {
    backgroundColor: '#E1F5FE',
  },
  iconCircleSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF3E0', // Match chart card
    justifyContent: 'center',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#37474F',
  },
  statLabel: {
    fontSize: 8,
    color: '#78909C',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  // Posture Redesign
  postureGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    gap: 10,
  },
  postureCard: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
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
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  postureIconBgAbnormal: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  postureContent: {
    flex: 1,
  },
  postureValueNormal: {
    fontSize: 17,
    fontWeight: '800',
    color: '#00695C',
  },
  postureValueAbnormal: {
    fontSize: 17,
    fontWeight: '800',
    color: '#D32F2F',
  },
  postureLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#546E7A',
  },
  postureContext: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#ECEFF1',
  },
  postureContextText: {
    fontSize: 11,
    color: '#78909C',
  },
  actionButton: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 11,
    borderRadius: 14,
    marginBottom: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  actionButtonText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 13,
    color: '#37474F',
    fontWeight: '700',
  },
  // Environment Styles
  envRow: {
    marginBottom: 16,
  },
  weatherWidget: {
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E3E8FF',
  },
  weatherLeft: {
    flex: 1,
  },
  weatherLabel: {
    fontSize: 12,
    color: '#6B78B8',
    fontWeight: '600',
  },
  weatherCity: {
    fontSize: 18,
    fontWeight: '800',
    color: '#3D4A80',
    marginTop: 2,
    marginBottom: 4,
  },
  weatherCondition: {
    fontSize: 12,
    color: '#5F6CA8',
    fontWeight: '700',
  },
  weatherRight: {
    alignItems: 'flex-end',
    minWidth: 110,
  },
  weatherIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weatherTemp: {
    fontSize: 17,
    color: '#3D4A80',
    fontWeight: '800',
    marginTop: 6,
    marginBottom: 4,
  },
  weatherHumidityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  weatherHumidity: {
    fontSize: 11,
    color: '#4B5A9A',
    fontWeight: '700',
  },
  statWatermark: {
    position: 'absolute',
    right: -10,
    bottom: -10,
    opacity: 0.5,
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
    borderRadius: 14,
    padding: 8,
    paddingRight: 12,
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
    width: 34,
    height: 34,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  recentType: {
    fontSize: 12,
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
    height: 24, // Enough height to not clip the paw
    justifyContent: 'center',
    overflow: 'visible',
    marginVertical: 4,
  },
  progressBarGray: {
    height: 8,
    backgroundColor: '#ECEFF1',
    borderRadius: 5,
    width: '100%',
    position: 'absolute',
  },
  progressBarFill: {
    height: 24,
    minWidth: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'visible',
  },
  progressBarColor: {
    height: 8,
    borderRadius: 5,
    width: '100%',
    position: 'absolute',
  },
  progressPaw: {
    marginRight: -8,
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 3,
    zIndex: 10,
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
    paddingTop: 16,
  },
  introBackButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  introScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  introHeroIcon: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  introTitle: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    color: '#0C5A58',
    textAlign: 'center',
    marginBottom: 10,
  },
  introSubtitle: {
    fontSize: 15,
    color: '#285855',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
    paddingHorizontal: 10,
  },
  introFeatureGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 14,
  },
  introFeatureCard: {
    width: `48%`,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  introFeatureIcon: {
    marginBottom: 12,
  },
  introFeatureTitle: {
    fontFamily: 'Inter-Bold',
    color: '#0C5A58',
    fontSize: 14,
    textAlign: 'center',
  },
  introFeatureSubtitle: {
    color: '#285855',
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
    lineHeight: 16,
  },
  introButtonContainer: {
    marginTop: 32,
  },
  introPrimaryButton: {
    backgroundColor: '#147C78',
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    width: '100%',
  },
  introPrimaryButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  introSkipButton: {
    marginTop: 16,
    padding: 10,
    alignItems: 'center',
  },
  introSkipText: {
    color: '#285855',
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  statWatermark: {
    position: 'absolute',
    right: -10,
    bottom: -10,
    opacity: 0.5,
  },
  // Cat Ear Decorative Styles
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
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  earLeft: {
    transform: [{ rotate: '-15deg' }],
  },
  earRight: {
    transform: [{ rotate: '15deg' }],
  },
  // Section Overlay Styles
  sectionOverlayWrapper: {
    position: 'relative',
    marginHorizontal: 0,
    marginBottom: 0,
    borderRadius: 0,
    overflow: 'visible',
  },
  sectionOverlayContent: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    zIndex: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionOverlayHint: {
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionOverlayHintText: {
    fontSize: 10,
    color: '#475569',
    fontWeight: '600',
  },
  // Setup Prompt Card Styles
  setupCardWrapper: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 10,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D7ECE5',
    elevation: 2,
    shadowColor: '#0F766E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  setupCardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  setupCardIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#D9F1E8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  setupCardTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  setupCardTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 1,
  },
  setupCardSubtitle: {
    color: '#64748B',
    fontSize: 11,
  },
  setupCardButton: {
    backgroundColor: '#0F766E',
    borderColor: '#0F766E',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    shadowColor: '#0F766E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 2,
  },
  setupCardButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  // New styles from user
  disconnectedPromptTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#004D40',
    marginTop: 12,
    marginBottom: 4,
    textAlign: 'center',
  },
  disconnectedPromptSubtitle: {
    fontSize: 14,
    color: '#37474F',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  disconnectedPromptButton: {
    backgroundColor: '#00897B',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  disconnectedPromptButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastUpdatedText: {
    fontSize: 10,
    color: '#90A4AE',
    marginLeft: 5,
    fontFamily: 'Inter-Medium',
  },
  requireSetcameraOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 150,
    bottom: 240,
    backgroundColor: 'rgba(255,255,255,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 40,
  },
  requireSetcameraCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 20,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  requireSetcameraTitle: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  requireSetcameraText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    color: '#475569',
    textAlign: 'center',
  },
  requireSetcameraButton: {
    marginTop: 14,
    backgroundColor: '#0F766E',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  requireSetcameraButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
