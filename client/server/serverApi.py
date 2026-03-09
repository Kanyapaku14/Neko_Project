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
# 1. SETUP & CONFIGURATION
# =====================================================

# ป้องกันปัญหา SSL Certificate บน Windows
os.environ['CURL_CA_BUNDLE'] = ''
os.environ['SSL_CERT_FILE'] = ''

# โหลด Environment Variables จากไฟล์ .env ที่อยู่โฟลเดอร์นอกสุด
current_dir = os.path.dirname(os.path.abspath(__file__))
dotenv_path = os.path.join(current_dir, '..', '.env')
load_dotenv(dotenv_path)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
SUPABASE_URL = os.getenv("EXPO_PUBLIC_SUPABASE_URL")

# 🚨 ใช้ Service Role Key เพื่อให้ Python ทะลุ RLS ของ Supabase เข้าไปอ่านข้อมูลได้
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

app = Flask(__name__)
CORS(app)

try:
    print("⏳ กำลังเชื่อมต่อ Gemini...")
    client = genai.Client(api_key=GEMINI_API_KEY)
    print("✅ Gemini เชื่อมต่อสำเร็จ")                                                                                              
    print("⏳ กำลังเชื่อมต่อ Supabase...")
    if not SUPABASE_KEY:
        raise ValueError("หา SUPABASE_SERVICE_KEY ไม่พบ โปรดเช็คการตั้งค่าในไฟล์ .env")
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("✅ Supabase เชื่อมต่อสำเร็จ")
except Exception as e:
    print(f"❌ Error initializing services:")
    traceback.print_exc()

# =====================================================
# 2. LOGIC CALCULATION (ประมวลผลความเสี่ยง)
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
    scores = {
        "Kidney Disease": 0, "Diabetes": 0, "Urolithiasis": 0,
        "Gum Disease": 0, "Feline Panleukopenia": 0
    }

    # ข้อมูลพื้นฐานจากโปรไฟล์แมว
    age_years = calculate_age_years(cat_data.get('birthdate'))
    gender = cat_data.get('gender', 'Male')
    weights = cat_data.get('cat_weights', [])
    current_weight = float(weights[0]['weight_kg']) if weights else 4.0

    if age_years >= 7: 
        scores["Kidney Disease"] += 20; scores["Gum Disease"] += 15
    if age_years >= 10: scores["Kidney Disease"] += 15
    if 5 <= age_years <= 10: scores["Diabetes"] += 15
    if age_years >= 3: scores["Gum Disease"] += 10
    if 1 <= age_years <= 7: scores["Urolithiasis"] += 15
    if age_years <= 1.5: scores["Feline Panleukopenia"] += 40
    
    if gender == 'Male':
        scores["Diabetes"] += 10; scores["Urolithiasis"] += 25
        
    if current_weight >= 6.0:
        scores["Diabetes"] += 20; scores["Gum Disease"] += 15 

    # ข้อมูลจาก Daily Log ย้อนหลัง
    for daily in daily_logs:
        normal = daily.get('normal_logs', [])
        if isinstance(normal, list) and len(normal) > 0: normal = normal[0]
        
        off = daily.get('something_off_logs', [])
        if isinstance(off, list) and len(off) > 0: off = off[0]

        if normal:
            water = normal.get('water_ml_per_day', 0) or 0
            urine = normal.get('urine_level', 'normal')
            food_type = normal.get('food_type', '')

            if 0 < water < 30: 
                scores["Urolithiasis"] += 5; scores["Kidney Disease"] += 5
            elif water > 150: 
                scores["Kidney Disease"] += 10; scores["Diabetes"] += 5

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
                if v_type in ['yellow', 'white_foam']: 
                    scores["Feline Panleukopenia"] += 10; scores["Gum Disease"] += 10

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

    # ลิมิตคะแนนสูงสุดไว้ที่ 100
    for key in scores:
        scores[key] = min(100, max(0, scores[key]))

    return scores

