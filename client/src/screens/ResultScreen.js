import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Modal,
  Dimensions
} from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle } from 'react-native-svg';
import styles from "../styles/resultStyles";
import supabase from "./config/supabaseClient"; // 🚨 เพิ่มบรรทัดนี้เพื่อดึงฐานข้อมูล
import AlertEngine from '../services/AlertEngine';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ===== รายชื่อโรค =====
const DISEASE_OPTIONS = [
  { label: "โรคนิ่ว", value: "Urolithiasis" },
  { label: "โรคไต", value: "Kidney Disease" },
  { label: "โรคตับและฟัน", value: "Gum Disease" },
  { label: "โรคหัด", value: "Feline Panleukopenia" },
  { label: "โรคเบาหวาน", value: "Diabetes" },
];

const INITIAL_RISK_DATA = [
  { label: "Kidney Disease", value: "No Data", score: 0 },
  { label: "Diabetes", value: "No Data", score: 0 },
  { label: "Urolithiasis", value: "No Data", score: 0 },
  { label: "Gum Disease", value: "No Data", score: 0 },
  { label: "Feline Panleukopenia", value: "No Data", score: 0 },
];

const getRiskColor = (riskLevel) => {
  switch (riskLevel) {
    case "Normal": return "#2ecc71";
    case "Low": return "#1abc9c";
    case "Moderate": return "#f1c40f";
    case "High": return "#e67e22";
    case "Extreme": return "#e74c3c";
    default: return "#bdc3c7";
  }
};

const getOverallRiskDetails = (score) => {
  if (score === null || score === undefined || score === "No Data") return { label: "No Data", color: "#B0B0B0", text: "No Data" };
  const numScore = Number(score);
  if (isNaN(numScore) || numScore === 0) return { label: "0", color: "#B0B0B0", text: "No Data" };

  if (numScore >= 91) return { label: `${numScore}%`, color: "#e74c3c", text: "Extreme Risk" };
  if (numScore >= 71) return { label: `${numScore}%`, color: "#e67e22", text: "High Risk" };
  if (numScore >= 51) return { label: `${numScore}%`, color: "#f1c40f", text: "Moderate Risk" };
  if (numScore >= 21) return { label: `${numScore}%`, color: "#1abc9c", text: "Low Risk" };
  return { label: `${numScore}%`, color: "#2ecc71", text: "Normal" };
};

const formatPreventionData = (data) => {
  if (!data) return "";
  let text = `${data.intro}\n\n`;
  if (data.points && Array.isArray(data.points)) {
    data.points.forEach((p) => {
      text += `• ${p.title}:\n   ${p.desc}\n\n`;
    });
  }
  return text.trim();
};

const formatCounselingData = (data) => {
  if (!data) return "";
  let text = `${data.intro}\n\n`;
  if (data.red_flags && Array.isArray(data.red_flags)) {
    data.red_flags.forEach((f) => {
      text += `⚠️ ${f.symptom}:\n    ${f.meaning}\n\n`;
    });
  }
  return text.trim();
};

const ResultScreenFactory = {
  async fetchAssessment(catId) {
    try {
      const API_URL = "http://10.0.2.2:3000/api/assessment"; // 💡 แก้ IP ถ้าเทสบนมือถือจริง
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catId }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error("fetchAssessment error:", error);
      return { success: false, error: error.message };
    }
  },

  async fetchGuidance(condition, catId) {
    try {
      const API_URL = "http://10.0.2.2:3000/api/guidance";
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ condition, catId }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      const data = await response.json();

      return {
        success: true,
        preventionData: data.prevention,
        counselingData: data.counseling
      };
    } catch (error) {
      console.error("fetchGuidance error:", error.message);
      return { success: false, error: error.message };
    }
  }
};

