import React from 'react';
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import BottomNav from '../components/BottomNav';
import useCameraData from '../hooks/useCameraData';
import ActivityLevelChart from '../components/ActivityLevelChart';
import AlertEngine, { AlertEvents } from '../services/AlertEngine';
import PendingIdentityBanner from '../components/alert/PendingIdentityBanner';
import { GlobalAlertQueueContext } from '../services/GlobalAlertQueue';

const { width } = Dimensions.get('window');

export default function CameraScreen({ onNavigate, session }) {
  const { data } = useCameraData(session);
  const [currentCamera, setCurrentCamera] = React.useState(1);
  const [cameraStatus, setCameraStatus] = React.useState('disconnected');
  const [unreadAlerts, setUnreadAlerts] = React.useState(0);
  const [hasCriticalAlert, setHasCriticalAlert] = React.useState(false);
  const [pendingIdentityCount, setPendingIdentityCount] = React.useState(0);
  const bannerAnim = React.useRef(new Animated.Value(0)).current;

  // Retrieve global queue context to open manual queue
  const { openPendingQueue } = React.useContext(GlobalAlertQueueContext);

  // Animation for sticky banner
  React.useEffect(() => {
    if (hasCriticalAlert) {
      Animated.spring(bannerAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7
      }).start();
    } else {
      Animated.timing(bannerAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [hasCriticalAlert]);

  // Subscribe to AlertEngine
  React.useEffect(() => {
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

  React.useEffect(() => {
    const fetchStatus = async () => {
      try {
        const storedStatus = await AsyncStorage.getItem('camera_status');
        if (storedStatus) {
          setCameraStatus((prev) => (prev !== storedStatus ? storedStatus : prev));
        }
      } catch (e) {
        console.error("Failed to fetch camera status:", e);
      }
    };

    fetchStatus();

    // Polling is a quick workaround for non-react-navigation custom routers 
    // to ensure shared state updates when returning from SetcameraScreen
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const toggleCamera = () => {
    // Navigate to Phone screen, specifically the Test Connection step
    onNavigate('Phone', { initialStep: 'test_connection' });
  };

  if (!data) return null;

  const modeDisplay = data.settings?.monitoringMode
    ? data.settings.monitoringMode.charAt(0).toUpperCase() + data.settings.monitoringMode.slice(1)
    : 'Multi';
  const selectedCatsCount = data.settings?.selectedCats?.length ?? 0;
  const householdCatsCount = selectedCatsCount > 0 ? selectedCatsCount : data.cats;

  return (
    <LinearGradient colors={['#FFFFFF', '#95e4e4ff']} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.headerContainer}>
            <View style={{ width: 32 }} />
            <Text style={styles.headerTitle}>Camera</Text>
            <TouchableOpacity onPress={() => onNavigate('Alert')} style={styles.bellButton}>
              <Ionicons name="notifications-outline" size={24} color="#0C5A58" />
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

          <View style={styles.cameraBox}>
            <View style={styles.cameraContainer}>
              <View style={styles.cameraFrame}>
                <View style={styles.videoPlaceholder}>
                  <MaterialCommunityIcons
                    name={currentCamera === 1 ? "videocam" : "camera-account"}
                    size={48}
                    color="rgba(255,255,255,0.5)"
                  />
                </View>
                <View style={styles.cameraStatusBadge}>
                  <View style={[styles.cameraStatusDot, {
                    backgroundColor: cameraStatus === 'connected' ? '#4CAF50' :
                      cameraStatus === 'connecting' ? '#FFC107' : '#F44336'
                  }]} />
                  <Text style={styles.cameraStatusText}>
                    {cameraStatus === 'connected' ? 'Connected - Live' :
                      cameraStatus === 'connecting' ? 'Connecting...' : 'Camera Disconnected'}
                  </Text>
                </View>

                {/* TEMPORARY DEV BUTTONS: Simulate behaviors for Auto-Popup testing */}
                <View style={{ position: 'absolute', top: 12, right: 12, zIndex: 100, gap: 8 }}>
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#D32F2F', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20
                    }}
                    onPress={() => {
                      AlertEngine.logPendingIdentity({
                        behaviorLabel: 'vomiting', confidence: 0.88, sessionId: 'test_session_' + Date.now(),
                        source: 'Manual Test Button', isAbnormal: true, cropSnapshot: 'https://placekitten.com/300/300'
                      });
                    }}
                  >
                    <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold' }}>Simulate Abnormal (Auto)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      backgroundColor: '#E65100', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20
                    }}
                    onPress={() => {
                      AlertEngine.logPendingIdentity({
                        behaviorLabel: 'eating', confidence: 0.95, sessionId: 'test_session_' + Date.now(),
                        source: 'Manual Test Button', isAbnormal: false, cropSnapshot: 'https://placekitten.com/300/300'
                      });
                    }}
                  >
                    <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold' }}>Simulate Normal (Banner)</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.switchCameraButton}
                  onPress={toggleCamera}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="camera" size={24} color="#FFF" />
                </TouchableOpacity>
              </View>
            </View>

          </View>

          <View style={styles.household}>
            <MaterialCommunityIcons name="paw" size={16} color="#00695C" style={{ marginRight: 6 }} />
            <Text style={styles.householdText}>
              Household mode : {modeDisplay} ({householdCatsCount} cats)
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Today's Insights</Text>

          <View style={styles.chartCard}>
            <View style={styles.graphHeader}>
              <Text style={styles.chartTitle}>{data.posture.normal.name === 'Active' ? 'Active' : 'Moderate'}</Text>
              <Text style={styles.graphSubtitle}>Activity Level</Text>
            </View>

            <ActivityLevelChart
              data={{
                labels: ['6AM', '12AM', '6PM', 'NEW'],
                activity: data.activity
              }}
            />
          </View>

          <View style={styles.row}>
            <View style={styles.card}>
              <View style={styles.iconCircle}>
                <MaterialCommunityIcons name="food-apple" size={24} color="#008080" />
              </View>
              <Text style={styles.cardLabel}>Food</Text>
              <Text style={styles.value}>{data.food} Grams</Text>
            </View>

            <View style={styles.card}>
              <View style={styles.iconCircle}>
                <MaterialCommunityIcons name="cat" size={24} color="#008080" />
              </View>
              <Text style={styles.cardLabel}>Litter Box</Text>
              <Text style={styles.value}>{data.litter} visited</Text>
            </View>
          </View>

          <View style={styles.postureCard}>
            <Text style={styles.postureTitle}>Posture Signal</Text>

            <View style={styles.row}>
              <View style={styles.postureItem}>
                <View style={[styles.postureIcon, { backgroundColor: '#FFAB91' }]}>
                  <MaterialCommunityIcons name="alert" size={20} color="#BF360C" />
                </View>
                <View>
                  <Text style={styles.red}>{data.posture.abnormal.name}</Text>
                  <Text style={styles.postureDesc}>{data.posture.abnormal.percent}%</Text>
                </View>
              </View>

              <View style={styles.postureDivider} />

              <View style={styles.postureItem}>
                <View style={[styles.postureIcon, { backgroundColor: '#F48FB1' }]}>
                  <MaterialCommunityIcons
                    name={data.posture.normal.name === 'Sleep' ? 'heart' : 'run'}
                    size={20}
                    color="#880E4F"
                  />
                </View>
                <View>
                  <Text style={styles.green}>{data.posture.normal.name}</Text>
                  <Text style={styles.postureDesc}>{data.posture.normal.percent}%</Text>
                </View>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={styles.btn}
            onPress={() => onNavigate('Timeline')}
          >
            <MaterialCommunityIcons name="timeline-text-outline" size={20} color="#00695C" />
            <Text style={styles.btnText}>View Timeline</Text>
            <Ionicons name="chevron-forward" size={20} color="#00695C" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.btn} onPress={() => onNavigate('Setcamera')}>
            <Ionicons name="settings-outline" size={20} color="#00695C" />
            <Text style={styles.btnText}>Setting Camera</Text>
            <Ionicons name="chevron-forward" size={20} color="#00695C" />
          </TouchableOpacity>

          <View style={{ height: 100 }} />
        </ScrollView>

        <BottomNav current="Camera" onNavigate={onNavigate} />
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
    paddingBottom: 100,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#0C5A58',
  },
  bellButton: {
    width: 32,
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
    backgroundColor: '#F44336',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  overlayBannerWrapper: {
    marginBottom: 16,
    zIndex: 10,
  },
  overlayBanner: {
    backgroundColor: '#F44336',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
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
  cameraBox: {
    marginBottom: 0,
  },
  cameraContainer: {
    marginBottom: 20,
    alignItems: 'center',
  },
  cameraFrame: {
    width: width - 32,
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#333',
    position: 'relative',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  videoPlaceholder: {
    flex: 1,
    backgroundColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#fff',
    marginTop: 10,
    fontWeight: '600',
  },
  cameraStatusBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  cameraStatusDot: {
    width: 8,
    height: 8,
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
    right: 12,
    backgroundColor: 'rgba(20, 124, 120, 0.7)',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  household: {
    backgroundColor: '#E0F2F1',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginLeft: 16,
    elevation: 2,
    zIndex: 10,
  },
  householdText: {
    color: '#00695C',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 20,
    marginTop: 24,
    marginBottom: 12,
    fontWeight: 'bold',
    color: '#004D40',
  },
  chartCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderWidth: 0.5,
    borderColor: '#898989',
    borderRadius: 16,
    padding: 16,
  },
  graphHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  chartTitle: {
    color: '#ffffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  graphSubtitle: {
    color: '#555',
    fontSize: 12,
  },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 120,
    paddingHorizontal: 8,
  },
  barGroup: {
    alignItems: 'center',
    width: width / 5,
  },
  barBackground: {
    height: 100,
    width: '100%',
    backgroundColor: '#616f6fff',
    borderRadius: 8,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    backgroundColor: '#a7f3d0ff',
    width: '100%',
    borderRadius: 8,
  },
  barLabel: {
    color: '#333',
    fontSize: 10,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 16,
  },
  card: {
    backgroundColor: '#B2DFDB',
    width: '48%',
    padding: 16,
    borderRadius: 16,
    elevation: 2,
  },
  iconCircle: {
    marginBottom: 8,
  },
  cardLabel: {
    fontSize: 12,
    color: '#00695C',
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  value: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#004D40',
  },
  postureCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderWidth: 0.5,
    borderColor: '#898989ff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  postureTitle: {
    color: '#ffffffff',
    marginBottom: 12,
    fontSize: 16,
    fontWeight: 'bold',
  },
  postureItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  postureDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginHorizontal: 10,
  },
  postureIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  red: {
    color: '#285855ff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  green: {
    color: '#285855ff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  postureDesc: {
    color: '#333',
    fontSize: 10,
  },
  btn: {
    backgroundColor: '#80CBC4',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  btnText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: '#004D40',
    fontWeight: '600',
  },
});

