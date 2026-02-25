/**
 * Cat Health Scoring Logic (Revised for Grams/ML and Slider Levels)
 */

export const getHealthStatus = (score) => {
  if (score >= 80) return { label: "Excellent", color: "#6FCF97", text: "Excellent health condition" };
  if (score >= 60) return { label: "Good", color: "#2D9CDB", text: "Generally good health" };
  if (score >= 40) return { label: "Fair", color: "#F2C94C", text: "Requires close monitoring" };
  return { label: "Attention", color: "#EB5757", text: "Consult a veterinarian" };
};

export const analyzeHealthLog = (log) => {
  // log จะมาในรูปแบบที่มี child arrays: normal_logs: [...], something_off_logs: [...]
  if (!log) return { score: 0, redFlags: 0, alerts: [], status: getHealthStatus(0) };

  const normal = log.normal_logs|| {};
  const off = log.something_off_logs|| {};

  let score = 100;
  let alerts = [];
  let redFlags = 0;

  // ==========================================
  // 1. Food Intake (อาหาร)
  // ==========================================
  const foodAmount = parseFloat(normal.total_food_grams) || 0;
  const hasFoodType = !!normal.food_type;

  if (foodAmount === 0 && !hasFoodType) {
      score -= 20;
      redFlags++;
      alerts.push("ไม่กินอาหาร");
  } else if (foodAmount > 0 && foodAmount < 15) {
      score -= 10;
      alerts.push("กินน้อยกว่าปกติ");
  } 

  // ==========================================
  // 2. Water Intake (น้ำ)
  // ==========================================
  const waterAmount = parseFloat(normal.water_ml_per_day) || 0;
  
  if (waterAmount === 0 && normal.food_type === 'dry_food') {
      score -= 10;
      alerts.push("ไม่ดื่มน้ำ (เสี่ยงโรคไต)");
  }

  // ==========================================
  // 3. Urine (ปัสสาวะ)
  // ==========================================
  if (normal.urine_level === 'very_low') { 
      score -= 25;
      redFlags++;
      alerts.push("ปัสสาวะไม่ออก/น้อยผิดปกติ");
  } else if (normal.urine_level === 'very_high') {
       score -= 5;
  }

  // ==========================================
  // 4. Stool (อุจจาระ)
  // ==========================================
  if (normal.stool_level === 'very_low') { 
      score -= 10;
      alerts.push("ท้องผูก (ถ่ายน้อย/แข็ง)");
  } else if (normal.stool_level === 'very_high') {
      score -= 10;
      alerts.push("ท้องเสีย (ถ่ายเหลว/บ่อย)");
  }

  // ==========================================
  // 5. Something Off (อาการผิดปกติ)
  // ==========================================
  
  // อาเจียน
  if (off.has_vomit) {
      score -= 20;
      redFlags++;
      alerts.push("มีอาการอาเจียน");
      if (['blood', 'red'].includes(off.vomit_type)) {
          score -= 10;
          alerts.push("อาเจียนมีเลือด");
      }
  }

  // ท้องเสีย (เช็คจาก table something_off)
  if (off.has_diarrhea) {
      score -= 15;
      alerts.push("มีอาการท้องเสีย");
  }

  // พฤติกรรม
  if (off.behavior_energy) {
      const bTags = Array.isArray(off.behavior_energy) ? off.behavior_energy : [off.behavior_energy];
      if (bTags.some(t => ['ซึม', 'ซ่อนตัว', 'โก่งตัว', 'ไม่กินอาหารเลย', 'ก้าวร้าว'].includes(t))) {
          score -= 15;
          alerts.push("พฤติกรรมผิดปกติ/ซึม");
      }
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    redFlags,
    alerts,
    status: getHealthStatus(score)
  };
};