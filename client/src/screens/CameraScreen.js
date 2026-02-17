import React from 'react';
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Dimensions,
  TouchableOpacity
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import BottomNav from '../components/BottomNav';
import useCameraData from '../hooks/useCameraData';

const { width } = Dimensions.get('window');

export default function CameraScreen({ onNavigate, session }) {
  const { data } = useCameraData(session);
  if (!data) return null;

  const minutes = Math.floor((Date.now() - data.connectedAt) / 60000);
  const modeDisplay = data.settings?.monitoringMode
    ? data.settings.monitoringMode.charAt(0).toUpperCase() + data.settings.monitoringMode.slice(1)
    : 'Multi';
  const selectedCatsCount = data.settings?.selectedCats?.length ?? 0;
  const householdCatsCount = selectedCatsCount > 0 ? selectedCatsCount : data.cats;

  return (
    <LinearGradient colors={['#FFFFFF', '#95e4e4ff']} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.headerTitle}>Camera</Text>

          <View style={styles.cameraBox}>
            <View style={styles.cameraContainer}>
              <View style={styles.cameraFrame}>
                <View style={styles.videoPlaceholder}>
                  <Text style={styles.placeholderText}>Camera Feed Live</Text>
                  <Ionicons name="videocam" size={48} color="rgba(255,255,255,0.5)" />
                </View>
                <View style={styles.cameraStatusBadge}>
                  <View style={[styles.cameraStatusDot, { backgroundColor: '#4CAF50' }]} />
                  <Text style={styles.cameraStatusText}>Connected - 2m ago</Text>
                </View>
              </View>
            </View>

            <View style={styles.statusBadge}>
              <Text style={styles.badgeText}>Connected - {minutes}m ago</Text>
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
              <Text style={styles.chartTitle}>Moderate</Text>
              <Text style={styles.graphSubtitle}>Activity Level</Text>
            </View>

            <View style={styles.chartContainer}>
              {data.activity.map((v, i) => (
                <View key={i} style={styles.barGroup}>
                  <View style={styles.barBackground}>
                    <View style={[styles.barFill, { height: `${v}%` }]} />
                  </View>
                  <Text style={styles.barLabel}>{['6AM', '12AM', '6PM', 'NEW'][i]}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.card}>
              <View style={styles.iconCircle}>
                <MaterialCommunityIcons name="food-apple" size={24} color="#008080" />
              </View>
              <Text style={styles.cardLabel}>Food</Text>
              <Text style={styles.value}>{data.food} Times</Text>
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

          <TouchableOpacity style={styles.btn}>
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
    </LinearGradient>
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
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#0C5A58',
    marginTop: 8,
    marginBottom: 16,
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
  statusBadge: {
    position: 'absolute',
    top: 20,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
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

