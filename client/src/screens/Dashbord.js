import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity, Dimensions, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from 'expo-linear-gradient';
import BottomNav from "../components/BottomNav";
import HealthTrendsChart from "../components/HealthTrendsChart";
import HomeHeader from "../components/HomeHeader";
import supabase from "./config/supabaseClient";
import { analyzeHealthLog, getHealthStatus } from "../utils/healthLogic";
import * as Print from 'expo-print';
import { shareAsync } from 'expo-sharing';

const { width } = Dimensions.get('window');

// ==========================================
// 🐾 Paw Progress Bar Component
// ==========================================
const PawProgressBar = ({ label, percent, color, icon }) => {
  const clampedPercent = Math.max(0, Math.min(100, percent));
  const pawCount = 5;
  const filledPaws = Math.round((clampedPercent / 100) * pawCount);

  const getBarColor = (pct) => {
    if (pct >= 80) return '#4CAF50';
    if (pct >= 60) return '#66BB6A';
    if (pct >= 40) return '#FFA726';
    if (pct >= 20) return '#EF5350';
    return '#B0BEC5';
  };

  const barColor = color || getBarColor(clampedPercent);

  return (
    <View style={pawStyles.container}>
      <View style={pawStyles.labelRow}>
        <View style={pawStyles.labelLeft}>
          <MaterialCommunityIcons name={icon || "paw"} size={18} color={barColor} />
          <Text style={pawStyles.label}>{label}</Text>
        </View>
        <Text style={[pawStyles.percentText, { color: barColor }]}>{clampedPercent}%</Text>
      </View>
      <View style={pawStyles.trackBackground}>
        <LinearGradient
          colors={[barColor, barColor + '99']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[pawStyles.trackFill, { width: `${clampedPercent}%` }]}
        />
        {/* Paw prints on the bar */}
        <View style={pawStyles.pawRow}>
          {Array.from({ length: pawCount }).map((_, i) => (
            <MaterialCommunityIcons
              key={i}
              name="paw"
              size={16}
              color={i < filledPaws ? '#FFFFFF' : 'rgba(0,0,0,0.08)'}
              style={pawStyles.pawIcon}
            />
          ))}
        </View>
      </View>
    </View>
  );
};

const pawStyles = StyleSheet.create({
  container: { marginBottom: 18 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  labelLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: '#2D4A47' },
  percentText: { fontSize: 14, fontWeight: '700' },
  trackBackground: {
    height: 28,
    backgroundColor: '#E8F0EE',
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 14,
  },
  pawRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 8,
    height: '100%',
  },
  pawIcon: {
    transform: [{ rotate: '-15deg' }],
  },
});