# =====================================================
# 3. PROMPT BUILDERS 
# =====================================================
def build_summary_prompt(cat_data, computed_scores):
    name = cat_data.get('name', 'น้องแมว')
    return f"""
    คุณเป็นสัตวแพทย์ผู้เชี่ยวชาญ AI
    ระบบประมวลผลตรรกะทางการแพทย์ ได้วิเคราะห์ความเสี่ยงของ "{name}" ออกมาเป็นเปอร์เซ็นต์ดังนี้:
    - โรคนิ่ว (Urolithiasis): {computed_scores['Urolithiasis']}%
    - โรคไต (Kidney Disease): {computed_scores['Kidney Disease']}%
    - โรคตับและฟัน (Gum Disease): {computed_scores['Gum Disease']}%
    - โรคหัดแมว (Feline Panleukopenia): {computed_scores['Feline Panleukopenia']}%
    - โรคเบาหวาน (Diabetes): {computed_scores['Diabetes']}%

    จงวิเคราะห์ภาพรวมจากตัวเลขเหล่านี้ และตอบกลับเป็น JSON Format เท่านั้น:
    {{
      "summaryTitle": "หัวข้อสรุปผล (เช่น 'มีความเสี่ยงโรคนิ่วสูง' หรือ 'สุขภาพโดยรวมแข็งแรงดี' ภาษาไทยสั้นๆ)",
      "summaryDesc": "คำอธิบายภาพรวม 2-3 ประโยค อธิบายว่าทำไมน้องแมวถึงเสี่ยงโรคที่คะแนนสูงสุด โดยใช้ภาษาที่อบอุ่นและเป็นห่วง"
    }}
    """

def build_disease_prompt(disease_name, cat_data):
    name = cat_data.get("name", "น้องแมว")
    return f"""
    คุณเป็นผู้ช่วยสัตวแพทย์อัจฉริยะ
    ภารกิจ: ให้คำแนะนำสุขภาพเฉพาะตัวสำหรับแมวชื่อ "{name}" ที่กำลังสนใจหรือมีความเสี่ยง: "{disease_name}"

    ตอบกลับเป็น JSON Format เท่านั้น:
    {{
      "prevention": {{
        "title": "วิธีดูแลและป้องกัน {disease_name}",
        "intro": "เกริ่นนำสั้นๆ ให้อุ่นใจ",
        "points": [
          {{ "title": "หัวข้อ", "desc": "คำอธิบายสั้นๆ เข้าใจง่าย" }}
        ]
      }},
      "counseling": {{
        "title": "สัญญาณเตือนที่ต้องเฝ้าระวัง (Red Flags)",
        "intro": "หากพบอาการเหล่านี้ รีบพาไปหาหมอทันที",
        "red_flags": [
          {{ "symptom": "ชื่ออาการ", "meaning": "บ่งบอกอะไร" }}
        ]
      }}
    }}
    """

