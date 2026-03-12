/**
 * Cat Health Scoring Logic — Veterinarian Edition
 * เกณฑ์คำนวณคะแนนสุขภาพแมว โดยสัตวแพทย์
 *
 * This file supports two layers:
 * - `evaluateHealthLog()` -> Risk-first evaluation (0 = best, higher = worse) + clusters + disease patterns
 * - `analyzeHealthLog()`  -> Backward-compatible health score (0–100, higher = better) for existing UI
 */

// ==========================================
// 🚩 Red Flag Symptoms — อาการฉุกเฉิน
// ==========================================
const RED_FLAG_SYMPTOMS = {
  vomit: ['blood'],                          // อาเจียนมีเลือด
  diarrhea: ['fresh_blood', 'black'],        // อุจจาระเลือดสด / สีดำ
  respiratory: ['หายใจหอบ'],                  // หายใจหอบ (Emergency)
  behavior: ['ไม่กินอาหารเลย', 'ไม่กินน้ำเลย'], // ไม่กินอาหาร/น้ำเลย
};

// ==========================================
// 🩺 Health Status Thresholds (legacy, health-score based)
// ==========================================
export const getHealthStatus = (score) => {
  const safe = Number(score) || 0;
  if (safe >= 80) return { label: "Excellent", color: "#6FCF97", text: "Excellent health condition" };
  if (safe >= 60) return { label: "Good", color: "#2D9CDB", text: "Generally good health" };
  if (safe >= 20) return { label: "Attention", color: "#F2C94C", text: "Requires close monitoring" };
  return { label: "Critical", color: "#EB5757", text: "Emergency risk detected - see a veterinarian immediately" };
};

// ==========================================
// 🧯 Risk Status Thresholds (new, risk-score based)
// 0–15 Normal, 16–30 Monitor, 31–50 Warning, 51+ Critical
// ==========================================
export const getRiskStatus = (riskScore, forceCritical = false, labelOverride = null) => {
  const override = typeof labelOverride === 'string' ? labelOverride.trim() : null;
  const overrideLabel = override ? override.toLowerCase() : null;

  // รองรับการ override label (ใช้กับ First Log Safety Logic)
  if (overrideLabel === 'normal') {
    return { label: "Normal", color: "#2E7D32", text: "Normal risk level." };
  }
  if (overrideLabel === 'monitor') {
    return { label: "Monitor", color: "#F59E0B", text: "Monitor closely over the next 24 hours." };
  }
  if (overrideLabel === 'warning') {
    return { label: "Warning", color: "#EF6C00", text: "Concerning signs detected — consider veterinary advice." };
  }
  if (overrideLabel === 'critical') {
    return {
      label: "Critical",
      color: "#EB5757",
      text: "Emergency risk detected — seek veterinary care immediately.",
    };
  }

  if (forceCritical) {
    return {
      label: "Critical",
      color: "#EB5757",
      text: "Emergency risk detected — seek veterinary care immediately.",
    };
  }
  const safe = Math.max(0, Number(riskScore) || 0);
  if (safe <= 15) return { label: "Normal", color: "#2E7D32", text: "Normal risk level." };
  if (safe <= 30) return { label: "Monitor", color: "#F59E0B", text: "Monitor closely over the next 24 hours." };
  if (safe <= 50) return { label: "Warning", color: "#EF6C00", text: "Concerning signs detected — consider veterinary advice." };
  return { label: "Critical", color: "#EB5757", text: "High risk detected — seek veterinary care urgently." };
};

// ==========================================
// Helper: ดึงข้อมูล child table อย่างปลอดภัย
// ==========================================
const extractChild = (child) => {
  if (!child) return {};
  if (Array.isArray(child)) return child[0] || {};
  return child;
};

const normalizeArray = (val) => (Array.isArray(val) ? val : (val ? [val] : []));