export default function Dashboard({ onBack, onNavigate, session }) {
  const [currentScore, setCurrentScore] = useState(null);
  const status = getHealthStatus(currentScore || 100);

  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState("7 DAY");
  const [userProfile, setUserProfile] = useState(null);
  
  const [catDetails, setCatDetails] = useState(null);
  const [rawLogs, setRawLogs] = useState([]);
  const [latestAlerts, setLatestAlerts] = useState([]);
  const [latestRedFlags, setLatestRedFlags] = useState(0);

  useEffect(() => {
    if (session?.user) {
      fetchDashboardData();
    } else {
      setLoading(false);
    }
  }, [session, selectedPeriod]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      setUserProfile(profile);

      const { data: catData, error: catError } = await supabase
        .from("cats")
        .select("*")
        .eq("owner_id", session.user.id)
        .limit(1)
        .single();

      if (catError || !catData) {
        console.log("No cat found");
        setLoading(false);
        setCurrentScore(100);
        return;
      }
      setCatDetails(catData);

      let daysLimit = selectedPeriod === "1 MONTH" ? 30 : 7;

      const { data: logsData, error: logsError } = await supabase
        .from("daily_logs")
        .select("*, normal_logs(*), something_off_logs(*)")
        .eq("cat_id", catData.id)
        .order("log_date", { ascending: false })
        .limit(daysLimit);

      if (logsError) throw logsError;

      const unifiedLogs = (logsData || []).map(log => {
        const details = log.log_type === 'something_off'
          ? (log.something_off_logs?.[0] || log.something_off_logs)
          : (log.normal_logs?.[0] || log.normal_logs);

        return {
          ...log,
          ...(details || {})
        };
      });

      setRawLogs(unifiedLogs);

      if (unifiedLogs.length > 0) {
        let totalScore = 0;
        let allAlerts = [];
        let totalRedFlags = 0;

        unifiedLogs.forEach(log => {
          const analysis = analyzeHealthLog(log);
          totalScore += analysis.score;
          allAlerts = [...allAlerts, ...analysis.alerts];
          totalRedFlags += analysis.redFlags;
        });

        const averageScore = Math.round(totalScore / unifiedLogs.length);
        setCurrentScore(averageScore);
        // เก็บ alerts ล่าสุดไม่เกิน 3 รายการ (ไม่ซ้ำ)
        setLatestAlerts([...new Set(allAlerts)].slice(0, 4));
        setLatestRedFlags(totalRedFlags);
      } else {
        setCurrentScore(100);
        setLatestAlerts([]);
        setLatestRedFlags(0);
      }

      const chartLogs = [...unifiedLogs].reverse();

      const labels = chartLogs.map((log) => {
        const date = new Date(log.log_date);
        return `${date.getDate()}/${date.getMonth() + 1}`;
      });

      const foodData = chartLogs.map((log) => log.normal_logs?.total_food_grams || 0);
      const waterData = chartLogs.map((log) => log.normal_logs?.water_ml_per_day || 0);

      setChartData({
        labels: labels,
        foodData: foodData,
        waterData: waterData,
      });

    } catch (error) {
      console.error("Error fetching logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateAge = (birthdate) => {
    if (!birthdate) return 'N/A';
    const birth = new Date(birthdate);
    const today = new Date();
    let years = today.getFullYear() - birth.getFullYear();
    let months = today.getMonth() - birth.getMonth();
    if (months < 0) {
      years--;
      months += 12;
    }
    return `${years} yrs ${months} mos`;
  };

  const handleExportPDF = async () => {
    if (!catDetails || rawLogs.length === 0) {
      alert("No data available to export");
      return;
    }

    try {
      const logsForExport = rawLogs.slice(0, 7);
      
      const rowsHTML = logsForExport.map((log) => {
        const dateObj = new Date(log.log_date);
        const dateStr = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}/${dateObj.getFullYear()}`;
        
        let typeText = log.log_type === 'normal' ? 'Normal' : 'Something Off';
        let color = log.log_type === 'normal' ? 'green' : 'orange';

        let summary = "-";
        if (log.log_type === 'something_off') {
           const issues = [];
           if (log.has_vomit) issues.push('Vomit');
           if (log.has_diarrhea) issues.push('Diarrhea');
           if (log.behavior_energy) issues.push(log.behavior_energy);
           if (log.respiratory_physical) issues.push(log.respiratory_physical);
           summary = issues.join(', ') || 'Abnormal';
        } else {
           summary = `Food: ${log.total_food_grams || 0}g, Water: ${log.water_ml_per_day || 0}ml`;
        }

        return `
          <tr>
            <td style="text-align: center;">${dateStr}</td>
            <td style="color: ${color}; font-weight: bold; text-align: center;">${typeText}</td>
            <td>${summary}</td>
            <td>${log.notes || '-'}</td>
          </tr>
        `;
      }).join('');

      const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap');
              body {
                font-family: 'Sarabun', sans-serif;
                padding: 40px;
                color: #333;
              }
              h1 {
                text-align: center;
                color: #2D4A47;
                margin-bottom: 5px;
              }
              .subtitle {
                text-align: center;
                color: #5F7671;
                margin-bottom: 30px;
              }
              .info-box {
                background: #f4f8f7;
                padding: 15px 25px;
                border-radius: 12px;
                border: 1px solid #d1e2e0;
                margin-bottom: 30px;
              }
              .info-box h2 {
                margin-top: 0;
                color: #2D4A47;
                font-size: 18px;
                border-bottom: 2px solid #2D4A47;
                padding-bottom: 5px;
              }
              .info-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px 20px;
                font-size: 14px;
              }
              .info-row span.label {
                font-weight: bold;
                color: #5F7671;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 10px;
                font-size: 14px;
              }
              th, td {
                border: 1px solid #d1e2e0;
                padding: 12px;
                text-align: left;
              }
              th {
                background-color: #2D4A47;
                color: white;
                text-align: center;
              }
              tr:nth-child(even) {
                background-color: #f9fbfb;
              }
            </style>
          </head>
          <body>
            <h1>Cat Health Report</h1>
            <div class="subtitle">Summary of the last 7 days</div>
            
            <div class="info-box">
              <h2>Cat Profile</h2>
              <div class="info-grid">
                <div class="info-row"><span class="label">Name:</span> ${catDetails.name || 'Unknown'}</div>
                <div class="info-row"><span class="label">Breed:</span> ${catDetails.breed || 'Unknown'}</div>
                <div class="info-row"><span class="label">Age:</span> ${calculateAge(catDetails.birthdate)}</div>
                <div class="info-row"><span class="label">Gender:</span> ${catDetails.gender === 'M' ? 'Male' : catDetails.gender === 'F' ? 'Female' : 'Unknown'}</div>
                <div class="info-row"><span class="label">Weight:</span> ${catDetails.weight ? catDetails.weight + ' kg' : 'Unknown'}</div>
                <div class="info-row"><span class="label">Spayed/Neutered:</span> ${catDetails.spayed_neutered ? 'Yes' : 'No'}</div>
              </div>
            </div>

            <h2>Health Logs (Last 7 Days)</h2>
            <table>
              <tr>
                <th width="15%">Date</th>
                <th width="15%">Status</th>
                <th width="45%">Details</th>
                <th width="25%">Notes</th>
              </tr>
              ${rowsHTML}
            </table>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      await shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      
    } catch (error) {
      console.error("Error creating PDF:", error);
      alert("Failed to create PDF");
    }
  };

  const periods = ["7 DAY", "1 MONTH"];

  // ==========================================
  // 🎨 RENDER
  // ==========================================
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <HomeHeader
          onProfile={() => onNavigate && onNavigate('Profile')}
          onNotify={() => console.log("Notify")}
          onSetting={() => onNavigate && onNavigate('UserInfo')}
          userProfile={userProfile}
        />

        {/* ===== 🐾 Health Score Circle ===== */}
        <View style={styles.scoreSection}>
          {loading || currentScore === null ? (
            <ActivityIndicator size="large" color="#4FD1C5" style={{ marginVertical: 40 }} />
          ) : (
            <>
              {/* Decorative paws around circle */}
              <MaterialCommunityIcons name="paw" size={38} color="rgba(77,182,172,0.2)" style={{ position: 'absolute', top: 5, right: 30, transform: [{ rotate: '25deg' }] }} />
              <MaterialCommunityIcons name="paw" size={30} color="rgba(77,182,172,0.15)" style={{ position: 'absolute', top: 40, left: 20, transform: [{ rotate: '-20deg' }] }} />
              <MaterialCommunityIcons name="paw" size={34} color="rgba(77,182,172,0.18)" style={{ position: 'absolute', bottom: 25, right: 45, transform: [{ rotate: '40deg' }] }} />
              <MaterialCommunityIcons name="paw" size={26} color="rgba(77,182,172,0.12)" style={{ position: 'absolute', bottom: 15, left: 40, transform: [{ rotate: '-30deg' }] }} />

              <Text style={styles.scoreSectionLabel}>HEALTH STATUS</Text>

              {/* Main Circle */}
              <View style={[styles.mainCircle, { borderColor: status.color }]}>
                <View style={[styles.mainCircleInner, { backgroundColor: status.color + '18' }]}>
                  <Text style={[styles.mainCircleStatus, { color: status.color }]}>{status.label}</Text>
                  <Text style={[styles.mainCircleScore, { color: status.color }]}>{currentScore}</Text>
                </View>
              </View>

              <Text style={[styles.scoreSubtitle, { color: status.color }]}>{status.text}</Text>

              {latestRedFlags > 0 && (
                <View style={styles.redFlagRow}>
                  <Ionicons name="warning" size={14} color="#EB5757" />
                  <Text style={styles.redFlagRowText}>{latestRedFlags} Red Flag{latestRedFlags > 1 ? 's' : ''} detected</Text>
                </View>
              )}

              <View style={styles.lastUpdateRow}>
                <Ionicons name="time-outline" size={14} color="#8A9E99" />
                <Text style={styles.lastUpdateText}>Last update today {new Date().getHours()}:{String(new Date().getMinutes()).padStart(2, '0')}</Text>
              </View>
            </>
          )}
        </View>

        {/* ===== Latest Health Assessment ===== */}
        <View style={styles.assessmentCard}>
          <View style={styles.assessmentCardRow}>
            <MaterialCommunityIcons name="paw" size={32} color="rgba(255,255,255,0.25)" style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.assessmentTitle}>Latest Health Assessment</Text>
                <MaterialCommunityIcons name="clipboard-text-outline" size={20} color="rgba(255,255,255,0.6)" />
              </View>
              <Text style={styles.assessmentDate}>
                {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • {status.label}
              </Text>
            </View>
          </View>
          <View style={styles.assessmentButtons}>
            <TouchableOpacity
              style={styles.viewResultBtn}
              onPress={() => onNavigate?.('Result')}
            >
              <Text style={styles.viewResultBtnText}>View Result</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.viewHistoryBtn}
              onPress={() => onNavigate?.('Timeline')}
            >
              <Text style={styles.viewHistoryBtnText}>View History</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ===== 🐾 System Risk Analysis (Paw Progress) ===== */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <MaterialCommunityIcons name="shield-check-outline" size={22} color="#2D4A47" />
            <Text style={styles.sectionTitle}>System Risk Analysis</Text>
          </View>
          <TouchableOpacity onPress={() => console.log('View Detail pressed')}>
            <Text style={styles.viewDetailLink}>View Detail</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.riskCard}>
          <PawProgressBar
            label="Activity Level"
            percent={45}
            icon="run"
          />
          <PawProgressBar
            label="Litter Box Usage"
            percent={85}
            icon="emoticon-poop"
          />
          <PawProgressBar
            label="Abnormal Posture"
            percent={5}
            icon="alert-outline"
          />
          <View style={styles.riskFooter}>
            <MaterialCommunityIcons name="clock-outline" size={14} color="#8A9E99" />
            <Text style={styles.riskFooterText}>Based on the last {selectedPeriod === '1 MONTH' ? '30' : '7'} days of activity</Text>
          </View>
        </View>

        {/* ===== 📊 Health Trends Chart ===== */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <MaterialCommunityIcons name="chart-line" size={22} color="#2D4A47" />
            <Text style={styles.sectionTitle}>Health Trends</Text>
          </View>
        </View>

        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View style={styles.tagsContainer}>
              <View style={[styles.tag, styles.tagFood]}>
                <MaterialCommunityIcons name="food-drumstick" size={14} color="#fff" style={{ marginRight: 4 }} />
                <Text style={styles.tagText}>Food</Text>
              </View>
              <View style={[styles.tag, styles.tagWater]}>
                <MaterialCommunityIcons name="water" size={14} color="#fff" style={{ marginRight: 4 }} />
                <Text style={styles.tagText}>Water</Text>
              </View>
            </View>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#1FB3A8" style={{ marginVertical: 40 }} />
          ) : (
            <HealthTrendsChart data={chartData} />
          )}

          {/* Period Selector */}
          <View style={styles.periodContainer}>
            {periods.map((period) => (
              <TouchableOpacity
                key={period}
                style={[
                  styles.periodButton,
                  selectedPeriod === period && styles.periodButtonActive,
                ]}
                onPress={() => setSelectedPeriod(period)}
              >
                <Text
                  style={[
                    styles.periodText,
                    selectedPeriod === period && styles.periodTextActive,
                  ]}
                >
                  {period}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ===== 🔘 Action Buttons ===== */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onNavigate && onNavigate('Timeline')}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#2D5A4E', '#3D7A6A']}
              style={styles.actionGradient}
            >
              <MaterialCommunityIcons name="chart-timeline-variant" size={22} color="#fff" />
              <Text style={styles.actionText}>Timeline</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleExportPDF}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#2D5A4E', '#3D7A6A']}
              style={styles.actionGradient}
            >
              <MaterialCommunityIcons name="file-export-outline" size={22} color="#fff" />
              <Text style={styles.actionText}>Export PDF</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* Bottom Nav */}
      <BottomNav
        current="Overview"
        onNavigate={onNavigate}
      />
    </SafeAreaView>
  );
}

// ===== Styles =====
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F0F5F3',
  },
  scrollContainer: {
    padding: 20,
    paddingBottom: 100,
  },

  // ===== Score Circle Section =====
  scoreSection: {
    alignItems: 'center',
    marginTop: 30,
    marginBottom: 28,
    position: 'relative',
    paddingVertical: 10,
  },
  scoreSectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8A9E99',
    letterSpacing: 2,
    marginBottom: 16,
  },
  mainCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F5F3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  mainCircleInner: {
    width: 156,
    height: 156,
    borderRadius: 78,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainCircleStatus: {
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  mainCircleScore: {
    fontSize: 36,
    fontWeight: '800',
    marginTop: 2,
  },
  scoreSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 14,
  },
  redFlagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: '#FFF0F0',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  redFlagRowText: {
    fontSize: 13,
    color: '#EB5757',
    fontWeight: '600',
  },
  lastUpdateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    backgroundColor: '#F0F5F3',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  lastUpdateText: {
    fontSize: 12,
    color: '#8A9E99',
  },

  // ===== Assessment Card =====
  assessmentCard: {
    backgroundColor: '#1A3B34',
    borderRadius: 18,
    padding: 18,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
  assessmentCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  assessmentTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  assessmentDate: {
    fontSize: 14,
    color: '#B8D8D4',
    fontWeight: '500',
    marginTop: 4,
  },
  assessmentButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  viewResultBtn: {
    flex: 1,
    backgroundColor: '#B8D8D4',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  viewResultBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2D4A47',
  },
  viewHistoryBtn: {
    flex: 1,
    backgroundColor: '#2D4A47',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  viewHistoryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ===== Section Headers =====
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 4,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D4A47',
  },
  viewDetailLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },

  // ===== Risk Card =====
  riskCard: {
    backgroundColor: '#B8D8D4',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    shadowColor: "#2D4A47",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  riskFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E8F0EE',
  },
  riskFooterText: {
    fontSize: 12,
    color: '#8A9E99',
    fontStyle: 'italic',
  },

  // ===== Chart =====
  chartCard: {
    backgroundColor: '#1A3B34',
    borderRadius: 20,
    padding: 18,
    marginBottom: 24,
    shadowColor: "#1A3B34",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 8,
  },
  tagsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  tagFood: {
    backgroundColor: 'rgba(134, 65, 244, 0.8)',
  },
  tagWater: {
    backgroundColor: 'rgba(31, 179, 168, 0.8)',
  },
  tagText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  periodContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: 14,
    gap: 6,
  },
  periodButton: {
    paddingVertical: 7,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    minWidth: 85,
  },
  periodButtonActive: {
    backgroundColor: '#FFFFFF',
  },
  periodText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
  },
  periodTextActive: {
    color: '#1A3B34',
    fontWeight: '800',
  },

  // ===== Action Buttons =====
  actionRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: "#2D4A47",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  actionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});