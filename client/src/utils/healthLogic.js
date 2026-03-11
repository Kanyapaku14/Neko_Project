/**
 * Cat Health Scoring Logic — Veterinarian Edition
 * เกณฑ์คำนวณคะแนนสุขภาพแมว โดยสัตวแพทย์
 * เริ่มต้นที่ 100 คะแนน แล้วหักตามความเสี่ยงแต่ละหมวด
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
// 🩺 Health Status Thresholds
// ==========================================
export const getHealthStatus = (score) => {
  const safe = Number(score) || 0;
  if (safe >= 80) return { label: "Excellent", color: "#6FCF97", text: "Excellent health condition" };
  if (safe >= 60) return { label: "Good", color: "#2D9CDB", text: "Generally good health" };
  if (safe >= 20) return { label: "Attention", color: "#F2C94C", text: "Requires close monitoring" };
  return { label: "Critical", color: "#EB5757", text: "Emergency risk detected - see a veterinarian immediately" };
};

// ==========================================
// Helper: ดึงข้อมูล child table อย่างปลอดภัย
// ==========================================
const extractChild = (child) => {
  if (!child) return {};
  if (Array.isArray(child)) return child[0] || {};
  return child;
};

// ==========================================
// 🏥 Main Analysis Function
// ==========================================
export const analyzeHealthLog = (log, catWeight = 4) => {
  if (!log) {
    return { score: 0, redFlags: 0, alerts: [], status: getHealthStatus(0), meta: { isEmergency: false } };
  }

  // ดึงข้อมูลจาก child tables (รองรับทั้ง array และ object)
  const normal = extractChild(log.normal_logs);
  const off = extractChild(log.something_off_logs);

  // --- 1. คำนวณอาหารแยกประเภทจาก meal_logs ---
  const mealLogs = log.meal_logs ? (Array.isArray(log.meal_logs) ? log.meal_logs : [log.meal_logs]) : [];
  
  let calculatedFoodGrams = 0;
  let dryFoodGrams = 0;
  
  mealLogs.forEach(meal => {
    const grams = Number(meal.amount_grams) || 0;
    calculatedFoodGrams += grams;
    if (meal.food_type === 'dry_food') {
      dryFoodGrams += grams;
    }
  });

  if (calculatedFoodGrams === 0) calculatedFoodGrams = normal.total_food_grams || log.total_food_grams || 0;

  // ถ้า log ถูก spread มาแล้ว (unified log) ให้ fallback กลับไปหา key ใน log ตรงๆ
  const n = {
    food_type:        normal.food_type        || log.food_type        || null,
    meals_per_day:    normal.meals_per_day     || log.meals_per_day    || 0,
    total_food_grams: calculatedFoodGrams,
    water_ml_per_day: normal.water_ml_per_day  || log.water_ml_per_day || 0,
    urine_level:      normal.urine_level       || log.urine_level      || null,
    stool_level:      normal.stool_level       || log.stool_level      || null,
  };

  const s = {
    has_vomit:             off.has_vomit             ?? log.has_vomit             ?? false,
    vomit_type:            off.vomit_type             || log.vomit_type             || null,
    has_diarrhea:          off.has_diarrhea           ?? log.has_diarrhea           ?? false,
    diarrhea_type:         off.diarrhea_type          || log.diarrhea_type          || null,
    behavior_energy:       off.behavior_energy        || log.behavior_energy        || [],
    respiratory_physical:  off.respiratory_physical   || log.respiratory_physical   || [],
    notes:                 off.notes                  || log.notes                  || null,
  };

  // Normalize arrays
  const behaviorTags   = Array.isArray(s.behavior_energy)      ? s.behavior_energy      : (s.behavior_energy      ? [s.behavior_energy] : []);
  const respiratoryTags = Array.isArray(s.respiratory_physical) ? s.respiratory_physical : (s.respiratory_physical ? [s.respiratory_physical] : []);
  const hasLethargyTag = behaviorTags.includes('ซึม');

  let score = 100;
  let alerts = [];
  let redFlags = 0;
  let hasInappetence = false;

  const addAlert = (msg, deduction, isRedFlag = false) => {
    score -= deduction;
    alerts.push(msg);
    if (isRedFlag) redFlags++;
  };

  // ==========================================
  // 1. หมวดอาหารและน้ำ (Nutrition & Hydration) - Updated logic
  // ==========================================
  const foodGrams = parseFloat(n.total_food_grams) || 0;
  const waterMl   = parseFloat(n.water_ml_per_day) || 0;
  const foodType  = n.food_type;

  // ==========================================
  // 🆘 NEW: Medical Emergency / Over-limit overrides (Healthcare UX safety)
  // - ป้องกันกรณีกรอกค่าผิดปกติมาก ๆ แล้วคะแนนยังดู "ดี" อยู่
  // ==========================================
  let forcedMaxScore = 100;
  let emergencyRedFlags = 0;
  const capScore = (maxScore) => {
    forcedMaxScore = Math.min(forcedMaxScore, maxScore);
  };
  const addCriticalOverride = (msg, deduction, maxScore) => {
    addAlert(msg, deduction, true);
    capScore(maxScore);
    if (maxScore <= 19) emergencyRedFlags += 1;
  };

  // 1) Over-limit: ดื่มน้ำมากผิดปกติขั้นวิกฤต (เสี่ยงโรคไต/เบาหวาน)
  if (waterMl > 500) {
    addCriticalOverride(
      "ดื่มน้ำมากผิดปกติขั้นวิกฤต - โปรดเฝ้าระวังโรคไต/เบาหวาน",
      50,
      30
    );
  }

  // 1) Over-limit: กินอาหารรวมมากผิดปกติ (Polyphagia / Overfeeding)
  if (foodGrams > 300) {
    addCriticalOverride(
      "พฤติกรรมการกินอาหารโอเวอร์โหลด (Overfeeding)",
      50,
      30
    );
  }

  // 1a. คำนวณเกณฑ์อาหารตามน้ำหนัก (RER simplified)
  // ปกติแมวควรทานอาหารเปียก/BARF ประมาณ 40-50g ต่อ นน. ตัว 1 กก.
  const foodThreshold = catWeight * 12; // เกณฑ์ขั้นต่ำ (Inappetence)
  const hasNoFoodTag = behaviorTags.includes('ไม่กินอาหารเลย');

  if (foodGrams === 0 && (hasNoFoodTag || !foodType && mealLogs.length === 0)) {
    // Anorexia: ไม่กินเลย
    hasInappetence = true;
    addAlert("ไม่กินอาหารเลย (Anorexia)", 40, true);
  } else if (foodGrams > 0 && foodGrams < foodThreshold) {
    // Inappetence: กินน้อยกว่าเกณฑ์ตามน้ำหนักตัว
    hasInappetence = true;
    addAlert(`กินอาหารน้อยผิดปกติ (${foodGrams}g เทียบกับเกณฑ์ ${foodThreshold}g)`, 20);
  }

  // 1b. สมดุลน้ำตามสัดส่วนอาหารเม็ด (Hydration Logic)
  const hasNoWaterTag      = behaviorTags.includes('ไม่กินน้ำเลย');
  const hasExcessWaterTag  = behaviorTags.includes('กินน้ำเยอะผิดปกติ');
  // ✅ NEW: Baseline recommendation (60 ml/day per 1 kg body weight)
  // - ใช้เป็น "กรอบความปลอดภัย" เพื่อช่วยจับค่าน้ำที่ต่ำ/สูงผิดปกติ แม้ผู้ใช้จะไม่ได้เลือก tag
  const recommendedWaterMl = Math.max(0, (Number(catWeight) || 4) * 60);
  
  const dryRatio = foodGrams > 0 ? (dryFoodGrams / foodGrams) : 0;

  if (waterMl === 0 || hasNoWaterTag) {
    // ไม่ดื่มน้ำเลย (ทุกประเภทอาหาร)
    addAlert("ไม่ดื่มน้ำเลย (เสี่ยงภาวะขาดน้ำ)", 25, true);
  } else {
    // ถ้ากินอาหารเม็ดมากกว่า 50% แต่ดื่มน้ำน้อยกว่า 30ml
    if (dryRatio > 0.5 && waterMl < 30) {
      addAlert("กินอาหารเม็ดเป็นหลักแต่ดื่มน้ำน้อย (เสี่ยงโรคไต/นิ่ว)", 20);
    } else if (dryRatio <= 0.5 && waterMl < 15) {
      addAlert("ดื่มน้ำน้อย (แม้จะกินอาหารเปียก/BARF)", 5);
    }
  }

  // ✅ NEW: Water intake vs. recommendation (mild trend/sanity signals)
  // - หลีกเลี่ยงการหักซ้ำกับเคสที่ต่ำมาก (เช่น < 30ml) ที่ถูกจับไปแล้วด้านบน
  if (!hasNoWaterTag && waterMl >= 30 && recommendedWaterMl > 0 && waterMl < (recommendedWaterMl * 0.6)) {
    addAlert(`ดื่มน้ำน้อยกว่าแนะนำ (แนะนำ ~${Math.round(recommendedWaterMl)} ml/วัน ตาม 60 ml/กก.)`, 10);
  }

  // - ถ้าน้ำสูงมากกว่าที่แนะนำ (แต่ยังไม่ถึง over-limit) ให้เตือน/หักคะแนนเล็กน้อย
  if (!hasExcessWaterTag && waterMl > (recommendedWaterMl * 2) && waterMl <= 500 && recommendedWaterMl > 0) {
    addAlert(`ดื่มน้ำมากกว่าแนะนำ (แนะนำ ~${Math.round(recommendedWaterMl)} ml/วัน ตาม 60 ml/กก.)`, 10);
  }

  if (hasExcessWaterTag && waterMl <= 500) {
    // ดื่มน้ำเยอะผิดปกติ (สัญญาณเบาหวาน/ไต)
    addAlert("ดื่มน้ำเยอะผิดปกติ (สัญญาณเบาหวาน/ไต)", 10);
  }

  // ==========================================
  // 2. หมวด Physical & Respiratory
  // ==========================================

  // 2a. ระบบหายใจ
  if (respiratoryTags.includes('หายใจหอบ')) {
    // 2) Critical Symptoms Override: Emergency
    // - บังคับคะแนนให้เหลือ < 20 ทันที เพื่อไม่ให้สถานะดู "ปกติ" ทั้งที่เสี่ยงถึงชีวิต
    addCriticalOverride(
      "ฉุกเฉิน! พบภาวะหายใจหอบ เสี่ยงอันตรายถึงชีวิต โปรดพบแพทย์ด่วนที่สุด",
      90,
      19
    );
  }

  const upperRespiratorySymptoms = ['จาม', 'มีน้ำมูก', 'มีขี้ตาเยอะ'];
  const hasUpperRespiratory = respiratoryTags.some(t => upperRespiratorySymptoms.includes(t));
  if (hasUpperRespiratory) {
    addAlert("อาการทางเดินหายใจ (จาม/น้ำมูก/ขี้ตา)", 10);
  }

  if (respiratoryTags.includes('พยายามขย้อน')) {
    addAlert("พยายามขย้อน", 5);
  }

  // 2b. อาเจียน (Vomit)
  if (s.has_vomit) {
    const vt = s.vomit_type;
    if (vt === 'blood') {
      // 🆘 NEW: Emergency override (severe red flag)
      addCriticalOverride(
        "ฉุกเฉิน! อาเจียนมีเลือด เสี่ยงเลือดออกในทางเดินอาหาร โปรดพบแพทย์ด่วน",
        90,
        19
      );
    } else if (vt === 'yellow' || vt === 'white_foam') {
      addAlert("อาเจียนสีเหลือง/โฟมขาว", 15);
    } else if (vt === 'undigested_food') {
      addAlert("อาเจียนอาหารไม่ย่อย", 10);
    } else if (vt === 'hairball') {
      addAlert("อาเจียนขน (Hairball)", 2);
    } else {
      // มีอาเจียนแต่ไม่ระบุประเภท
      addAlert("มีอาการอาเจียน", 10);
    }
  }

  // ==========================================
  // 3. หมวดระบบขับถ่าย (Excretion)
  // ==========================================

  // 3a. อุจจาระ (Stool)
  // 3) Conflict Resolution: ยึด "ค่าที่แย่ที่สุด (Worst-case)" เสมอ
  // - เช่น stool_level = 'normal' แต่ has_diarrhea = watery => ยึด watery diarrhea และมองข้าม stool_level
  const stoolCandidates = [];
  if (s.has_diarrhea) {
    const dt = s.diarrhea_type;
    if (dt === 'fresh_blood' || dt === 'black') {
      // 🆘 NEW: Emergency override (severe red flag)
      stoolCandidates.push({
        msg: "ฉุกเฉิน! อุจจาระมีเลือด/สีดำ เสี่ยงเลือดออกในทางเดินอาหาร โปรดพบแพทย์ด่วน",
        deduction: 25,
        red: true,
        cap: 19,
      });
    } else if (['watery', 'mushy', 'mucus'].includes(dt)) {
      stoolCandidates.push({ msg: "ท้องเสีย (" + dt + ")", deduction: 15, red: false });
    } else {
      stoolCandidates.push({ msg: "มีอาการท้องเสีย", deduction: 15, red: false });
    }
  }

  if (n.stool_level === 'very_low') {
    stoolCandidates.push({ msg: "ท้องผูก (ถ่ายน้อย/ไม่ถ่าย)", deduction: 10, red: false });
  } else if (n.stool_level === 'very_high') {
    stoolCandidates.push({ msg: "ถ่ายบ่อยผิดปกติ", deduction: 10, red: false });
  }

  if (stoolCandidates.length) {
    const worst = stoolCandidates.reduce((a, b) => (b.deduction > a.deduction ? b : a));
    if (worst.cap) {
      addCriticalOverride(worst.msg, 90, worst.cap);
    } else {
      addAlert(worst.msg, worst.deduction, worst.red);
    }
  }

  // 3b. ปัสสาวะ (Urine)
  if (n.urine_level === 'very_low') {
    addAlert("ปัสสาวะน้อยมาก (เสี่ยงนิ่วอุดตัน)", 20, true);
  } else if (n.urine_level === 'very_high') {
    addAlert("ปัสสาวะบ่อย/เยอะผิดปกติ", 5);
  }

  // ==========================================
  // 4. หมวดพฤติกรรมและพลังงาน (Behavior & Energy)
  // ==========================================

  // 4a. ระดับพลังงาน — ซึม, ซ่อนตัว, โก่งตัว
  const lethargySymptoms = ['ซึม', 'ซ่อนตัว', 'โก่งตัว'];
  if (behaviorTags.some(t => lethargySymptoms.includes(t))) {
    addAlert("ซึม/ซ่อนตัว/โก่งตัว (สัญญาณปวดท้อง)", 15);
  }

  // 4b. พฤติกรรม — ก้าวร้าว, ร้องผิดปกติ, กระวนกระวาย
  const agitationSymptoms = ['ก้าวร้าว', 'ร้องผิดปกติ', 'กระวนกระวาย'];
  if (behaviorTags.some(t => agitationSymptoms.includes(t))) {
    addAlert("พฤติกรรมผิดปกติ (ก้าวร้าว/ร้อง/กระวนกระวาย)", 10);
  }

  // 4c. การดูแลตัวเอง — ไม่เลียขน / เลียขนมากเกินไป
  const groomingSymptoms = ['ไม่เลียขน', 'เลียขนมากเกินไป'];
  if (behaviorTags.some(t => groomingSymptoms.includes(t))) {
    addAlert("ปัญหาการเลียขน (ไม่เลียขน/เลียมากเกินไป)", 10);
  }

  // 4d. กินจุผิดปกติ (Polyphagia — สัญญาณเบาหวาน/ไทรอยด์)
  if (behaviorTags.includes('กินจุผิดปกติ') && foodGrams <= 300) {
    addAlert("กินจุผิดปกติ (สัญญาณเบาหวาน/ไทรอยด์)", 5);
  }

  // ==========================================
  // 🔒 Clamp Score & Red Flag Override
  // ==========================================
  score = Math.max(0, Math.min(100, score));
  score = Math.min(score, forcedMaxScore);

  let status = getHealthStatus(score);
  
  // ถ้ามี Red Flag มากกว่า 1 อย่าง ให้ล็อคเป็น Attention ทันที
  if (redFlags >= 1 && score >= 60) {
    status = { label: "Attention", color: "#F2C94C", text: "Red flags detected - please monitor closely" };
  }

  return {
    score,
    redFlags,
    alerts,
    status,
    meta: {
      foodGrams,
      waterMl,
      hasLethargy: hasLethargyTag,
      hasInappetence,
      isEmergency: emergencyRedFlags > 0 || forcedMaxScore <= 19,
    }
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
    specialAlerts.push("ตรวจพบแนวโน้มสุขภาพลดลงต่อเนื่องในช่วง 7 วัน");
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
    specialAlerts.push("พบอาการซึม/เบื่ออาหารต่อเนื่องเกิน 4 วัน ควรเฝ้าระวังโรคเรื้อรัง");
  }

  // 💧 Behavior Drift: น้ำที่ดื่มเพิ่มขึ้นเรื่อย ๆ ภายใน 7 วัน (แบบค่อย ๆ เพิ่ม)
  // - ต้องมีข้อมูลอย่างน้อย 5 วัน และไม่มีวันไหน over-limit (> 500) เพราะเคสนั้นถือว่า Critical override ไปแล้ว
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
      specialAlerts.push("ตรวจพบพฤติกรรมดื่มน้ำเพิ่มขึ้นเรื่อยๆ ในช่วง 7 วัน (เสี่ยงโรคไตสะสม)");
    }
  }

  return {
    alerts: specialAlerts,
    signals: {
      scores,
      waters,
      maxDownStreak,
      maxSymptomStreak,
    },
  };
};
