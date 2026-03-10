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
  Dimensions,
  Platform
} from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Path, Defs, LinearGradient as SvgLinearGradient, Stop, G } from 'react-native-svg';
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  withTiming,
  useAnimatedProps,
  useAnimatedStyle,
  Easing
} from "react-native-reanimated";
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
  if (isNaN(numScore) || numScore === 0) return { label: "0", color: "#B0B0B0", text: "NULL" };

  if (numScore >= 91) return { label: `${numScore}%`, color: "#e74c3c", text: "Extreme Risk" };
  if (numScore >= 71) return { label: `${numScore}%`, color: "#e67e22", text: "High Risk" };
  if (numScore >= 51) return { label: `${numScore}%`, color: "#f1c40f", text: "Moderate Risk" };
  if (numScore >= 21) return { label: `${numScore}%`, color: "#1abc9c", text: "Low Risk" };
  return { label: `${numScore}%`, color: "#2ecc71", text: "Normal" };
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const tintHex = (hex, amount = 0) => {
  const raw = String(hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return hex;
  const r = Math.max(0, Math.min(255, parseInt(raw.slice(0, 2), 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(raw.slice(2, 4), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(raw.slice(4, 6), 16) + amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
};

function CatRiskMeter({ score = 0, color = "#2ecc71", size = 190, mainText = "0", subText = "" }) {
  const SIZE = 190;
  const STROKE = 12;
  const RADIUS = 64;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  const safeScore = Math.max(0, Math.min(100, Number(score) || 0));
  const scale = (size || 190) / 190;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(safeScore / 100, {
      duration: 1500,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [safeScore]);

  const animatedProps = useAnimatedProps(() => {
    const dashoffset = CIRCUMFERENCE * (1 - progress.value);
    return {
      strokeDashoffset: dashoffset,
    };
  });

  const pawOrbitStyle = useAnimatedStyle(() => {
    const angle = progress.value * 2 * Math.PI - Math.PI / 2;
    const pawX = SIZE / 2 + RADIUS * Math.cos(angle);
    const pawY = SIZE / 2 + RADIUS * Math.sin(angle);

    return {
      position: "absolute",
      width: 32,
      height: 32,
      left: pawX - 16,
      top: pawY - 16,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 10,
    };
  });

  const ringStart = tintHex(color, 35);
  const ringEnd = tintHex(color, -25);

  return (
    <View style={{ width: size, height: size, justifyContent: "center", alignItems: "center" }}>
      <View style={{ width: SIZE, height: SIZE, justifyContent: "center", alignItems: "center", position: "relative", transform: [{ scale }] }}>
        <Svg width={SIZE} height={SIZE}>
          <Defs>
            <SvgLinearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={ringStart} />
              <Stop offset="100%" stopColor={ringEnd} />
            </SvgLinearGradient>
          </Defs>

          {/* WHITE CAT SHAPE SHADOW */}
          <G y="8" x="0">
            <Path d="M 48 50 Q 35 25 42 12 Q 45 8 48 12 Q 65 20 85 28 Z" fill="rgba(0,0,0,0.35)" />
            <Path d="M 142 50 Q 155 25 148 12 Q 146 8 142 12 Q 125 20 105 28 Z" fill="rgba(0,0,0,0.35)" />
            <Circle cx={SIZE / 2} cy={SIZE / 2} r="76" fill="rgba(0,0,0,0.12)" />
            <Path d="M 38 85 Q 15 70 -5 82" stroke="rgba(0,0,0,0.05)" strokeWidth="8" strokeLinecap="round" fill="none" />
            <Path d="M 35 105 Q 15 95 -8 102" stroke="rgba(0,0,0,0.05)" strokeWidth="8" strokeLinecap="round" fill="none" />
            <Path d="M 38 125 Q 15 115 -5 120" stroke="rgba(0,0,0,0.05)" strokeWidth="8" strokeLinecap="round" fill="none" />
            <Path d="M 152 85 Q 175 70 195 82" stroke="rgba(0,0,0,0.05)" strokeWidth="8" strokeLinecap="round" fill="none" />
            <Path d="M 155 105 Q 175 95 198 102" stroke="rgba(0,0,0,0.05)" strokeWidth="8" strokeLinecap="round" fill="none" />
            <Path d="M 152 125 Q 175 115 195 120" stroke="rgba(0,0,0,0.05)" strokeWidth="8" strokeLinecap="round" fill="none" />
          </G>

          {/* WHITE CAT SHAPE BASE */}
          <Path d="M 48 50 Q 35 25 42 12 Q 45 8 48 12 Q 65 20 85 28 Z" fill="#F1F5F9" stroke="#F1F5F9" strokeWidth="1" />
          <Path d="M 142 50 Q 155 25 148 12 Q 146 8 142 12 Q 125 20 105 28 Z" fill="#F1F5F9" stroke="#F1F5F9" strokeWidth="1" />
          <Path d="M 52 42 Q 42 22 50 16 Q 60 25 72 32" fill="#FFE4E6" opacity="0.6" />
          <Path d="M 138 42 Q 148 22 140 16 Q 130 25 118 32" fill="#FFE4E6" opacity="0.6" />

          {/* WHISKERS */}
          <Path d="M 38 85 Q 15 70 -5 82" stroke="#F1F5F9" strokeWidth="8" strokeLinecap="round" fill="none" />
          <Path d="M 35 105 Q 15 95 -8 102" stroke="#F1F5F9" strokeWidth="8" strokeLinecap="round" fill="none" />
          <Path d="M 38 125 Q 15 115 -5 120" stroke="#F1F5F9" strokeWidth="8" strokeLinecap="round" fill="none" />
          <Path d="M 152 85 Q 175 70 195 82" stroke="#F1F5F9" strokeWidth="8" strokeLinecap="round" fill="none" />
          <Path d="M 155 105 Q 175 95 198 102" stroke="#F1F5F9" strokeWidth="8" strokeLinecap="round" fill="none" />
          <Path d="M 152 125 Q 175 115 195 120" stroke="#F1F5F9" strokeWidth="8" strokeLinecap="round" fill="none" />
          <Circle cx={SIZE / 2} cy={SIZE / 2} r="76" fill="#F1F5F9" />

          <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke="#FFE4E6" fill="none" strokeWidth={STROKE} />

          {safeScore > 0 && (
            <AnimatedCircle
              stroke="url(#progressGrad)"
              fill="none"
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              strokeWidth={STROKE}
              strokeDasharray={CIRCUMFERENCE.toString()}
              animatedProps={animatedProps}
              strokeLinecap="round"
              rotation="-90"
              origin={`${SIZE / 2},${SIZE / 2}`}
            />
          )}
        </Svg>

        <View style={{ position: "absolute", alignItems: "center", justifyContent: "center", top: 55, width: 120, alignSelf: "center" }}>
          <MaterialCommunityIcons name="cat" size={44} color={color} />
          <Text style={{ fontSize: 13, fontWeight: "700", letterSpacing: 1, marginTop: 2, marginBottom: -4, color: color, textAlign: "center" }} numberOfLines={1}>
            {String(subText).toUpperCase()}
          </Text>
          {mainText !== "No Data" && mainText !== "NULL" && (
            <Text style={{ fontSize: 36, fontWeight: "800", lineHeight: 40, color: color, marginTop: 0 }}>
              {mainText.replace('%', '')}
            </Text>
          )}
        </View>

        {safeScore > 0 && (
          <Animated.View style={pawOrbitStyle}>
            <View style={{
              width: 32, height: 32, borderRadius: 16, backgroundColor: "#FFFFFF",
              alignItems: "center", justifyContent: "center", shadowColor: "#000",
              shadowOpacity: 0.12, shadowRadius: 5, shadowOffset: { width: 0, height: 3 },
              borderWidth: 2, borderColor: "#DCE6EB"
            }}>
              <MaterialCommunityIcons name="heart" size={18} color={color} />
            </View>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

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
  const loadSource = route?.params?.source;
  const loadFromDb = loadSource === 'db';

  const normalizeKey = (value) => String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

  const buildRiskDataFromAssessmentRow = (row) => {
    const candidate =
      row?.risk_data ??
      row?.riskData ??
      row?.disease_risks ??
      row?.diseaseRisks ??
      row?.risk_breakdown ??
      row?.riskBreakdown;

    if (Array.isArray(candidate)) {
      const mapped = candidate
        .map((item) => ({
          label: item?.label ?? item?.name ?? '',
          value: item?.value ?? item?.riskLevel ?? item?.level ?? 'No Data',
          score: item?.score ?? item?.riskScore ?? item?.percent ?? 0,
        }))
        .filter((item) => item.label);

      return mapped.length > 0 ? mapped : INITIAL_RISK_DATA;
    }

    if (candidate && typeof candidate === 'object') {
      const keys = Object.keys(candidate);
      const next = INITIAL_RISK_DATA.map((base) => {
        const matchKey = keys.find((k) => normalizeKey(k) === normalizeKey(base.label));
        const entry = matchKey ? candidate[matchKey] : null;

        if (entry && typeof entry === 'object') {
          return {
            label: base.label,
            value: entry?.value ?? entry?.riskLevel ?? entry?.level ?? base.value,
            score: entry?.score ?? entry?.riskScore ?? entry?.percent ?? base.score,
          };
        }

        if (typeof entry === 'string') {
          return { ...base, value: entry };
        }

        return base;
      });

      const hasAny = next.some((item) => item.value !== 'No Data' || (Number(item.score) || 0) > 0);
      return hasAny ? next : INITIAL_RISK_DATA;
    }

    const getFirst = (obj, keys) => {
      for (const k of keys) {
        if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
      }
      return undefined;
    };

    const colSpec = [
      {
        label: 'Kidney Disease',
        levelKeys: ['kidney_disease_risk', 'kidney_risk_level', 'kidney_disease_risk_level', 'kidney_level'],
        scoreKeys: ['kidney_disease_score', 'kidney_risk_score', 'kidney_disease_risk_score', 'kidney_score'],
      },
      {
        label: 'Diabetes',
        levelKeys: ['diabetes_risk', 'diabetes_risk_level', 'diabetes_level'],
        scoreKeys: ['diabetes_score', 'diabetes_risk_score'],
      },
      {
        label: 'Urolithiasis',
        levelKeys: ['urolithiasis_risk', 'urolithiasis_risk_level', 'urolithiasis_level'],
        scoreKeys: ['urolithiasis_score', 'urolithiasis_risk_score'],
      },
      {
        label: 'Gum Disease',
        levelKeys: ['gum_disease_risk', 'gum_disease_risk_level', 'gum_risk_level'],
        scoreKeys: ['gum_disease_score', 'gum_disease_risk_score', 'gum_risk_score'],
      },
      {
        label: 'Feline Panleukopenia',
        levelKeys: ['panleukopenia_risk', 'feline_panleukopenia_risk_level', 'panleukopenia_risk_level'],
        scoreKeys: ['panleukopenia_score', 'feline_panleukopenia_risk_score', 'panleukopenia_risk_score'],
      },
    ];

    const next = INITIAL_RISK_DATA.map((base) => {
      const spec = colSpec.find((s) => s.label === base.label);
      if (!spec) return base;

      const level = getFirst(row, spec.levelKeys);
      const score = getFirst(row, spec.scoreKeys);

      if (level === undefined && score === undefined) return base;
      return {
        label: base.label,
        value: level ?? base.value,
        score: score ?? base.score,
      };
    });

    const hasAny = next.some((item) => item.value !== 'No Data' || (Number(item.score) || 0) > 0);
    return hasAny ? next : INITIAL_RISK_DATA;
  };

  const mapAssessmentRowToResultState = (row) => {
    const overallScoreFromDb =
      row?.overall_risk_score ??
      row?.overallRiskScore ??
      row?.overallScore ??
      row?.overall_risk ??
      row?.overallRisk ??
      'No Data';

    const summaryTitleFromDb =
      row?.recommendation ??
      row?.summary_title ??
      row?.summaryTitle ??
      row?.summary ??
      row?.title ??
      '';

    const summaryDescFromDb =
      row?.explanation ??
      row?.summary_desc ??
      row?.summaryDesc ??
      row?.summary_description ??
      row?.summaryDescription ??
      row?.description ??
      '';

    return {
      overallScore: overallScoreFromDb,
      summaryTitle: summaryTitleFromDb,
      summaryDesc: summaryDescFromDb,
      riskData: buildRiskDataFromAssessmentRow(row),
    };
  };

  const handleSaveAssessment = async () => {
    try {
      if (catId) {
        const riskLevel = getOverallRiskDetails(overallScore).text;

        const getRiskVal = (label) => riskData.find(d => d.label === label)?.value || 'No Data';
        const getRiskScore = (label) => Number(riskData.find(d => d.label === label)?.score) || 0;

        const { error } = await supabase.from('assessments').insert({
          cat_id: catId,
          assessment_date: new Date().toISOString(),
          overall_risk_score: overallScore === 'No Data' ? null : Number(overallScore),
          overall_risk_level: riskLevel,
          recommendation: summaryTitle,
          explanation: summaryDesc,
          kidney_disease_risk: getRiskVal('Kidney Disease'),
          kidney_disease_score: getRiskScore('Kidney Disease'),
          diabetes_risk: getRiskVal('Diabetes'),
          diabetes_score: getRiskScore('Diabetes'),
          urolithiasis_risk: getRiskVal('Urolithiasis'),
          urolithiasis_score: getRiskScore('Urolithiasis'),
          gum_disease_risk: getRiskVal('Gum Disease'),
          gum_disease_score: getRiskScore('Gum Disease'),
          panleukopenia_risk: getRiskVal('Feline Panleukopenia'),
          panleukopenia_score: getRiskScore('Feline Panleukopenia')
        });
        if (error) {
          console.error("Error saving assessment to DB:", error);
        } else {
          Alert.alert("Success", "Assessment saved successfully!");
        }
      }

      await AlertEngine.logEvent({
        type: 'assessment_saved',
        severity: 'success',
        title: 'Assessment Saved',
        desc: `Overall risk score: ${overallScore === 'No Data' ? '--' : overallScore}`,
        details: summaryTitle || '',
        dedupeKey: `assessment_saved:${catId || 'no_cat'}:${overallScore}`,
        cooldownMs: 2 * 60 * 1000,
      });
    } catch (e) {
      console.error("Save error:", e);
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
        setShowNoDataModal(false);

        if (loadFromDb) {
          const assessmentId = route?.params?.assessmentId;

          let query = supabase
            .from('assessments')
            .select('*')
            .eq('cat_id', catId);

          if (assessmentId) {
            query = query.eq('id', assessmentId);
          } else {
            query = query.order('created_at', { ascending: false }).limit(1);
          }

          const { data: assessmentRow, error } = await query.maybeSingle();

          if (error || !assessmentRow) {
            setRiskData(INITIAL_RISK_DATA);
            setOverallScore("No Data");
            setSummaryTitle("");
            setSummaryDesc("");
            setShowNoDataModal(true);
            return;
          }

          const mapped = mapAssessmentRowToResultState(assessmentRow);
          setRiskData(mapped.riskData);
          setOverallScore(mapped.overallScore);
          setSummaryTitle(mapped.summaryTitle);
          setSummaryDesc(mapped.summaryDesc);
          return;
        }

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
      // setLoadingData(false); // FOR MOCK DATA REVIEW
    };

    loadInitialData();
  }, [catId, loadFromDb]);

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
            <Text style={customStyles.modalTitle}>
              {loadFromDb ? 'ไม่พบผลตรวจในฐานข้อมูล' : 'ขาดข้อมูลของวันนี้'}
            </Text>
            <Text style={customStyles.modalText}>
              {loadFromDb
                ? 'ยังไม่มีผลตรวจที่บันทึกไว้สำหรับแมวตัวนี้ คุณสามารถบันทึก Daily Log แล้วทำ Assessment เพื่อสร้างผลตรวจได้'
                : 'ระบบประเมินความเสี่ยงจำเป็นต้องใช้ข้อมูลสุขภาพอัปเดตล่าสุดของ "วันนี้" ไปบันทึก Daily Log ตอนนี้เลยไหม?'}
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
        <View style={customStyles.scoreSection}>
          <MaterialCommunityIcons name="paw" size={38} color="rgba(0,105,92,0.15)" style={{ position: 'absolute', top: 5, right: 30, transform: [{ rotate: '25deg' }] }} />
          <MaterialCommunityIcons name="paw" size={30} color="rgba(0,105,92,0.12)" style={{ position: 'absolute', top: 40, left: 20, transform: [{ rotate: '-20deg' }] }} />
          <MaterialCommunityIcons name="paw" size={34} color="rgba(0,105,92,0.1)" style={{ position: 'absolute', bottom: 25, right: 45, transform: [{ rotate: '40deg' }] }} />
          <MaterialCommunityIcons name="paw" size={26} color="rgba(0,105,92,0.08)" style={{ position: 'absolute', bottom: 15, left: 40, transform: [{ rotate: '-30deg' }] }} />

          <Text style={customStyles.scoreSectionLabel}>HEALTH RISK</Text>

          <CatRiskMeter
            size={260}
            score={clampedScore}
            color={riskDetails.color}
            mainText={riskDetails.label}
            subText={riskDetails.text}
          />

          <Text style={[customStyles.scoreSubtitle, { color: riskDetails.color }]}>{riskDetails.text}</Text>
          <Text style={styles.subText}>Overall Health Risk</Text>
        </View>

        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>{summaryTitle}</Text>
          <Text style={styles.summaryDesc}>{summaryDesc}</Text>
        </View>

        <Text style={styles.sectionTitle}>Risk Breakdown</Text>
        <View style={customStyles.riskCard}>
          {riskData.map((item, index) => {
            const barColor = getRiskColor(item.value);
            return (
              <View key={index} style={customStyles.insightRow}>
                <View style={customStyles.insightHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <MaterialCommunityIcons name="alert-circle" size={16} color={item.score > 0 ? barColor : "#bdc3c7"} style={{ marginRight: 6 }} />
                    <Text style={customStyles.insightLabel} numberOfLines={1}>{item.label}</Text>
                  </View>
                  <Text style={[customStyles.insightValue, { color: item.score > 0 ? barColor : "#8A9A98" }]}>{item.score > 0 ? item.value : "NULL"}</Text>
                </View>
                <View style={customStyles.progressBarBg}>
                  <View style={customStyles.progressBarGray} />
                  <View style={[customStyles.progressBarFill, { width: `${item.score}%` }]}>
                    {item.score > 0 && <View style={[customStyles.progressBarColor, { backgroundColor: barColor }]} />}
                    {item.score > 0 && <MaterialCommunityIcons name="paw" size={24} color={tintHex(barColor, -35)} style={customStyles.progressPaw} />}
                  </View>
                </View>
              </View>
            );
          })}
        </View>

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
    </LinearGradient >
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
  dropdownItemActive: {
    backgroundColor: '#0F766E20', /* Subtle highlight */
  },

  // Dashboard UI match styles
  scoreSection: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 18,
    position: 'relative',
    paddingVertical: 6,
  },
  scoreSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8A9A98',
    letterSpacing: 1.2,
    marginBottom: 10,
    fontFamily: Platform.OS === 'ios' ? 'Inter-Bold' : 'sans-serif-medium',
  },
  scoreSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  riskCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E6EFEB',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 1,
  },
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
