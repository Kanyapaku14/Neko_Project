import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity, Dimensions, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from "@expo/vector-icons";
import BottomNav from "../components/BottomNav";
import HealthTrendsChart from "../components/HealthTrendsChart";
import HomeHeader from "../components/HomeHeader";
import supabase from "./config/supabaseClient";
import { analyzeHealthLog, getHealthStatus } from "../utils/healthLogic";
import * as Print from 'expo-print';
import { shareAsync } from 'expo-sharing';




export default function Dashboard({ onBack, onNavigate, session }) {
  // สมมติคะแนนรวม (ในอนาคตอาจจะดึงมาจาก Database)
  const [currentScore, setCurrentScore] = useState(null);
  const status = getHealthStatus(currentScore || 100);

  // Chart data state
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState("7 DAY");
  const [userProfile, setUserProfile] = useState(null);
  
  // States for PDF Export
  const [catDetails, setCatDetails] = useState(null);
  const [rawLogs, setRawLogs] = useState([]);

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

      // 0. Fetch User Profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      setUserProfile(profile);

      // 1. หาข้อมูลแมวทั้งหมดของ User ไว้ทำ PDF
      const { data: catData, error: catError } = await supabase
        .from("cats")
        .select("*")
        .eq("owner_id", session.user.id)
        .limit(1)
        .single();

      if (catError || !catData) {
        console.log("No cat found");
        setLoading(false);
        setCurrentScore(100); // ถ้าไม่มีแมว ให้เต็ม 100 ไปก่อน
        return;
      }
      setCatDetails(catData);

      let daysLimit = selectedPeriod === "1 MONTH" ? 30 : 7;

      // 2. ดึง Log ย้อนหลังตามช่วงเวลา พร้อมข้อมูลรายละเอียด
      const { data: logsData, error: logsError } = await supabase
        .from("daily_logs")

        .select("*, normal_logs(*), something_off_logs(*)") 

        .eq("cat_id", catData.id)
        .order("log_date", { ascending: false })
        .limit(daysLimit);

      if (logsError) throw logsError;

      // ====================================================
      // 🎯 ส่วนคำนวณคะแนนเฉลี่ย 7 วัน (หัวใจสำคัญ)
      // ====================================================
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

        unifiedLogs.forEach(log => {
          const analysis = analyzeHealthLog(log);
          totalScore += analysis.score;
        });

        const averageScore = Math.round(totalScore / unifiedLogs.length);
        setCurrentScore(averageScore);
      } else {
        setCurrentScore(100);
      }

      // 3. เตรียมข้อมูลกราฟ
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
      const logsForExport = rawLogs.slice(0, 7); // เอาแค่ 7 วันล่าสุดเวลา Generate
      
      const rowsHTML = logsForExport.map((log) => {
        const dateObj = new Date(log.log_date);
        const dateStr = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}/${dateObj.getFullYear()}`;
        
        let typeText = log.log_type === 'normal' ? 'Normal' : 'Something Off';
        let color = log.log_type === 'normal' ? 'green' : 'orange';

        // หาแค่ค่าคร่าวๆ ถ้ามี log_type something_off แสดงอาการ
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>

        {/* Header */}
        <HomeHeader
          onProfile={() => onNavigate && onNavigate('Profile')}
          onNotify={() => console.log("Notify")}
          onSetting={() => onNavigate && onNavigate('UserInfo')}
          userProfile={userProfile}
        />

        {/* ===== ส่วนแสดงผลคะแนน (คล้าย AssessmentScreen) ===== */}
        {/* ===== ส่วนแสดงผลคะแนน (คล้าย AssessmentScreen) ===== */}
        <View style={[styles.scoreContainer, { marginTop: 40 }]}>
          {loading || currentScore === null ? (
            <ActivityIndicator size="large" color="#4FD1C5" style={{ marginBottom: 20 }} />
          ) : (
            <>
              <View style={[styles.scoreCircleLarge, { borderColor: status.color }]}>
                <Text style={[styles.statusLabelLarge, { color: status.color }]}>{status.label}</Text>
                <Text style={{ fontSize: 40, fontWeight: 'bold', color: status.color }}>{currentScore}</Text>
              </View>
              <Text style={[styles.statusDescBelow, { color: status.color }]}>{status.text}</Text>
            </>
          )}

        </View>

        {/* ===== Latest Health Assessment ===== */}
        <View style={styles.assessmentCard}>
          <Text style={styles.assessmentTitle}>Latest Health Assessment</Text>
          <View style={styles.assessmentContent}>
            <View style={styles.assessmentInfo}>
              <Text style={styles.assessmentDate}>Oct 22 • <Text style={styles.assessmentRisk}>Moderate Risk</Text></Text>
            </View>
            <View style={styles.assessmentButtons}>
              <TouchableOpacity
                style={styles.viewResultButton}
                onPress={() => onNavigate?.('Result')}
              >
                <Text style={styles.viewResultButtonText}>View Result</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.viewHistoryButton}
                onPress={() => console.log('View History pressed')}
              >
                <Text style={styles.viewHistoryButtonText}>View History</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ===== System Risk Analysis ===== */}
        <View style={styles.riskAnalysisContainer}>
          <View style={styles.riskAnalysisHeader}>
            <Text style={styles.riskAnalysisTitle}>SYSTEM RISK ANALYSIS</Text>
            <TouchableOpacity onPress={() => console.log('View Detail pressed')}>
              <Text style={styles.viewDetailText}>View Detail</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.riskAnalysisCard}>
            {/* Activity Level */}
            <View style={styles.riskItem}>
              <Text style={styles.riskItemLabel}>Activity Level</Text>
              <View style={styles.progressBarBackground}>
                <View style={[styles.progressBarFill, { width: '45%', backgroundColor: '#2D4A47' }]} />
              </View>
            </View>

            {/* Litter Box Usage */}
            <View style={styles.riskItem}>
              <Text style={styles.riskItemLabel}>Litter Box Usage</Text>
              <View style={styles.progressBarBackground}>
                <View style={[styles.progressBarFill, { width: '85%', backgroundColor: '#2D4A47' }]} />
              </View>
            </View>

            {/* Abnormal Posture Detection */}
            <View style={styles.riskItem}>
              <Text style={styles.riskItemLabel}>Abnormal Posture Detection</Text>
              <View style={styles.progressBarBackground}>
                <View style={[styles.progressBarFill, { width: '5%', backgroundColor: '#2D4A47' }]} />
              </View>
            </View>

            <Text style={styles.riskAnalysisFooter}>Based on the last 7 days of activity</Text>
          </View>
        </View>



        {/* ===== Health Trends Chart ===== */}
        <Text style={styles.sectionTitle}>Health Trends</Text>
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View style={styles.tagsContainer}>
              <View style={[styles.tag, styles.tagFood]}>
                <Text style={styles.tagText}>Food</Text>
              </View>
              <View style={[styles.tag, styles.tagWater]}>
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

        {/* ===== Timeline & Export Buttons ===== */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: '#B8D8D4',
              borderRadius: 24,
              paddingVertical: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
              elevation: 3
            }}
            onPress={() => onNavigate && onNavigate('Timeline')}
          >
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#2D4A47', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
              <MaterialCommunityIcons name="chart-timeline-variant" size={20} color="#fff" />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#2D4A47' }}>Timeline</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: '#B8D8D4',
              borderRadius: 24,
              paddingVertical: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
              elevation: 3
            }}
            onPress={handleExportPDF}
          >
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#2D4A47', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
              <MaterialCommunityIcons name="export-variant" size={20} color="#fff" />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#2D4A47' }}>Export</Text>
          </TouchableOpacity>
        </View>



      </ScrollView>

      {/* ===== Bottom Nav ===== */}
      <BottomNav
        current="Overview"
        onNavigate={onNavigate}
      />
    </SafeAreaView>
  );
}

// ===== Styles เฉพาะหน้า Dashboard =====
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F7FA', // สีพื้นหลังเทาอ่อนๆ สบายตา
  },
  scrollContainer: {

    padding: 20,
    paddingBottom: 100, // Increased for BottomNav
  },
  // Style ส่วนคะแนนใหม่ (New Circular Design)
  scoreContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  scoreCircleLarge: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff', // พื้นหลังวงกลมเป็นสีขาว
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  statusLabelLarge: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  statusDescBelow: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },

  // Style หัวข้อ section
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    marginLeft: 4,
  },
  // Style กล่องเปล่าๆ (Placeholder Styles)
  emptyBoxLarge: {
    height: 200,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed', // เส้นประ
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyBoxMedium: {
    height: 120,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyBoxContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  emptyBoxSmall: {
    width: '48%', // แบ่งครึ่ง
    height: 100,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 16,
    color: '#BDBDBD',
    fontWeight: 'bold',
  },
  placeholderSubText: {
    fontSize: 12,
    color: '#BDBDBD',
    marginTop: 8,
  },
  // Chart card styles
  chartCard: {
    backgroundColor: '#334e4bff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
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
    paddingHorizontal: 12,
    paddingVertical: 4,
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
    fontSize: 15,
    fontWeight: '500',
  },
  periodContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: 12,
    gap: 4,
  },
  periodButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    minWidth: 80,
  },
  periodButtonActive: {
    backgroundColor: '#FFFFFF',
  },
  periodText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  periodTextActive: {
    color: '#2D4A47',
    fontWeight: '700',
  },
  // Latest Health Assessment styles
  assessmentCard: {
    backgroundColor: '#5F7671',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  assessmentTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  assessmentContent: {
    flexDirection: 'column',
    gap: 12,
  },
  assessmentInfo: {
    marginBottom: 8,
  },
  assessmentDate: {
    fontSize: 16,
    color: '#B8D8D4',
    fontWeight: '600',
  },
  assessmentRisk: {
    color: '#E0E0E0',
    fontWeight: '400',
  },
  assessmentButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  viewResultButton: {
    flex: 1,
    backgroundColor: '#B8D8D4',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  viewResultButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2D4A47',
  },
  viewHistoryButton: {
    flex: 1,
    backgroundColor: '#2D4A47',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  viewHistoryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffffff',
  },
  // System Risk Analysis styles
  riskAnalysisContainer: {
    marginBottom: 24,
  },
  riskAnalysisHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  riskAnalysisTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D4A47',
  },
  viewDetailText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D4A47',
  },
  riskAnalysisCard: {
    backgroundColor: '#B8D8D4',
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  riskItem: {
    marginBottom: 16,
  },
  riskItemLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D4A47',
    marginBottom: 8,
  },
  progressBarBackground: {
    height: 24,
    backgroundColor: '#D8E8E5',
    borderRadius: 12,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 12,
  },
  riskAnalysisFooter: {
    fontSize: 14,
    color: '#5F7671',
    marginTop: 8,
    fontStyle: 'italic',
  },
});