from flask import Flask, request, jsonify
from flask_cors import CORS
from google import genai
from google.genai import types
import os
import json
import traceback
from dotenv import load_dotenv
from supabase import create_client, Client
from datetime import datetime, timedelta, timezone

# =====================================================
# 1. SETUP & CONFIGURATION (ไม่มี OpenCV แล้ว)
# =====================================================

os.environ['CURL_CA_BUNDLE'] = ''
os.environ['SSL_CERT_FILE'] = ''

current_dir = os.path.dirname(os.path.abspath(__file__))
dotenv_path = os.path.join(current_dir, '..', '.env')
load_dotenv(dotenv_path)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
SUPABASE_URL = os.getenv("EXPO_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

app = Flask(__name__)
CORS(app)

try:
    print("⏳ [API Server] กำลังเชื่อมต่อ Gemini...")
    client = genai.Client(api_key=GEMINI_API_KEY)
    print("✅ [API Server] Gemini เชื่อมต่อสำเร็จ")
    
    print("⏳ [API Server] กำลังเชื่อมต่อ Supabase...")
    if not SUPABASE_KEY:
        raise ValueError("หา SUPABASE_SERVICE_KEY ไม่พบ")
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("✅ [API Server] Supabase เชื่อมต่อสำเร็จ")
except Exception as e:
    print(f"❌ [API Server] Error initializing services:")
    traceback.print_exc()

# =====================================================
# 2. LOGIC CALCULATION
# =====================================================
def calculate_age_years(birthdate_str):
    if not birthdate_str: return 3.0
    try:
        b_date = datetime.strptime(birthdate_str, "%Y-%m-%d").date()
        tz_th = timezone(timedelta(hours=7))
        today_date = datetime.now(tz_th).date()
        return (today_date - b_date).days / 365.25
    except:
        return 3.0

def assign_risk_label(score):
    if score <= 20: return "Normal"
    elif score <= 40: return "Low"
    elif score <= 60: return "Moderate"
    elif score <= 80: return "High"
    else: return "Extreme"

def calculate_disease_risks(cat_data, daily_logs):
    scores = {"Kidney Disease": 0, "Diabetes": 0, "Urolithiasis": 0, "Gum Disease": 0, "Feline Panleukopenia": 0}
    age_years = calculate_age_years(cat_data.get('birthdate'))
    gender = cat_data.get('gender', 'Male')
    weights = cat_data.get('cat_weights', [])
    current_weight = float(weights[0]['weight_kg']) if weights else 4.0

    if age_years >= 7: scores["Kidney Disease"] += 20; scores["Gum Disease"] += 15
    if age_years >= 10: scores["Kidney Disease"] += 15
    if 5 <= age_years <= 10: scores["Diabetes"] += 15
    if age_years >= 3: scores["Gum Disease"] += 10
    if 1 <= age_years <= 7: scores["Urolithiasis"] += 15
    if age_years <= 1.5: scores["Feline Panleukopenia"] += 40
    
    if gender == 'Male': scores["Diabetes"] += 10; scores["Urolithiasis"] += 25
    if current_weight >= 6.0: scores["Diabetes"] += 20; scores["Gum Disease"] += 15 

    for daily in daily_logs:
        normal = daily.get('normal_logs', [])
        if isinstance(normal, list) and len(normal) > 0: normal = normal[0]
        off = daily.get('something_off_logs', [])
        if isinstance(off, list) and len(off) > 0: off = off[0]

        if normal:
            water = normal.get('water_ml_per_day', 0) or 0
            urine = normal.get('urine_level', 'normal')
            food_type = normal.get('food_type', '')

            if 0 < water < 30: scores["Urolithiasis"] += 5; scores["Kidney Disease"] += 5
            elif water > 150: scores["Kidney Disease"] += 10; scores["Diabetes"] += 5

            if urine in ['low', 'very_low']: scores["Urolithiasis"] += 15
            elif urine in ['high', 'very_high']: scores["Kidney Disease"] += 10; scores["Diabetes"] += 5

            if food_type == 'dry_food': scores["Urolithiasis"] += 5; scores["Diabetes"] += 5

        if off:
            vomit = off.get('has_vomit', False)
            v_type = off.get('vomit_type', '')
            diarrhea = off.get('has_diarrhea', False)
            d_type = off.get('diarrhea_type', '')
            behaviors = off.get('behavior_energy', []) or []

            if vomit:
                scores["Feline Panleukopenia"] += 15; scores["Kidney Disease"] += 10
                if v_type in ['yellow', 'white_foam']: scores["Feline Panleukopenia"] += 10; scores["Gum Disease"] += 10

            if diarrhea:
                scores["Feline Panleukopenia"] += 15
                if d_type in ['watery', 'fresh_blood', 'black']: scores["Feline Panleukopenia"] += 20

            if 'กินน้ำเยอะผิดปกติ' in behaviors: scores["Kidney Disease"] += 15; scores["Diabetes"] += 15
            if 'โก่งตัว' in behaviors: scores["Urolithiasis"] += 30
            if 'ร้องผิดปกติ' in behaviors: scores["Urolithiasis"] += 10; scores["Gum Disease"] += 10
            if 'ไม่กินอาหารเลย' in behaviors: scores["Gum Disease"] += 20; scores["Feline Panleukopenia"] += 15
            if 'ซึม' in behaviors: scores["Feline Panleukopenia"] += 10; scores["Kidney Disease"] += 5
            if 'เบื่ออาหาร' in behaviors: scores["Gum Disease"] += 10
            if 'กินจุผิดปกติ' in behaviors: scores["Diabetes"] += 15

    for key in scores: scores[key] = min(100, max(0, scores[key]))
    return scores

# =====================================================
# 3. PROMPT BUILDERS
# =====================================================
def build_summary_prompt(cat_data, computed_scores):
    name = cat_data.get('name', 'น้องแมว')
    return f"""
    คุณเป็นสัตวแพทย์ผู้เชี่ยวชาญ AI
    ระบบได้วิเคราะห์ความเสี่ยงของ "{name}" ออกมาดังนี้:
    - โรคนิ่ว: {computed_scores['Urolithiasis']}%
    - โรคไต: {computed_scores['Kidney Disease']}%
    - โรคตับและฟัน: {computed_scores['Gum Disease']}%
    - โรคหัดแมว: {computed_scores['Feline Panleukopenia']}%
    - โรคเบาหวาน: {computed_scores['Diabetes']}%

    สรุปภาพรวมและตอบกลับเป็น JSON Format:
    {{
      "summaryTitle": "หัวข้อสรุปผลสั้นๆ",
      "summaryDesc": "คำอธิบายภาพรวม 2-3 ประโยค"
    }}
    """

def build_disease_prompt(disease_name, cat_data):
    name = cat_data.get("name", "น้องแมว")
    return f"""
    คุณเป็นผู้ช่วยสัตวแพทย์อัจฉริยะ ให้คำแนะนำสุขภาพสำหรับ "{name}" เรื่อง "{disease_name}"
    ตอบเป็น JSON Format:
    {{
      "prevention": {{ "title": "วิธีดูแล", "intro": "เกริ่นนำ", "points": [{{ "title": "หัวข้อ", "desc": "คำอธิบาย" }}] }},
      "counseling": {{ "title": "สัญญาณเตือน", "intro": "เกริ่นนำ", "red_flags": [{{ "symptom": "ชื่ออาการ", "meaning": "ความหมาย" }}] }}
    }}
    """

# =====================================================
# 4. API ENDPOINTS (ไม่มี /api/video_feed แล้ว)
# =====================================================
@app.route('/api/assessment', methods=['POST'])
def get_assessment():
    try:
        data = request.json
        cat_id = data.get('catId')
        if not cat_id: return jsonify({"error": "catId is required"}), 400

        cat_response = supabase.table('cats').select('*, cat_weights(weight_kg, measured_at)').eq('id', cat_id).order('measured_at', desc=True, foreign_table='cat_weights').limit(1, foreign_table='cat_weights').execute()
        if not cat_response.data: return jsonify({"error": "Cat not found"}), 404
        cat_data = cat_response.data[0]

        logs_response = supabase.table('daily_logs').select('*, normal_logs(*), something_off_logs(*)').eq('cat_id', cat_id).order('log_date', desc=True).limit(7).execute()
        daily_logs = logs_response.data or []

        tz_th = timezone(timedelta(hours=7))
        today_str = datetime.now(tz_th).strftime('%Y-%m-%d')
        
        has_today_log = any(str(log.get('log_date', ''))[:10] == today_str for log in daily_logs)

        if not has_today_log:
            return jsonify({
                "success": True, "requireTodayLog": True, 
                "riskData": [{"label": k, "value": "No Data", "score": 0} for k in ["Kidney Disease", "Diabetes", "Urolithiasis", "Gum Disease", "Feline Panleukopenia"]],
                "overallScore": 0, "overallRisk": "No Data",
                "summaryTitle": "ขาดข้อมูลของวันนี้", "summaryDesc": "กรุณาบันทึกข้อมูลสุขภาพประจำวัน (Daily Log) ของวันนี้ก่อน"
            })

        computed_scores = calculate_disease_risks(cat_data, daily_logs)

        prompt = build_summary_prompt(cat_data, computed_scores)
        response = client.models.generate_content(model="gemini-3-flash-preview", contents=prompt, config=types.GenerateContentConfig(response_mime_type="application/json"))
        ai_summary = json.loads(response.text)

        target_order = ["Kidney Disease", "Diabetes", "Urolithiasis", "Gum Disease", "Feline Panleukopenia"]
        frontend_risk_data = []
        overall_score = 0

        for disease in target_order:
            score = computed_scores.get(disease, 0)
            if score > overall_score: overall_score = score
            frontend_risk_data.append({"label": disease, "value": assign_risk_label(score), "score": score})

        return jsonify({
            "success": True, "requireTodayLog": False, "riskData": frontend_risk_data,
            "overallScore": overall_score, "overallRisk": assign_risk_label(overall_score),
            "summaryTitle": ai_summary.get("summaryTitle", ""), "summaryDesc": ai_summary.get("summaryDesc", "")
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/guidance', methods=['POST'])
def get_guidance():
    try:
        data = request.json
        condition = data.get('condition')
        cat_id = data.get('catId')
        cat_data = {}
        if cat_id:
            try:
                res = supabase.table('cats').select('name, breed').eq('id', cat_id).single().execute()
                cat_data = res.data or {}
            except: pass 

        disease_map = {"Urolithiasis": "โรคนิ่วในแมว", "Kidney Disease": "โรคไตในแมว", "Gum Disease": "โรคตับและช่องปากในแมว", "Feline Panleukopenia": "โรคหัดแมว", "Diabetes": "โรคเบาหวานในแมว"}
        thai_disease_name = disease_map.get(condition, condition)

        prompt = build_disease_prompt(thai_disease_name, cat_data)
        response = client.models.generate_content(model="gemini-3-flash-preview", contents=prompt, config=types.GenerateContentConfig(response_mime_type="application/json"))
        return jsonify(json.loads(response.text))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("🚀 [API Server] กำลังรันบน Port 5000...")
    app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)