const toSafeNumber = (val, fallback = 0) => {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const includesAny = (haystack, needles) => {
  const text = String(haystack ?? '').toLowerCase();
  return needles.some((n) => text.includes(String(n).toLowerCase()));
};

const countFromNotes = (notes, keywords = []) => {
  const text = String(notes ?? '');
  if (!text) return null;

  // Try English patterns: "vomit 3", "vomited 2 times", "3x vomit"
  if (keywords.length && !includesAny(text, keywords)) return null;

  const patterns = [
    /vomit(?:ed|ing)?\s*(\d+)\s*(?:times|x)?/i,
    /(\d+)\s*(?:times|x)\s*(?:vomit|vomited|vomiting)/i,
    /อาเจียน\s*(\d+)\s*ครั้ง/,
    /(\d+)\s*ครั้ง\s*อาเจียน/,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return Math.min(20, Math.floor(n));
    }
  }
  return null;
};

const getUrinaryPainSignals = (behaviorTags, notes) => {
  const tags = normalizeArray(behaviorTags).map((t) => String(t || ''));
  const tagJoined = tags.join(' ');
  const text = `${tagJoined} ${String(notes ?? '')}`;

  const painKeywords = [
    // English
    'crying when urinating', 'cry when urinating', 'crying', 'straining', 'strain', 'frequent litter',
    'frequent litterbox', 'frequent litter box', 'urinating frequently', 'urinate frequently',
    'blocked', 'blockage', 'no urine',
    // Thai (common owner descriptions)
    'ร้องตอนฉี่', 'ร้องตอนปัสสาวะ', 'ร้องเวลาเข้ากระบะทราย', 'เข้ากระบะทรายบ่อย',
    'เบ่ง', 'เบ่งฉี่', 'ฉี่บ่อย', 'ปัสสาวะบ่อย', 'ปัสสาวะขัด', 'ฉี่ขัด', 'ฉี่ไม่ออก', 'ปัสสาวะไม่ออก', 'ปวดฉี่',
  ];

  const crying = includesAny(text, ['ร้องตอน', 'cry', 'crying']);
  const frequent = includesAny(text, ['เข้ากระบะทรายบ่อย', 'frequent litter', 'frequent litterbox', 'urinating frequently', 'ฉี่บ่อย', 'ปัสสาวะบ่อย']);
  const straining = includesAny(text, ['เบ่ง', 'straining', 'strain', 'ฉี่ขัด', 'ปัสสาวะขัด']);
  const anySignal = includesAny(text, painKeywords);

  return {
    any: anySignal,
    crying,
    frequent,
    straining,
    hasCoreSignals: crying || frequent || straining,
    hasNoUrineHint: includesAny(text, ['no urine', 'ฉี่ไม่ออก', 'ปัสสาวะไม่ออก']),
  };
};

