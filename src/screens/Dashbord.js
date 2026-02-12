import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity, Dimensions, ActivityIndicator } from 'react-native';
import BottomNav from "../components/BottomNav";
import HealthTrendsChart from "../components/HealthTrendsChart";
import supabase from "./config/supabaseClient";

// ===== 1. Logic การคำนวณ (เหมือน ResultScreen) =====
const getHealthStatus = (score) => {
  if (score >= 80) return { label: "Excellent", color: "#6FCF97", text: "สุขภาพแข็งแรงดีเยี่ยม" };
  if (score >= 60) return { label: "Good", color: "#2D9CDB", text: "สุขภาพดี ปกติ" };
  if (score >= 40) return { label: "Fair", color: "#F2C94C", text: "ควรเริ่มดูแลใกล้ชิด" };
  return { label: "Attention", color: "#EB5757", text: "ควรปรึกษาแพทย์" };
};


export default function Dashboard({ onBack, onNavigate, session }) {
  // สมมติคะแนนรวม (ในอนาคตอาจจะดึงมาจาก Database)
  const [currentScore, setCurrentScore] = useState(75); 
  const status = getHealthStatus(currentScore);

  // Chart data state
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState("7 DAY");

  useEffect(() => {
    if (session?.user) {
      fetchLast7DaysLogs();
    } else {
      setLoading(false);
    }
  }, [session]);

  const fetchLast7DaysLogs = async () => {
    try {
      setLoading(true);

      // First, get the cat ID for this user
      const { data: catData, error: catError } = await supabase
        .from("cats")
        .select("id")
        .eq("owner_id", session.user.id)
        .limit(1)
        .single();

      if (catError) throw catError;
      if (!catData) {
        setLoading(false);
        return;
      }

      // Fetch last 7 days of logs
      const { data: logsData, error: logsError } = await supabase
        .from("daily_logs")
        .select("log_date, food_intake, water_level")
        .eq("cat_id", catData.id)
        .order("log_date", { ascending: false })
        .limit(7);

      if (logsError) throw logsError;

      // Reverse to get chronological order (oldest to newest)
      const logs = (logsData || []).reverse();

      // Transform data for chart
      const labels = logs.map((log) => {
        const date = new Date(log.log_date);
        return `${date.getDate()}/${date.getMonth() + 1}`;
      });

      const foodData = logs.map((log) => log.food_intake || 0);
      const waterData = logs.map((log) => log.water_level || 0);

      setChartData({
        labels: labels.length > 0 ? labels : [],
        foodData: foodData.length > 0 ? foodData : [],
        waterData: waterData.length > 0 ? waterData : [],
      });

      setLoading(false);
    } catch (error) {
      console.error("Error fetching logs:", error);
      setLoading(false);
    }
  };

  const periods = ["7 DAY"];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        
        {/* Header */}
        <View style={styles.header}>
            <Text style={styles.headerTitle}>Dashboard</Text>
        </View>

        {/* ===== ส่วนแสดงผลคะแนน (คล้าย AssessmentScreen) ===== */}
        <View style={styles.scoreContainer}>
            <View style={[styles.scoreCircleLarge, { borderColor: status.color }]}>
                <Text style={[styles.statusLabelLarge, { color: status.color }]}>{status.label}</Text>
            </View>
            <Text style={[styles.statusDescBelow, { color: status.color }]}>{status.text}</Text>
            
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
                disabled={period !== "7 DAY"}
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
  header: {
    marginBottom: 10,
    marginTop: 10,
    alignItems: 'center', // จัดกึ่งกลาง Header ด้วย
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
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
    fontSize: 12,
    fontWeight: '500',
  },
  periodContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
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
    color: '#FFFFFF',
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