# =====================================================
# 4. API ENDPOINTS
# =====================================================
@app.route('/api/assessment', methods=['POST'])
def get_assessment():
    try:
        data = request.json
        cat_id = data.get('catId')
        if not cat_id: return jsonify({"error": "catId is required"}), 400

        # ดึงข้อมูลแมว
        cat_response = supabase.table('cats').select(
            '*, cat_weights(weight_kg, measured_at)'
        ).eq('id', cat_id).order('measured_at', desc=True, foreign_table='cat_weights').limit(1, foreign_table='cat_weights').execute()

        if not cat_response.data: return jsonify({"error": "Cat not found"}), 404
        cat_data = cat_response.data[0]

        # ดึงข้อมูล Daily Log ย้อนหลัง 7 วัน
        logs_response = supabase.table('daily_logs').select(
            '*, normal_logs(*), something_off_logs(*)'
        ).eq('cat_id', cat_id).order('log_date', desc=True).limit(7).execute()
        
        daily_logs = logs_response.data or []

        # ==========================================
        # 🚨 ตรวจสอบว่ามีการบันทึกข้อมูลของ "วันนี้" แล้วหรือยัง
        # ==========================================
        tz_th = timezone(timedelta(hours=7))
        today_str = datetime.now(tz_th).strftime('%Y-%m-%d')
        
        has_today_log = False
        for log in daily_logs:
            # ใช้ [:10] เพื่อตัดเอาเฉพาะ 2026-03-01 เผื่อกรณีในฐานข้อมูลมีเวลา (Time) พ่วงมาด้วย
            log_date = str(log.get('log_date', ''))[:10]
            if log_date == today_str:
                has_today_log = True
                break

        # ถ้าวันนี้ยังไม่ได้บันทึกข้อมูล ให้เตะกลับไปให้แอปโชว์แจ้งเตือน
        if not has_today_log:
            print(f"⚠️ ไม่พบข้อมูลของวันนี้ ({today_str}) สั่งให้แอปเด้งแจ้งเตือน")
            return jsonify({
                "success": True,
                "requireTodayLog": True, 
                "riskData": [
                    {"label": "Kidney Disease", "value": "No Data", "score": 0},
                    {"label": "Diabetes", "value": "No Data", "score": 0},
                    {"label": "Urolithiasis", "value": "No Data", "score": 0},
                    {"label": "Gum Disease", "value": "No Data", "score": 0},
                    {"label": "Feline Panleukopenia", "value": "No Data", "score": 0}
                ],
                "overallScore": 0,
                "overallRisk": "No Data",
                "summaryTitle": "ขาดข้อมูลของวันนี้",
                "summaryDesc": "กรุณาบันทึกข้อมูลสุขภาพประจำวัน (Daily Log) ของวันนี้ก่อน เพื่อให้ระบบประเมินความเสี่ยงได้แม่นยำ"
            })

        # คำนวณเปอร์เซ็นต์ความเสี่ยง
        computed_scores = calculate_disease_risks(cat_data, daily_logs)

        # ส่งให้ Gemini สรุปผล
        prompt = build_summary_prompt(cat_data, computed_scores)
        response = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
        ai_summary = json.loads(response.text)

        target_order = ["Kidney Disease", "Diabetes", "Urolithiasis", "Gum Disease", "Feline Panleukopenia"]
        frontend_risk_data = []
        overall_score = 0

        # จัดเตรียมข้อมูลส่งกลับให้หน้า ResultScreen.js
        for disease in target_order:
            score = computed_scores.get(disease, 0)
            if score > overall_score: 
                overall_score = score
            
            frontend_risk_data.append({
                "label": disease,
                "value": assign_risk_label(score),
                "score": score
            })

        return jsonify({
            "success": True,
            "requireTodayLog": False,
            "riskData": frontend_risk_data,
            "overallScore": overall_score,
            "overallRisk": assign_risk_label(overall_score),
            "summaryTitle": ai_summary.get("summaryTitle", ""),
            "summaryDesc": ai_summary.get("summaryDesc", "")
        })

    except Exception as e:
        print(f"❌ Error in assessment: {e}")
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

        disease_map = {
            "Urolithiasis": "โรคนิ่วในแมว",
            "Kidney Disease": "โรคไตในแมว",
            "Gum Disease": "โรคตับและช่องปากในแมว",
            "Feline Panleukopenia": "โรคหัดแมว",
            "Diabetes": "โรคเบาหวานในแมว"
        }
        thai_disease_name = disease_map.get(condition, condition)

        prompt = build_disease_prompt(thai_disease_name, cat_data)
        response = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
        return jsonify(json.loads(response.text))
    except Exception as e:
        print(f"❌ Error in guidance: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/photo-check', methods=['POST'])
def photo_check():
    """
    รับ recordId ของ ai_photo_checks → ดึง URL รูป → วิเคราะห์ด้วย Gemini Vision
    → บันทึกผลกลับ Supabase → คืน JSON ให้ app
    """
    try:
        data = request.json
        record_id = data.get('recordId')
        if not record_id:
            return jsonify({"error": "recordId is required"}), 400

        # 1. ดึง record จาก Supabase
        res = supabase.table('ai_photo_checks').select(
            'id, image_face_url, image_body_url, image_poop_url, image_vomit_url'
        ).eq('id', record_id).single().execute()

        if not res.data:
            return jsonify({"error": "Record not found"}), 404

        row = res.data

        # 2. สร้าง parts สำหรับ Gemini (เฉพาะช่องที่มีรูป)
        SLOT_META = {
            'image_face_url':  ('face',  'ใบหน้าและตา (Face & Eyes)'),
            'image_body_url':  ('body',  'รูปร่างและขน (Body Shape & Coat)'),
            'image_poop_url':  ('poop',  'อุจจาระ (Feces)'),
            'image_vomit_url': ('vomit', 'อ้วก (Vomit)'),
        }

        slots_present = []
        gemini_parts = []

        prompt_intro = """
คุณเป็นสัตวแพทย์ AI ผู้เชี่ยวชาญด้านสุขภาพแมว
ฉันจะส่งรูปภาพของแมวให้คุณดู อาจมีตั้งแต่ 1-4 รูป ได้แก่: ใบหน้า, ลำตัว, อุจจาระ, และอ้วก
กรุณาวิเคราะห์แต่ละรูปและตอบกลับเป็น JSON Format เท่านั้น (ห้ามมีข้อความอื่นนอก JSON):

{
  "overallStatus": "Good / Moderate Concern / Needs Attention",
  "overallDesc": "คำอธิบายภาพรวมสุขภาพ 2-3 ประโยค ภาษาไทย อบอุ่นและเป็นห่วง",
  "items": [
    {
      "slot": "face|body|poop|vomit",
      "label": "ชื่อหมวดหมู่ภาษาไทย",
      "finding": "สิ่งที่พบจากรูป 1-2 ประโยค",
      "risk": "low|moderate|high"
    }
  ],
  "recommendations": [
    "คำแนะนำ 1",
    "คำแนะนำ 2",
    "คำแนะนำ 3"
  ]
}

กฎ:
- items[] ต้องมีเฉพาะ slot ที่ได้รับรูปมาเท่านั้น
- risk: low = ปกติดี, moderate = ควรสังเกต, high = ควรพาพบสัตวแพทย์
- ถ้ารูปไม่ชัดหรือดูยาก ให้ระบุใน finding ตามความเป็นจริง
- ตอบกลับเป็น JSON เท่านั้น ไม่มี markdown code block

รูปที่จะส่งให้:
"""
        slot_labels = []
        for col, (slot_key, slot_label) in SLOT_META.items():
            url = row.get(col)
            if url:
                slots_present.append((slot_key, slot_label))
                slot_labels.append(f"- {slot_label}")
                gemini_parts.append(types.Part.from_uri(file_uri=url, mime_type="image/jpeg"))

        if not slots_present:
            return jsonify({"error": "No images found in record"}), 400

        prompt_text = prompt_intro + "\n".join(slot_labels)
        gemini_parts.insert(0, types.Part.from_text(text=prompt_text))

        # 3. เรียก Gemini Vision
        response = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=[types.Content(parts=gemini_parts, role="user")],
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )

        ai_result = json.loads(response.text)

        # 4. บันทึกผลกลับ Supabase
        supabase.table('ai_photo_checks').update({
            'status': 'done',
            'ai_result': ai_result
        }).eq('id', record_id).execute()

        return jsonify({"success": True, "result": ai_result})

    except Exception as e:
        print(f"❌ Error in photo-check: {e}")
        traceback.print_exc()
        # อัปเดตสถานะเป็น error ใน Supabase
        try:
            if record_id:
                supabase.table('ai_photo_checks').update({
                    'status': 'error'
                }).eq('id', record_id).execute()
        except:
            pass
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':

    print("🚀 Server is running on port 3000...")
    app.run(host='0.0.0.0', port=3000, debug=True)