export default function ResultScreen({ onBack, onSave, onNavigate, route, session }) {
  const insets = useSafeAreaInsets();
  const [loadingData, setLoadingData] = useState(true);
  const [loadingGuidance, setLoadingGuidance] = useState(false);
  const [showNoDataModal, setShowNoDataModal] = useState(false);
  const [selectedConditionValue, setSelectedConditionValue] = useState(null);
  const [selectedConditionLabel, setSelectedConditionLabel] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [preventionData, setPreventionData] = useState(null);
  const [counselingData, setCounselingData] = useState(null);
  const [riskData, setRiskData] = useState(INITIAL_RISK_DATA);
  const [overallScore, setOverallScore] = useState("No Data");
  const [summaryTitle, setSummaryTitle] = useState("");
  const [summaryDesc, setSummaryDesc] = useState("");

  // 🚨 สร้าง State ไว้รอรับ ID แมว
  const [catId, setCatId] = useState(route?.params?.catId || null);

  const handleSaveAssessment = async () => {
    try {
      await AlertEngine.logEvent({
        type: 'assessment_saved',
        severity: 'success',
        title: 'Assessment Saved',
        desc: `Overall risk score: ${overallScore === 'No Data' ? '--' : overallScore}`,
        details: summaryTitle || '',
        dedupeKey: `assessment_saved:${catId || 'no_cat'}:${overallScore}`,
        cooldownMs: 2 * 60 * 1000,
      });
    } catch (_) {
      // keep original save flow even if alert logging fails
    } finally {
      if (onSave) onSave();
    }
  };

  // 🚨 Effect ที่ 1: ถ้าไม่ได้รับ catId มาจากหน้าก่อน ให้ดึงจากฐานข้อมูลเอง
  useEffect(() => {
    const fetchCat = async () => {
      if (catId) return; // ถ้ามีอยู่แล้วไม่ต้องดึงใหม่

      try {
        let currentSession = session;
        if (!currentSession) {
          const { data } = await supabase.auth.getSession();
          currentSession = data?.session;
        }

        if (currentSession?.user?.id) {
          const { data, error } = await supabase
            .from('cats')
            .select('id')
            .eq('owner_id', currentSession.user.id)
            .limit(1)
            .single();

          if (data) {
            setCatId(data.id);
          } else {
            // ถ้าไม่มีแมวเลยจริงๆ
            setShowNoDataModal(true);
            setLoadingData(false);
          }
        }
      } catch (err) {
        console.log("Error fetching cat ID:", err);
      }
    };
    fetchCat();
  }, [session, catId]);

  // 🚨 Effect ที่ 2: เมื่อได้ catId มาแล้ว ค่อยส่งไปประเมินที่ Server
  useEffect(() => {
    const loadInitialData = async () => {
      if (!catId) return; // 💡 รอให้ได้ catId มาก่อนค่อยทำงาน

      setLoadingData(true);
      try {
        const result = await ResultScreenFactory.fetchAssessment(catId);

        if (result.success) {
          const validRiskData = (result.riskData && result.riskData.length > 0)
            ? result.riskData
            : INITIAL_RISK_DATA;

          setRiskData(validRiskData);
          setOverallScore(result.overallScore !== undefined ? result.overallScore : result.overallRisk || "No Data");
          setSummaryTitle(result.summaryTitle || "");
          setSummaryDesc(result.summaryDesc || "");

          // แจ้งเตือนเมื่อไม่มีข้อมูลของวันนี้
          if (result.requireTodayLog || result.overallRisk === "No Data" || result.overallScore === 0) {
            setShowNoDataModal(true);
          }

        } else {
          Alert.alert("Error", "ไม่สามารถวิเคราะห์ข้อมูลได้");
          setRiskData(INITIAL_RISK_DATA);
        }
      } catch (error) {
        console.error(error);
        Alert.alert("Connection Error", "ไม่สามารถติดต่อ Server ได้");
        setRiskData(INITIAL_RISK_DATA);
      }
      finally { setLoadingData(false); }
    };

    loadInitialData();
  }, [catId]);

  useEffect(() => {
    if (!selectedConditionValue) {
      setPreventionData(null);
      setCounselingData(null);
      return;
    }
    const loadGuidance = async () => {
      setLoadingGuidance(true);
      try {
        const result = await ResultScreenFactory.fetchGuidance(selectedConditionValue, catId);
        if (result.success) {
          setPreventionData(result.preventionData);
          setCounselingData(result.counselingData);
        } else {
          Alert.alert("Connection Error", "ไม่สามารถเชื่อมต่อ Server ได้");
        }
      } catch (error) { Alert.alert("Error", "Failed to load guidance"); }
      finally { setLoadingGuidance(false); }
    };
    loadGuidance();
  }, [selectedConditionValue, catId]);

  if (loadingData) {
    return (
      <LinearGradient
        colors={['#FFFFFF', '#B2E1DB']}
        locations={[0.42, 1]}
        style={[styles.container, { justifyContent: "center", alignItems: "center" }]}
      >
        <ActivityIndicator size="large" color="#1abc9c" />
        <Text style={{ marginTop: 10, color: '#666' }}>กำลังวิเคราะห์ข้อมูลสุขภาพแมว...</Text>
      </LinearGradient>
    );
  }

  const numScore = Number(overallScore) || 0;
  const clampedScore = isNaN(numScore) ? 0 : Math.max(0, Math.min(100, numScore));
  const radius = 82;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedScore / 100) * circumference;
  const riskDetails = getOverallRiskDetails(overallScore);

  return (
    <LinearGradient
      colors={['#FFFFFF', '#B2E1DB']}
      locations={[0.42, 1]}
      style={styles.container}
    >
      <View style={{ height: insets.top }} />

      <Modal
        animationType="fade"
        transparent={true}
        visible={showNoDataModal}
        onRequestClose={() => setShowNoDataModal(false)}
      >
        <View style={customStyles.modalOverlay}>
          <View style={customStyles.modalContainer}>
            <Text style={customStyles.modalTitle}>ขาดข้อมูลของวันนี้</Text>
            <Text style={customStyles.modalText}>
              ระบบประเมินความเสี่ยงจำเป็นต้องใช้ข้อมูลสุขภาพอัปเดตล่าสุดของ "วันนี้" ไปบันทึก Daily Log ตอนนี้เลยไหม?
            </Text>
            <View style={customStyles.modalButtonRow}>
              <TouchableOpacity
                style={[customStyles.modalButton, customStyles.modalButtonCancel]}
                onPress={() => setShowNoDataModal(false)}
              >
                <Text style={customStyles.modalButtonCancelText}>ไว้ทีหลัง</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[customStyles.modalButton, customStyles.modalButtonConfirm]}
                onPress={() => {
                  setShowNoDataModal(false);
                  if (onNavigate) onNavigate({ screen: 'LogDaily' });
                }}
              >
                <Text style={customStyles.modalButtonConfirmText}>บันทึกเลย</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}><Text style={styles.backArrow}>‹</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Assessment</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} nestedScrollEnabled={true}>
        <View style={styles.circleWrapper}>
          <View style={styles.circleBg}>
            <Svg width="180" height="180" style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
              <Circle
                cx="90"
                cy="90"
                r={radius}
                stroke="#E1ECEB"
                strokeWidth="16"
                fill="none"
              />
              {clampedScore > 0 && (
                <Circle
                  cx="90"
                  cy="90"
                  r={radius}
                  stroke={riskDetails.color}
                  strokeWidth="16"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="none"
                />
              )}
            </Svg>
            <Text style={[styles.riskText, { color: riskDetails.color, fontSize: riskDetails.label === "No Data" ? 22 : undefined }]}>{riskDetails.label}</Text>
          </View>
          <Text style={[styles.recommendText, { color: riskDetails.color }]}>{riskDetails.text}</Text>
          <Text style={styles.subText}>Overall Health Risk</Text>
        </View>

        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>{summaryTitle}</Text>
          <Text style={styles.summaryDesc}>{summaryDesc}</Text>
        </View>

        <Text style={styles.sectionTitle}>Risk Breakdown</Text>
        {riskData.map((item, index) => {
          const barColor = getRiskColor(item.value);
          return (
            <View key={index} style={styles.riskItem}>
              <View style={styles.riskRow}>
                <Text style={styles.riskLabel}>{item.label}</Text>
                <Text style={[styles.riskValue, { color: barColor }]}>{item.value}</Text>
              </View>
              <View style={styles.riskBarBg}>
                <View
                  style={[
                    styles.riskBarFill,
                    {
                      width: `${item.score}%`,
                      backgroundColor: barColor
                    }
                  ]}
                />
              </View>
            </View>
          );
        })}

        <Text style={styles.sectionTitle}>Recommended Approach</Text>

        <View style={[styles.card, { zIndex: 2000, elevation: 0, shadowOpacity: 0, width: SCREEN_WIDTH - 40, alignSelf: 'center', minHeight: 204, borderWidth: 0.5, borderColor: '#A6A6A6' }]}>
          <Text style={styles.cardTitle}>Disease Prevention</Text>

          <View style={{ marginBottom: 15, marginTop: 10, zIndex: 3000, width: '45%' }}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setIsDropdownOpen(!isDropdownOpen)}
              style={customStyles.dropdownHeader}
            >
              <Text
                style={{ fontSize: 11, color: selectedConditionLabel ? '#000' : '#888', flexShrink: 1, paddingRight: 8 }}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {selectedConditionLabel || "เลือกโรค..."}
              </Text>
              <Text style={{ fontSize: 12, color: '#666' }}>{isDropdownOpen ? "▲" : "▼"}</Text>
            </TouchableOpacity>

            {isDropdownOpen && (
              <View style={customStyles.dropdownList}>
                {(() => {
                  const elevatedRiskOptions = DISEASE_OPTIONS.filter(option => {
                    const riskItem = riskData.find(r => r.label === option.value);
                    return riskItem && riskItem.value !== "Normal" && riskItem.value !== "No Data";
                  });

                  if (elevatedRiskOptions.length === 0) {
                    return (
                      <View style={{ padding: 10 }}>
                        <Text style={{ fontSize: 11, color: '#888', textAlign: 'center' }}>ไม่มีโรคที่มีความเสี่ยง</Text>
                      </View>
                    );
                  }

                  return elevatedRiskOptions.map((item, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[customStyles.dropdownItem, selectedConditionValue === item.value && customStyles.dropdownItemActive]}
                      onPress={() => {
                        setSelectedConditionValue(item.value);
                        setSelectedConditionLabel(item.label);
                        setIsDropdownOpen(false);
                      }}
                    >
                      <Text style={{ fontSize: 11, color: selectedConditionValue === item.value ? '#1abc9c' : '#333' }}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  ));
                })()}
              </View>
            )}
          </View>

          {loadingGuidance ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#1abc9c" />
              <Text style={styles.loadingText}>กำลังขอคำแนะนำจาก AI...</Text>
            </View>
          ) : (
            <View style={{ flex: 1, paddingBottom: 10 }}>
              {preventionData ? (
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 8, color: '#333' }}>
                    {preventionData.title}
                  </Text>
                  <Text style={styles.cardDesc}>
                    {formatPreventionData(preventionData)}
                  </Text>
                </View>
              ) : (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={[styles.cardDesc, { fontSize: 11, textAlign: 'center', color: '#888' }]}>
                    กรุณาเลือกโรคด้านบนเพื่อดูคำแนะนำ
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        <View style={[styles.card, { zIndex: 1000, marginTop: 5, elevation: 0, shadowOpacity: 0, width: SCREEN_WIDTH - 40, alignSelf: 'center', minHeight: 204, borderWidth: 0.5, borderColor: '#A6A6A6' }]}>
          <Text style={styles.cardTitle}>Counseling</Text>
          {loadingGuidance ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#1abc9c" />
            </View>
          ) : (
            <View style={{ flex: 1, paddingBottom: 10 }}>
              {counselingData ? (
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 8, color: '#D32F2F' }}>
                    {counselingData.title}
                  </Text>
                  <Text style={styles.cardDesc}>
                    {formatCounselingData(counselingData)}
                  </Text>
                </View>
              ) : (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={[styles.cardDesc, { fontSize: 11, textAlign: 'center', color: '#888' }]}>
                    ข้อมูลจะแสดงหลังจากเลือกโรคแล้ว
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        <TouchableOpacity
          style={{
            backgroundColor: '#1abc9c',
            width: SCREEN_WIDTH - 60,
            alignSelf: 'center',
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: 'center',
            marginTop: 20,
            marginBottom: 20,
          }}
          onPress={handleSaveAssessment}
          activeOpacity={0.8}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Save Assessment</Text>
        </TouchableOpacity>

      </ScrollView>
    </LinearGradient>
  );
}

const customStyles = StyleSheet.create({
  dropdownHeader: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 32
  },
  dropdownList: { marginTop: 4, borderWidth: 1, borderColor: '#eee', borderRadius: 8, backgroundColor: '#fff', position: 'absolute', top: 38, left: 0, right: 0, zIndex: 9999, elevation: 5 },
  dropdownItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  dropdownItemActive: { backgroundColor: '#e6fffa' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalContainer: {
    width: '82%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 12
  },
  modalText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%'
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 6
  },
  modalButtonCancel: {
    backgroundColor: '#F0F0F0'
  },
  modalButtonConfirm: {
    backgroundColor: '#1abc9c'
  },
  modalButtonCancelText: {
    color: '#7f8c8d',
    fontWeight: 'bold',
    fontSize: 15
  },
  modalButtonConfirmText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15
  }
});
