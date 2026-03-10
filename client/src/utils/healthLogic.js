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
  if (score >= 80) return { label: "Excellent", color: "#6FCF97", text: "Excellent health condition" };
  if (score >= 60) return { label: "Good",      color: "#2D9CDB", text: "Generally good health" };
  if (score >= 40) return { label: "Fair",      color: "#F2C94C", text: "Requires close monitoring" };
  return                   { label: "Attention", color: "#EB5757", text: "Consult a veterinarian" };
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
  if (!log) return { score: 0, redFlags: 0, alerts: [], status: getHealthStatus(0) };

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

  let score = 100;
  let alerts = [];
  let redFlags = 0;

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

  // 1a. คำนวณเกณฑ์อาหารตามน้ำหนัก (RER simplified)
  // ปกติแมวควรทานอาหารเปียก/BARF ประมาณ 40-50g ต่อ นน. ตัว 1 กก.
  const foodThreshold = catWeight * 12; // เกณฑ์ขั้นต่ำ (Inappetence)
  const hasNoFoodTag = behaviorTags.includes('ไม่กินอาหารเลย');

  if (foodGrams === 0 && (hasNoFoodTag || !foodType && mealLogs.length === 0)) {
    // Anorexia: ไม่กินเลย
    addAlert("ไม่กินอาหารเลย (Anorexia)", 40, true);
  } else if (foodGrams > 0 && foodGrams < foodThreshold) {
    // Inappetence: กินน้อยกว่าเกณฑ์ตามน้ำหนักตัว
    addAlert(`กินอาหารน้อยผิดปกติ (${foodGrams}g เทียบกับเกณฑ์ ${foodThreshold}g)`, 20);
  }

  // 1b. สมดุลน้ำตามสัดส่วนอาหารเม็ด (Hydration Logic)
  const hasNoWaterTag      = behaviorTags.includes('ไม่กินน้ำเลย');
  const hasExcessWaterTag  = behaviorTags.includes('กินน้ำเยอะผิดปกติ');
  
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

  if (hasExcessWaterTag) {
    // ดื่มน้ำเยอะผิดปกติ (สัญญาณเบาหวาน/ไต)
    addAlert("ดื่มน้ำเยอะผิดปกติ (สัญญาณเบาหวาน/ไต)", 10);
  }

  // ==========================================
  // 2. หมวด Physical & Respiratory
  // ==========================================

  // 2a. ระบบหายใจ
  if (respiratoryTags.includes('หายใจหอบ')) {
    addAlert("หายใจหอบ (Emergency)", 30, true);
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
      addAlert("อาเจียนมีเลือด (Critical)", 30, true);
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
  if (s.has_diarrhea) {
    const dt = s.diarrhea_type;
    if (dt === 'fresh_blood' || dt === 'black') {
      addAlert("อุจจาระมีเลือด/สีดำ (Critical)", 25, true);
    } else if (['watery', 'mushy', 'mucus'].includes(dt)) {
      addAlert("ท้องเสีย (" + dt + ")", 15);
    } else {
      addAlert("มีอาการท้องเสีย", 15);
    }
  }

  if (n.stool_level === 'very_low') {
    addAlert("ท้องผูก (ถ่ายน้อย/ไม่ถ่าย)", 10);
  } else if (n.stool_level === 'very_high') {
    addAlert("ถ่ายบ่อยผิดปกติ", 10);
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
  if (behaviorTags.includes('กินจุผิดปกติ')) {
    addAlert("กินจุผิดปกติ (สัญญาณเบาหวาน/ไทรอยด์)", 5);
  }

  // ==========================================
  // 🔒 Clamp Score & Red Flag Override
  // ==========================================
  score = Math.max(0, Math.min(100, score));

  let status = getHealthStatus(score);
  
  // ถ้ามี Red Flag มากกว่า 1 อย่าง ให้ล็อคเป็น Attention ทันที
  if (redFlags >= 1 && score > 40) {
    status = { label: "Attention", color: "#EB5757", text: "Critical symptoms detected - Consult Vet" };
  }

  return {
    score,
    redFlags,
    alerts,
    status
  };
};