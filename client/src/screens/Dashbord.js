import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from 'expo-linear-gradient';
import BottomNav from "../components/BottomNav";
import HealthTrendsChart from "../components/HealthTrendsChart";
import HomeHeader from "../components/HomeHeader";
import supabase from "./config/supabaseClient";
import { analyzeHealthLog, getHealthStatus } from "../utils/healthLogic";
import * as Print from 'expo-print';
import { shareAsync } from 'expo-sharing';

// ==========================================
// 🐾 Paw Progress Bar Component
// ==========================================
const PawProgressBar = ({ label, percent, icon }) => {
  const clampedPercent = Math.max(0, Math.min(100, percent));

  // Custom colors for specific labels to match CameraScreen
  const getBarColor = (label) => {
    if (label.includes('Activity')) return '#FFAB40'; // Energy orange
    if (label.includes('Litter')) return '#64B5F6'; // Routine blue
    return '#81C784'; // Wellness green
  };

  const getIconColor = (label) => {
    if (label.includes('Activity')) return '#FF6D00';
    if (label.includes('Litter')) return '#0D47A1';
    return '#1B5E20';
  };

  const barColor = getBarColor(label);
  const iconColor = getIconColor(label);

  return (
    <View style={styles.insightRow}>
      <View style={styles.insightHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <MaterialCommunityIcons name={icon || "paw"} size={16} color={iconColor} style={{ marginRight: 6 }} />
          <Text style={styles.insightLabel} numberOfLines={1}>{label}</Text>
        </View>
        <Text style={[styles.insightValue, { color: iconColor }]}>{clampedPercent}%</Text>
      </View>
      <View style={styles.progressBarBg}>
        <View style={styles.progressBarGray} />
        <View style={[styles.progressBarFill, { width: `${clampedPercent}%` }]}>
          <View style={[styles.progressBarColor, { backgroundColor: barColor }]} />
          <MaterialCommunityIcons name="paw" size={24} color={iconColor} style={styles.progressPaw} />
        </View>
      </View>
    </View>
  );
};

// Removed pawStyles as it's merged into main styles


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
      const { data: exportLogs, error: exportError } = await supabase
        .from('daily_logs')
        .select('log_date, normal_logs(*), something_off_logs(*)')
        .eq('cat_id', catDetails.id)
        .order('log_date', { ascending: false })
        .limit(7);

      if (exportError) throw exportError;

      const logsForExport = exportLogs || [];
      if (logsForExport.length === 0) {
        alert("No data available to export");
        return;
      }

      const toArray = (value) => (Array.isArray(value) ? value : (value ? [value] : []));
      const formatList = (value) => toArray(value).filter(Boolean).join(', ');
      const sanitize = (text) => String(text ?? '-')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      const rowsHTML = logsForExport.map((log) => {
        const dateObj = new Date(log.log_date);
        const dateStr = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}/${dateObj.getFullYear()}`;

        const normal = toArray(log.normal_logs)[0];
        const off = toArray(log.something_off_logs)[0];

        const normalSummary = normal
          ? [
            `Food type: ${normal.food_type ?? '-'}`,
            `Meals/day: ${normal.meals_per_day ?? '-'}`,
            `Food total: ${normal.total_food_grams ?? 0} g`,
            `Water/day: ${normal.water_ml_per_day ?? 0} ml`,
            `Urine level: ${normal.urine_level ?? '-'}`,
            `Stool level: ${normal.stool_level ?? '-'}`,
          ].join(', ')
          : '-';

        const offIssues = [];
        if (off?.has_vomit) {
          offIssues.push(`Vomit${off?.vomit_type ? ` (${off.vomit_type})` : ''}`);
        }
        if (off?.has_diarrhea) {
          offIssues.push(`Diarrhea${off?.diarrhea_type ? ` (${off.diarrhea_type})` : ''}`);
        }
        const behaviorEnergy = formatList(off?.behavior_energy);
        if (behaviorEnergy) offIssues.push(`Behavior/Energy: ${behaviorEnergy}`);
        const respiratoryPhysical = formatList(off?.respiratory_physical);
        if (respiratoryPhysical) offIssues.push(`Respiratory/Physical: ${respiratoryPhysical}`);
        const offSummary = off ? (offIssues.join(', ') || '-') : '-';
        const noteText = off?.notes || normal?.notes || '-';

        return `
          <tr>
            <td style="text-align: center;">${dateStr}</td>
            <td>${sanitize(normalSummary)}</td>
            <td>${sanitize(offSummary)}</td>
            <td>${sanitize(noteText)}</td>
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
                <th width="30%">Normal</th>
                <th width="30%">Something Off</th>
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
      <LinearGradient colors={['#f5fffd', '#edf7f4']} style={styles.gradientBg}>
        <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>

          {/* Header */}
          <HomeHeader
            onProfile={() => onNavigate && onNavigate('Profile')}
            onNotify={() => console.log("Notify")}
            onSetting={() => onNavigate && onNavigate('Setting')}
            userProfile={userProfile}
          />

          {/* ===== 🐾 Health Score Circle ===== */}
          <View style={styles.scoreSection}>
            {loading || currentScore === null ? (
              <ActivityIndicator size="large" color="#00695C" style={{ marginVertical: 40 }} />
            ) : (
              <>
                {/* Decorative paws around circle */}
                <MaterialCommunityIcons name="paw" size={38} color="rgba(0,105,92,0.15)" style={{ position: 'absolute', top: 5, right: 30, transform: [{ rotate: '25deg' }] }} />
                <MaterialCommunityIcons name="paw" size={30} color="rgba(0,105,92,0.12)" style={{ position: 'absolute', top: 40, left: 20, transform: [{ rotate: '-20deg' }] }} />
                <MaterialCommunityIcons name="paw" size={34} color="rgba(0,105,92,0.1)" style={{ position: 'absolute', bottom: 25, right: 45, transform: [{ rotate: '40deg' }] }} />
                <MaterialCommunityIcons name="paw" size={26} color="rgba(0,105,92,0.08)" style={{ position: 'absolute', bottom: 15, left: 40, transform: [{ rotate: '-30deg' }] }} />

                <Text style={styles.scoreSectionLabel}>HEALTH STATUS</Text>

                {/* Main Circle */}
                <View style={[styles.mainCircle, { borderColor: status.color }]}>
                  <View style={[styles.mainCircleInner, { backgroundColor: status.color + '12' }]}>
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
                  <Ionicons name="time-outline" size={14} color="#90A4AE" />
                  <Text style={styles.lastUpdateText}>Last update today {new Date().getHours()}:{String(new Date().getMinutes()).padStart(2, '0')}</Text>
                </View>
              </>
            )}
          </View>

          {/* ===== Latest Health Assessment ===== */}
          <View style={styles.assessmentCard}>
            <View style={styles.assessmentCardRow}>
              <MaterialCommunityIcons name="paw" size={32} color="rgba(12,90,88,0.16)" style={{ marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.assessmentTitle}>Latest Health Assessment</Text>
                  <MaterialCommunityIcons name="clipboard-text-outline" size={20} color="#5F7671" />
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
                <Ionicons name="chevron-forward" size={16} color="#0C5A58" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.viewHistoryBtn}
                onPress={() => onNavigate?.('Timeline')}
              >
                <Text style={styles.viewHistoryBtnText}>View History</Text>
                <Ionicons name="time-outline" size={16} color="#0C5A58" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ===== 🐾 System Risk Analysis (Paw Progress) ===== */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <MaterialCommunityIcons name="shield-check-outline" size={22} color="#00695C" />
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
              label="Wellness Balance"
              percent={92}
              icon="heart-pulse"
            />
            <View style={styles.riskFooter}>
              <MaterialCommunityIcons name="clock-outline" size={14} color="#90A4AE" />
              <Text style={styles.riskFooterText}>Based on the last {selectedPeriod === '1 MONTH' ? '30' : '7'} days of activity</Text>
            </View>
          </View>

          {/* ===== 📊 Health Trends Chart ===== */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <MaterialCommunityIcons name="chart-line" size={22} color="#00695C" />
              <Text style={styles.sectionTitle}>Health Trends</Text>
            </View>
          </View>

          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <View style={styles.tagsContainer}>
                <View style={[styles.tag, styles.tagFood]}>
                  <MaterialCommunityIcons name="food-drumstick" size={14} color="#FF8F00" style={{ marginRight: 4 }} />
                  <Text style={styles.tagText}>Food</Text>
                </View>
                <View style={[styles.tag, styles.tagWater]}>
                  <MaterialCommunityIcons name="water" size={14} color="#0288D1" style={{ marginRight: 4 }} />
                  <Text style={styles.tagText}>Water</Text>
                </View>
              </View>
            </View>

            {loading ? (
              <ActivityIndicator size="large" color="#00695C" style={{ marginVertical: 40 }} />
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
              style={styles.actionButtonNew}
              onPress={() => onNavigate && onNavigate('Timeline')}
              activeOpacity={0.8}
            >
              <View style={styles.actionInner}>
                <MaterialCommunityIcons name="chart-timeline-variant" size={22} color="#00695C" />
                <Text style={styles.actionTextNew}>Timeline</Text>
                <Ionicons name="chevron-forward" size={18} color="#90A4AE" style={{ marginLeft: 'auto' }} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButtonNew}
              onPress={handleExportPDF}
              activeOpacity={0.8}
            >
              <View style={styles.actionInner}>
                <MaterialCommunityIcons name="file-export-outline" size={22} color="#00695C" />
                <Text style={styles.actionTextNew}>Export PDF</Text>
                <Ionicons name="chevron-forward" size={18} color="#90A4AE" style={{ marginLeft: 'auto' }} />
              </View>
            </TouchableOpacity>
          </View>

        </ScrollView>

        {/* Bottom Nav */}
        <BottomNav
          current="Overview"
          onNavigate={onNavigate}
        />
      </LinearGradient>
    </SafeAreaView>
  );
}

// ===== Styles =====
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4FAF9',
  },
  gradientBg: {
    flex: 1,
  },
  scrollContainer: {
    padding: 16,
    paddingBottom: 100,
    paddingTop: 8,
  },

  // ===== Score Circle Section =====
  scoreSection: {
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 24,
    position: 'relative',
    paddingVertical: 8,
  },
  scoreSectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#90A4AE',
    letterSpacing: 1.5,
    marginBottom: 16,
    fontFamily: Platform.OS === 'ios' ? 'Inter-Bold' : 'sans-serif-medium',
  },
  mainCircle: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 5,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#546E7A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  mainCircleInner: {
    width: 146,
    height: 146,
    borderRadius: 73,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainCircleStatus: {
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  mainCircleScore: {
    fontSize: 40,
    fontWeight: '900',
    marginTop: 0,
  },
  scoreSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  redFlagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  redFlagRowText: {
    fontSize: 13,
    color: '#D32F2F',
    fontWeight: '700',
  },
  lastUpdateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E1F5FE',
  },
  lastUpdateText: {
    fontSize: 11,
    color: '#90A4AE',
    fontWeight: '600',
  },

  // ===== Assessment Card =====
  assessmentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#DCEFE9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  assessmentCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  assessmentTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#37474F',
  },
  assessmentDate: {
    fontSize: 12,
    color: '#78909C',
    fontWeight: '600',
    marginTop: 2,
  },
  assessmentButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  viewResultBtn: {
    flex: 1,
    backgroundColor: '#0F766E',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  viewResultBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  viewHistoryBtn: {
    flex: 1,
    backgroundColor: '#8ED5C8',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D7ECE5',
  },
  viewHistoryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0C5A58',
  },

  // ===== Section Headers =====
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#37474F',
    fontFamily: Platform.OS === 'ios' ? 'Inter-Bold' : 'sans-serif-medium',
  },
  viewDetailLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#00897B',
    textDecorationLine: 'underline',
  },

  // ===== Risk Card =====
  riskCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E6EEF0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  riskFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F5',
  },
  riskFooterText: {
    fontSize: 11,
    color: '#90A4AE',
    fontWeight: '500',
    fontStyle: 'italic',
  },

  // ===== Chart =====
  chartCard: {
    backgroundColor: '#ffffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#ffffffff',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  tagsContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#F1F8F6',
  },
  tagFood: {
    borderColor: '#FFD6A8',
    borderWidth: 1,
  },
  tagWater: {
    borderColor: '#B3DCF8',
    borderWidth: 1,
  },
  tagText: {
    color: '#37474F',
    fontSize: 11,
    fontWeight: '700',
  },
  periodContainer: {
    flexDirection: 'row',
    backgroundColor: '#EEF6F3',
    borderRadius: 16,
    padding: 4,
    marginTop: 16,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 14,
  },
  periodButtonActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D7ECE5',
  },
  periodText: {
    fontSize: 12,
    color: '#62807B',
    fontWeight: '700',
  },
  periodTextActive: {
    color: '#0C5A58',
  },

  // ===== Action Row =====
  actionRow: {
    flexDirection: 'column',
    gap: 12,
    marginBottom: 20,
  },
  actionButtonNew: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E6EEF0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  actionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionTextNew: {
    fontSize: 14,
    fontWeight: '700',
    color: '#37474F',
  },

  // Paw Progress / Behavior Insight Styles (Merged from CameraScreen)
  insightRow: {
    marginBottom: 16,
  },
  insightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  insightLabel: {
    fontSize: 13,
    color: '#455A64',
    fontWeight: '600',
  },
  insightValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  progressBarBg: {
    height: 24,
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
    textShadowColor: 'rgba(0,0,0,0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    zIndex: 10,
  },
});
