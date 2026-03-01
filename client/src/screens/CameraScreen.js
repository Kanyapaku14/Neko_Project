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
  FlatList,
  ActivityIndicator
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

const DecorativeCatEars = () => (
  <View style={styles.earContainer} pointerEvents="none">
    <View style={[styles.ear, styles.earLeft]} />
    <View style={[styles.ear, styles.earRight]} />
  </View>
);

export default function CameraScreen({ onNavigate, session }) {
  const [showSetupIntro, setShowSetupIntro] = useState(null); // null | true | false
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
  const [retryCountdown, setRetryCountdown] = useState(15);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, lastUpdated, refetch } = useCameraData(session, cameraStatus);

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

  // Offline Auto-Retry Mechanism
  useEffect(() => {
    let timer;
    if (cameraStatus === 'connected' && isConnectedSignalLost) {
      timer = setInterval(() => {
        setRetryCountdown(prev => {
          if (prev <= 1) {
            handleManualRefresh();
            return 15;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setRetryCountdown(15);
    }
    return () => clearInterval(timer);
  }, [cameraStatus, isConnectedSignalLost]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500);
    setRetryCountdown(15);
  };

  // Helper to check signal
  const isConnectedSignalLost = cameraStatus === 'connected' && (!data || !lastUpdated || (Date.now() - lastUpdated.getTime() > 10000));

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
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.introHeader}>
            <TouchableOpacity onPress={onMaybeLater} style={styles.introBackButton}>
              <Ionicons name="close" size={24} color="#2F6A62" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.introScrollContent}>
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
        <View style={{ opacity: 0.35 }} pointerEvents="none">
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

  const OfflineBanner = () => (
    <View style={styles.offlineBannerContainer}>
      <LinearGradient colors={['#FF5252', '#D32F2F']} style={styles.offlineBannerGradient}>
        <View style={styles.offlineMain}>
          <MaterialCommunityIcons name="wifi-off" size={20} color="#FFF" />
          <View style={styles.offlineTextContainer}>
            <Text style={styles.offlineTitle}>Signal Lost</Text>
            <Text style={styles.offlineSubtitle}>Reconnecting in {retryCountdown}s...</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.retryButton} onPress={handleManualRefresh} disabled={isRefreshing}>
          {isRefreshing ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <MaterialCommunityIcons name="refresh" size={18} color="#FFF" />
              <Text style={styles.retryText}>Try Again</Text>
            </>
          )}
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );

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

          {isConnectedSignalLost && <OfflineBanner />}

          {/* Header */}
          <View style={styles.headerContainer}>
            {/* Cat Profile Summary Card (Switcher) */}
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
              <View style={styles.catInfo}>
                <Text style={styles.catName}>{selectedCat?.name || 'My Cat'}</Text>
                <View style={styles.statusRow}>
                  <Text style={[styles.catStatus, { color: !isConnectedSignalLost ? '#4CAF50' : '#FF5252' }]}>
                    {!isConnectedSignalLost ? '● Active' : '○ Offline'}
                  </Text>
                  {lastUpdated && (
                    <Text style={styles.lastUpdatedText}>
                      • {Math.floor((Date.now() - lastUpdated.getTime()) / 60000)}m ago
                    </Text>
                  )}
                </View>
              </View>
              <Ionicons
                name={showCatSwitcher ? "chevron-up" : "chevron-down"}
                size={18}
                color="#00695C"
                style={{ marginLeft: 8 }}
              />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => onNavigate('Alert')} style={styles.bellButton}>
              <Ionicons name="notifications-outline" size={26} color="#00695C" />
              {unreadAlerts > 0 ? <View style={styles.notificationDot} /> : null}
            </TouchableOpacity>
          </View>

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

          {cameraStatus === 'disconnected' && <SetupPromptCard />}

          {/* Main Content Animated Wrapper */}
          <Animated.View style={{ opacity, transform: [{ translateY }] }}>

            {/* Camera Section */}
            <View style={styles.cameraContainer}>
              <View style={styles.cameraFrame}>
                <View style={styles.videoPlaceholder}>
                  <MaterialCommunityIcons
                    name={currentCamera === 1 ? "video" : "camera-account"}
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

            {/* Environment Status Bar - Redesigned as Capsules */}
            <View style={styles.envContainer}>
              <View style={[styles.envCapsule, { backgroundColor: '#FFF3E0' }]}>
                <View style={[styles.envIconCircle, { backgroundColor: '#FF8A65' }]}>
                  <MaterialCommunityIcons name="thermometer" size={14} color="#FFF" />
                </View>
                <Text style={styles.envValue}>
                  {cameraStatus === 'connected' ? `${environment.temperature.toFixed(1)}°C` : '--°C'}
                </Text>
                <MaterialCommunityIcons name="paw" size={10} color="rgba(255, 138, 101, 0.3)" />
              </View>

              <View style={[styles.envCapsule, { backgroundColor: '#E1F5FE' }]}>
                <View style={[styles.envIconCircle, { backgroundColor: '#4FC3F7' }]}>
                  <MaterialCommunityIcons name="water-percent" size={14} color="#FFF" />
                </View>
                <Text style={styles.envValue}>
                  {cameraStatus === 'connected' ? `${environment.humidity}%` : '--%'}
                </Text>
                <MaterialCommunityIcons name="paw" size={10} color="rgba(79, 195, 247, 0.3)" />
              </View>
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
    flexDirection: 'row', // Horizontal layout for better premium feel
    shadowColor: '#90A4AE',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  statCardFood: {
    marginRight: 6,
    borderLeftWidth: 4,
    borderLeftColor: '#FF6D00',
  },
  statCardLitter: {
    marginLeft: 6,
    borderLeftWidth: 4,
    borderLeftColor: '#0288D1',
  },
  statContent: {
    marginLeft: 12,
    flex: 1,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
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
    fontSize: 18,
    fontWeight: '800',
    color: '#37474F',
  },
  statLabel: {
    fontSize: 10,
    color: '#78909C',
    fontWeight: '600',
    textTransform: 'uppercase',
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  envCapsule: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'space-between',
  },
  envIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  envValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#37474F',
    marginHorizontal: 8,
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
    marginRight: -12,
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
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 24,
    overflow: 'hidden',
  },
  sectionOverlayContent: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.45)', // Slightly adjusted for transparency
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  setupCardButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
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
  // Offline Banner Styles
  offlineBannerContainer: {
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  offlineBannerGradient: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  offlineMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  offlineTextContainer: {
    marginLeft: 10,
  },
  offlineTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
  offlineSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },
  retryButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  retryText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6,
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
});