// ==========================================
// 🧠 Risk-First Evaluation (required output structure)
// ==========================================
export const evaluateHealthLog = (log, catWeight = 4, history = null) => {
  const safeWeight = toSafeNumber(catWeight, 4);
  const weightKg = Number.isFinite(safeWeight) && safeWeight > 0 ? safeWeight : 4;

  const isFirstLog = Array.isArray(history) && history.length === 0;

  if (!log) {
    return {
      score: 0,
      status: "Monitor",
      alerts: [],
      clusters: [],
      diseases: [],
      recommendations: [],
      isFirstLog,
      meta: { isEmergency: false, healthScore: 100, riskScore: 0 },
    };
  }

  const normal = extractChild(log.normal_logs);
  const off = extractChild(log.something_off_logs);
  const mealLogs = log.meal_logs ? (Array.isArray(log.meal_logs) ? log.meal_logs : [log.meal_logs]) : [];

  let calculatedFoodGrams = 0;
  let wetFoodGrams = 0;
  mealLogs.forEach((meal) => {
    const grams = toSafeNumber(meal?.amount_grams, 0);
    calculatedFoodGrams += grams;
    if (meal?.food_type === 'wet_food') wetFoodGrams += grams;
  });
  if (calculatedFoodGrams === 0) calculatedFoodGrams = toSafeNumber(normal?.total_food_grams ?? log?.total_food_grams, 0);

  const n = {
    meals_per_day: normal.meals_per_day ?? log.meals_per_day ?? 0,
    total_food_grams: calculatedFoodGrams,
    water_ml_per_day: normal.water_ml_per_day ?? log.water_ml_per_day ?? 0,
    urine_level: normal.urine_level ?? log.urine_level ?? null,
    stool_level: normal.stool_level ?? log.stool_level ?? null,
  };

  const s = {
    has_vomit: off.has_vomit ?? log.has_vomit ?? false,
    vomit_type: off.vomit_type || log.vomit_type || null,
    has_diarrhea: off.has_diarrhea ?? log.has_diarrhea ?? false,
    diarrhea_type: off.diarrhea_type || log.diarrhea_type || null,
    behavior_energy: off.behavior_energy ?? log.behavior_energy ?? [],
    respiratory_physical: off.respiratory_physical ?? log.respiratory_physical ?? [],
    notes: off.notes || log.notes || null,
  };

  // Merge tags from both raw root + child tables (prevents empty child arrays from masking actual tags)
  const behaviorTags = [...new Set([...normalizeArray(off.behavior_energy), ...normalizeArray(log.behavior_energy)])];
  const respiratoryTags = [...new Set([...normalizeArray(off.respiratory_physical), ...normalizeArray(log.respiratory_physical)])];

  const hasPanting = respiratoryTags.some((t) => includesAny(t, RED_FLAG_SYMPTOMS.respiratory))
    || includesAny(s.notes, RED_FLAG_SYMPTOMS.respiratory);

  const foodGrams = toSafeNumber(n.total_food_grams, 0);
  const waterMlRaw = (normal?.water_ml_per_day ?? log?.water_ml_per_day);
  const hasWaterEntry = waterMlRaw !== undefined && waterMlRaw !== null;
  const waterMl = toSafeNumber(n.water_ml_per_day, 0);
  const mealsFromField = toSafeNumber(n.meals_per_day, 0);
  const mealsFromLogs = mealLogs.length;
  const hasNoFoodTag = behaviorTags.includes('ไม่กินอาหารเลย');
  const hasNoWaterTag = behaviorTags.includes('ไม่กินน้ำเลย');
  const appetiteLossTag = behaviorTags.includes('เบื่ออาหาร');
  const hasLethargyTag = behaviorTags.includes('ซึม');

  const mealsCount = hasNoFoodTag ? 0 : Math.max(0, Math.floor(Math.max(mealsFromField, mealsFromLogs)));

  let risk = 0;
  const alerts = [];
  const clusters = [];
  const diseases = [];
  const recommendations = [];

  let redFlags = 0;
  let forceCritical = false;
  const emergencyAlerts = [];

  const addRisk = (message, points, { emergency = false } = {}) => {
    const safePoints = Math.max(0, toSafeNumber(points, 0));
    risk += safePoints;
    if (message) alerts.push(String(message));
    if (emergency) {
      emergencyAlerts.push(String(message));
      redFlags += 1;
    }
  };

  // ==========================================
  // 0) RED FLAG: RESPIRATORY DISTRESS (CRITICAL)
  // ==========================================
  if (hasPanting) {
    clusters.push("Respiratory Distress");
    addRisk("Emergency: Panting/labored breathing detected. Seek veterinary care immediately.", 60, { emergency: true });
    forceCritical = true;
  }

  // ==========================================
  // 1) FOOD THRESHOLD LOGIC (meals/day)
  // 0 meals -> +20 risk, 1 meal -> +10 risk, 2+ meals -> normal
  // ==========================================
  if (mealsCount === 0) {
    addRisk("No meals recorded today (risk of anorexia).", 20);
  } else if (mealsCount === 1) {
    addRisk("Only 1 meal recorded today (reduced appetite).", 10);
  }

  // Additional rule: food = 0 AND vomiting = true -> +10 risk
  const hasVomiting = Boolean(s.has_vomit);
  if ((foodGrams === 0 || mealsCount === 0) && hasVomiting) {
    addRisk("No food intake with vomiting — possible gastrointestinal illness.", 10);
  }

  // ==========================================
  // 2) DEHYDRATION DETECTION (60 ml/kg/day baseline)
  // ==========================================
  const recommendedWaterMl = Math.max(0, weightKg * 60);
  const waterRatio = recommendedWaterMl > 0 ? (waterMl / recommendedWaterMl) : null;

  // ==========================================
  // 2.1) First Log Safety Logic (Medical-grade triage)
  // - ถ้าเป็น log แรก: ห้ามสรุปเป็น "Normal" ง่าย ๆ
  // ==========================================
  if (isFirstLog) {
    addRisk("First health log recorded. More data will improve health assessment accuracy.", 0);

    // Extreme value detection on first log
    if (recommendedWaterMl > 0 && waterMl > recommendedWaterMl * 2) {
      addRisk("Unusually high water intake reported.", 10);
    }
    if (n.urine_level === 'very_low') {
      addRisk("Low urination reported.", 15);
    }
    if (wetFoodGrams > 400) {
      addRisk("Wet food intake unusually high.", 5);
    }
  }

  let dehydrationSeverity = null; // 'mild' | 'moderate' | 'severe' | null
  let effectiveWaterRatio = null;
  if (recommendedWaterMl > 0 && (hasNoWaterTag || hasWaterEntry)) {
    const effectiveRatio = hasNoWaterTag ? 0 : (Number.isFinite(waterRatio) ? waterRatio : 0);
    effectiveWaterRatio = effectiveRatio;

    if (effectiveRatio < 0.3) {
      dehydrationSeverity = 'severe';
      // Low water alone should not instantly force "Critical" in a single day.
      // Keep strictness only when low water is accompanied by vomiting on the same day.
      if (hasVomiting) {
        addRisk("Severe dehydration risk detected with vomiting.", 25, { emergency: true });
        forceCritical = true;
      } else {
        addRisk("Severe dehydration risk detected.", 25);
      }
    } else if (effectiveRatio < 0.6) {
      dehydrationSeverity = 'moderate';
      addRisk("Moderate dehydration risk detected.", 15);
    } else if (effectiveRatio < 0.8) {
      dehydrationSeverity = 'mild';
      addRisk("Mild dehydration risk detected.", 5);
    }
  }

  // low water + vomiting -> +10 risk
  if (dehydrationSeverity && hasVomiting) {
    addRisk("Low water intake with vomiting increases dehydration risk.", 10);
  }

  // ==========================================
  // 3) URINARY EMERGENCY DETECTION (CRITICAL)
  // ==========================================
  const urineLevel = n.urine_level;
  const urinarySignals = getUrinaryPainSignals(behaviorTags, s.notes);
  const isVeryLowUrine = urineLevel === 'very_low' || urineLevel === 'none' || (urineLevel == null && urinarySignals.hasNoUrineHint);
  const urinaryEmergency = Boolean(isVeryLowUrine && urinarySignals.hasCoreSignals);

  if (urinaryEmergency) {
    addRisk(
      "Emergency: Possible urinary blockage detected. Seek veterinary care immediately.",
      50,
      { emergency: true }
    );
    forceCritical = true;
  }

  // ==========================================
  // 4) VOMITING SEVERITY
  // ==========================================
  const vomitType = s.vomit_type;
  const vomitEpisodes = hasVomiting ? (countFromNotes(s.notes, ['vomit', 'vomited', 'vomiting', 'อาเจียน']) || 1) : 0;

  if (hasVomiting) {
    if (vomitEpisodes <= 1) addRisk("Vomiting detected (once).", 5);
    else if (vomitEpisodes <= 3) addRisk("Frequent vomiting detected (2–3 times).", 15);
    else addRisk("Repeated vomiting detected (4+ times).", 30);

    if (vomitType === 'blood') {
      addRisk("Emergency: Vomiting blood detected. Seek veterinary care immediately.", 40, { emergency: true });
      forceCritical = true; // Critical override: vomiting blood
    } else if (vomitType === 'yellow') {
      addRisk("Vomiting yellow bile detected.", 20);
    } else if (vomitType === 'white_foam') {
      if (vomitEpisodes >= 2) addRisk("Repeated white foam vomiting detected.", 15);
      else addRisk("White foam vomiting detected.", 5);
    }

    // Vomiting + low water -> +15 risk (implemented as +5 extra on top of the +10 dehydration link when it's more concerning)
    if (dehydrationSeverity) {
      const needsExtra = dehydrationSeverity === 'severe' || dehydrationSeverity === 'moderate' || vomitEpisodes >= 2;
      if (needsExtra) addRisk("Vomiting with low water intake significantly increases dehydration risk.", 5);
    }
  }

  // ==========================================
  // Diarrhea baseline (supports clusters & safety)
  // ==========================================
  const hasDiarrhea = Boolean(s.has_diarrhea);
  const diarrheaType = s.diarrhea_type;
  if (hasDiarrhea) {
    if (diarrheaType === 'fresh_blood' || diarrheaType === 'black') {
      addRisk("Emergency: Blood in stool detected. Seek veterinary care immediately.", 40, { emergency: true });
      forceCritical = true;
    } else {
      addRisk("Diarrhea detected.", 10);
    }
  }

  // ==========================================
  // 5) SYMPTOM CLUSTER DETECTION
  // ==========================================
  const lowAppetite = mealsCount <= 1 || appetiteLossTag || hasNoFoodTag || foodGrams === 0;
  const lowWater = Boolean(dehydrationSeverity);

  if (hasVomiting && hasDiarrhea && lowAppetite) {
    clusters.push("Gastrointestinal Distress");
    addRisk("Gastrointestinal distress cluster detected.", 15);
  }

  if (lowWater && (hasVomiting || hasDiarrhea)) {
    clusters.push("Dehydration Risk");
    addRisk("Dehydration risk cluster detected.", 20);
  }

  if (isVeryLowUrine && urinarySignals.hasCoreSignals) {
    clusters.push("Urinary Obstruction Risk");
    addRisk("Urinary obstruction risk cluster detected.", 30, { emergency: urinaryEmergency });
  }

  // ==========================================
  // 6) DISEASE PATTERN DETECTION
  // ==========================================
  if (isVeryLowUrine && urinarySignals.hasCoreSignals) {
    diseases.push({ disease: "Feline Lower Urinary Tract Disease", risk: "high" });
  }
  if (hasVomiting && hasDiarrhea && lowAppetite) {
    diseases.push({ disease: "Gastroenteritis", risk: "medium" });
  }
  if (dehydrationSeverity === 'severe' && (hasVomiting || hasDiarrhea)) {
    diseases.push({ disease: "Severe Dehydration", risk: "high" });
  }

  // ==========================================
  // Recommendations (English)
  // ==========================================
  if (urinaryEmergency) {
    recommendations.push("Seek emergency veterinary care immediately (possible urinary obstruction).");
  }
  if (hasPanting) {
    recommendations.push("Seek emergency veterinary care immediately (panting/labored breathing).");
  }
  if (dehydrationSeverity === 'severe') {
    recommendations.push("Seek veterinary care urgently for dehydration; offer fresh water and consider wet food.");
  } else if (dehydrationSeverity) {
    recommendations.push("Encourage hydration: provide fresh water, multiple bowls, and consider wet food.");
  }
  if (hasVomiting && vomitType === 'blood') {
    recommendations.push("Do not delay care: vomiting blood can be life-threatening.");
  } else if (hasVomiting) {
    recommendations.push("Withhold food briefly if advised by a veterinarian, then reintroduce small frequent meals; monitor closely.");
  }
  if (hasDiarrhea) {
    recommendations.push("Monitor stool and hydration; consult a veterinarian if diarrhea persists or worsens.");
  }

  // ==========================================
  // Final scoring
  // ==========================================
  risk = clamp(Math.round(risk), 0, 100);
  if (forceCritical) risk = Math.max(risk, 51);

  // First log override: 0-10 Monitor, 11-30 Warning, >30 Critical
  let statusLabelOverride = null;
  if (!forceCritical && isFirstLog) {
    statusLabelOverride = risk <= 10 ? 'Monitor' : (risk <= 30 ? 'Warning' : 'Critical');
  }

  const statusInfo = getRiskStatus(risk, forceCritical, statusLabelOverride);
  const status = statusInfo.label;
  const healthScore = clamp(100 - risk, 0, 100);

  return {
    score: risk,
    status,
    alerts,
    clusters,
    diseases,
    recommendations,
    isFirstLog,
    meta: {
      riskScore: risk,
      healthScore,
      recommendedWaterMl: Math.round(recommendedWaterMl),
      waterMl: Math.round(waterMl),
      waterRecorded: Boolean(hasNoWaterTag || hasWaterEntry),
      waterRatio: Number.isFinite(waterRatio) ? waterRatio : null,
      effectiveWaterRatio: Number.isFinite(effectiveWaterRatio) ? effectiveWaterRatio : null,
      mealsCount,
      foodGrams: Math.round(foodGrams),
      wetFoodGrams: Math.round(wetFoodGrams),
      vomitEpisodes,
      dehydrationSeverity,
      urinaryEmergency,
      emergencyAlerts,
      isEmergency: forceCritical,
      redFlags,
      hasPanting,
      hasLethargy: hasLethargyTag,
      hasInappetence: lowAppetite,
      firstLogStatusOverride: statusLabelOverride,
    },
  };
};

