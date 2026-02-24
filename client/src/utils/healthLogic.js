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
    // 1. ถ้าไม่มี log เลย ให้ส่งค่าว่างหรือ 0
    if (!log) return { score: 0, redFlags: 0, alerts: [], status: getHealthStatus(0) };

    let score = 100;
    let alerts = [];
    let redFlags = 0;

    // Map new schema fields to logic variables
    const foodAmount = parseFloat(log.food_amount || log.food_intake) || 0;
    const foodType = log.food_type || log.food_type_enum;
    const waterAmount = parseFloat(log.water_amount || log.water_level || log.water_intake) || 0;
    const urineColor = log.urine_color || log.urine_color_enum;
    const urineLevel = log.urine_level || log.urine_level_enum;
    const stoolColor = log.stool_color || log.stool_color_enum;
    const stoolLevel = log.stool_level || log.stool_level_enum;
    const vomitLevel = log.vomit_level || log.vomit_level_enum;
    const vomitColor = log.vomit_color || log.vomit_color_enum;
    const behavior = log.behavior || log.behavior_enum;

    // ==========================================
    // 1. Food Intake (อาหาร)
    // ==========================================
    if (foodAmount === 0 && !foodType) {
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
    if (waterAmount === 0 && foodType === 'dry') {
        score -= 10;
        alerts.push("ไม่ดื่มน้ำ (เสี่ยงโรคไต)");
    }

    // ==========================================
    // 3. Urine (ปัสสาวะ)
    // ==========================================
    if (['red', 'pink', 'bloody'].includes(urineColor)) {
        score -= 30;
        redFlags++;
        alerts.push("ปัสสาวะมีเลือดปน");
    } else if (['dark_yellow', 'brown'].includes(urineColor)) {
        score -= 10;
        alerts.push("ปัสสาวะสีเข้ม (ขาดน้ำ)");
    }

    if (urineLevel === 'very_low') {
        score -= 25;
        redFlags++;
        alerts.push("ปัสสาวะไม่ออก/น้อยผิดปกติ");
    } else if (urineLevel === 'very_high') {
        score -= 5;
    }

    // ==========================================
    // 4. Stool (อุจจาระ)
    // ==========================================
    if (['black', 'bloody', 'red', 'mucus'].includes(stoolColor)) {
        score -= 20;
        redFlags++;
        alerts.push("สีอุจจาระผิดปกติ");
    }

    if (stoolLevel === 'very_low') {
        score -= 10;
        alerts.push("ท้องผูก (ถ่ายน้อย/แข็ง)");
    } else if (stoolLevel === 'very_high') {
        score -= 10;
        alerts.push("ท้องเสีย (ถ่ายเหลว/บ่อย)");
    }

    // ==========================================
    // 5. Vomit (อาเจียน)
    // ==========================================
    if (vomitLevel === 'high' || vomitLevel === 'very_high') {
        score -= 20;
        redFlags++;
        alerts.push("อาเจียนบ่อย");
    } else if (vomitLevel === 'low') {
        score -= 5;
    }

    if (['bloody', 'red', 'coffee_ground'].includes(vomitColor)) {
        score -= 30;
        redFlags++;
        alerts.push("อาเจียนมีเลือด/สีอันตราย");
    }

    // ==========================================
    // 6. Behavior (พฤติกรรม)
    // ==========================================
    if (['lethargic', 'hiding', 'hunched'].includes(behavior)) {
        score -= 15;
        alerts.push("ซึม/หลบซ่อน");
    } else if (['aggressive', 'painful_vocal'].includes(behavior)) {
        score -= 15;
        alerts.push("ดุร้าย/ร้องเจ็บปวด");
    }

    // Clamp score ให้อยู่ระหว่าง 0-100
    score = Math.max(0, Math.min(100, score));

    return {
        score,
        redFlags,
        alerts,
        status: getHealthStatus(score)
    };
};