// ==========================================
// 🏥 Main Analysis Function
// ==========================================
export const analyzeHealthLog = (log, catWeight = 4, history = null) => {
  const evaluation = evaluateHealthLog(log, catWeight, history);
  const healthScore = clamp(toSafeNumber(evaluation?.meta?.healthScore, 100), 0, 100);
  const status = getHealthStatus(healthScore);

  const hasLethargy = Boolean(evaluation?.meta?.hasLethargy);
  const hasInappetence = Boolean(evaluation?.meta?.hasInappetence);
  const isEmergency = Boolean(evaluation?.meta?.isEmergency);

  return {
    score: healthScore,
    redFlags: toSafeNumber(evaluation?.meta?.redFlags, 0),
    alerts: Array.isArray(evaluation?.alerts) ? evaluation.alerts : [],
    status,
    clusters: Array.isArray(evaluation?.clusters) ? evaluation.clusters : [],
    diseases: Array.isArray(evaluation?.diseases) ? evaluation.diseases : [],
    recommendations: Array.isArray(evaluation?.recommendations) ? evaluation.recommendations : [],
    riskScore: toSafeNumber(evaluation?.score, 0),
    riskStatus: String(evaluation?.status || ''),
    isFirstLog: Boolean(evaluation?.isFirstLog),
    meta: {
      ...(evaluation?.meta || {}),
      hasLethargy,
      hasInappetence,
      isEmergency,
    },
  };
};

// ==========================================
// 📈 Two-Tier Analysis (Tier 2): 7-Day Trend Detection
// - ใช้สำหรับสร้าง "Alert พิเศษ" เพื่อดักจับอาการป่วยสะสม/แนวโน้มเสื่อมลง
// - ควรส่ง logs มาแบบ "ล่าสุด -> เก่าสุด" (เหมือนที่ query จาก DB)
// ==========================================
export const analyzeHealthTrend7d = (logs = [], catWeight = 4) => {
  const items = Array.isArray(logs) ? logs.slice(0, 7) : [];
  if (!items.length) return { alerts: [], signals: {} };

  const analysesDesc = items.map((x) => analyzeHealthLog(x, catWeight));
  const analyses = analysesDesc.slice().reverse(); // เก่า -> ใหม่

  const scores = analyses.map((a) => (Number.isFinite(a?.score) ? a.score : 0));
  const waters = analyses.map((a) => (Number.isFinite(a?.meta?.waterMl) ? a.meta.waterMl : null));
  const waterRecordedDays = analyses.map((a) => Boolean(a?.meta?.waterRecorded));
  const effectiveWaterRatios = analyses.map((a) => (Number.isFinite(a?.meta?.effectiveWaterRatio) ? a.meta.effectiveWaterRatio : null));
  const symptomDays = analyses.map((a) => Boolean(a?.meta?.hasLethargy || a?.meta?.hasInappetence));

  const specialAlerts = [];

  // 📉 Downward Trend: คะแนนลดลงต่อเนื่อง 3 วันขึ้นไป (ภายใน 7 วัน)
  let downStreak = 1;
  let maxDownStreak = 1;
  for (let i = 1; i < scores.length; i += 1) {
    if (scores[i] < scores[i - 1]) {
      downStreak += 1;
    } else {
      downStreak = 1;
    }
    if (downStreak > maxDownStreak) maxDownStreak = downStreak;
  }
  if (maxDownStreak >= 3) {
    specialAlerts.push("Health score shows a consistent decline over the past 7 days.");
  }

  // ⏳ Persistent Symptoms: ซึม/กินน้อย "ติดต่อกันเกิน 4 วัน" (>= 5 วัน) ในรอบ 7 วัน
  let symptomStreak = 0;
  let maxSymptomStreak = 0;
  for (const dayHasSymptom of symptomDays) {
    if (dayHasSymptom) symptomStreak += 1;
    else symptomStreak = 0;
    if (symptomStreak > maxSymptomStreak) maxSymptomStreak = symptomStreak;
  }
  if (maxSymptomStreak >= 5) {
    specialAlerts.push("Persistent lethargy or low appetite detected for 5+ consecutive days (consider chronic illness evaluation).");
  }

  // 💧 Behavior Drift: น้ำที่ดื่มเพิ่มขึ้นเรื่อย ๆ ภายใน 7 วัน (แบบค่อย ๆ เพิ่ม)
  // - ต้องมีข้อมูลอย่างน้อย 5 วัน และไม่มีวันไหน over-limit (> 500) เพราะเคสนั้นถือว่า Critical override ไปแล้ว
  // 💧 Persistent Low Water Intake: low water for 3+ consecutive days
  // Threshold uses "moderate-or-worse" dehydration ratio (< 0.6) and requires that water was actually recorded (or tagged).
  let lowWaterStreak = 0;
  let maxLowWaterStreak = 0;
  for (let i = 0; i < effectiveWaterRatios.length; i += 1) {
    const ratio = effectiveWaterRatios[i];
    const recorded = waterRecordedDays[i];
    const isLow = recorded && Number.isFinite(ratio) && ratio < 0.6;
    if (isLow) lowWaterStreak += 1;
    else lowWaterStreak = 0;
    if (lowWaterStreak > maxLowWaterStreak) maxLowWaterStreak = lowWaterStreak;
  }
  if (maxLowWaterStreak >= 3) {
    specialAlerts.push("Persistent low water intake (3+ days) detected. High risk of dehydration or kidney issues.");
  }

  const hasOverLimitWater = waters.some((w) => Number.isFinite(w) && w > 500);
  const validWaters = waters.filter((w) => Number.isFinite(w) && w > 0);
  if (!hasOverLimitWater && validWaters.length >= 5) {
    let incStreak = 1;
    let maxIncStreak = 1;
    let incCount = 0;
    for (let i = 1; i < waters.length; i += 1) {
      const prev = waters[i - 1];
      const curr = waters[i];
      if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev <= 0 || curr <= 0) {
        incStreak = 1;
        continue;
      }
      if (curr >= prev) {
        incStreak += 1;
        if (curr > prev) incCount += 1;
      } else {
        incStreak = 1;
      }
      if (incStreak > maxIncStreak) maxIncStreak = incStreak;
    }

    const first = validWaters[0];
    const last = validWaters[validWaters.length - 1];
    const netIncrease = (Number.isFinite(first) && Number.isFinite(last)) ? (last - first) : 0;

    if (maxIncStreak >= 5 && incCount >= 3 && netIncrease >= 50) {
      specialAlerts.push("Water intake has been steadily increasing over the past 7 days (possible chronic kidney/endocrine concern).");
    }
  }

  return {
    alerts: specialAlerts,
    signals: {
      scores,
      waters,
      maxDownStreak,
      maxSymptomStreak,
      maxLowWaterStreak,
      effectiveWaterRatios,
    },
  };
};
