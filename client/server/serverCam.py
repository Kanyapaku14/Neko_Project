import cv2
import threading
import io
from PIL import Image
from flask import Response, jsonify

# สมมติว่านี่คือโมเดล ML ของคุณ (เช่น YOLOv8)
# import my_cat_ml_model 

# URL ของ IP Camera (มักจะเป็น RTSP)
RTSP_URL = "rtsp://testt1:1234test@192.168.1.145:443/stream2"

# ตัวแปรป้องกันการยิง Gemini รัวเกินไป (Cooldown)
is_analyzing = False 

def analyze_frame_with_gemini(frame):
    """ฟังก์ชันทำงานเบื้องหลัง (Background Thread) ส่งภาพให้ Gemini"""
    global is_analyzing
    try:
        print("📸 ส่งภาพให้ Gemini วิเคราะห์...")
        # 1. แปลงภาพจาก OpenCV (BGR) เป็น PIL Image (RGB) ที่ Gemini รองรับ
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(rgb_frame)

        # 2. ส่งให้ Gemini 
        prompt = "ในภาพนี้ น้องแมวกำลังทำอะไร มีพฤติกรรมผิดปกติหรือไม่ ตอบสั้นๆ"
        
        # หมายเหตุ: ใช้ model ที่รองรับ Vision 
        response = client.models.generate_content(
            model="gemini-3.1-flash", 
            contents=[prompt, pil_img]
        )
        
        print(f"🤖 ผลลัพธ์จาก Gemini: {response.text}")
        
        # 3. นำผลลัพธ์ไปบันทึกลง Supabase หรือแจ้งเตือน Frontend ได้ที่นี่
        # supabase.table('cat_alerts').insert({...}).execute()

    except Exception as e:
        print(f"❌ Error Gemini API: {e}")
    finally:
        is_analyzing = False # ปลดล็อคให้ยิงใหม่ได้

def generate_video_stream():
    """ฟังก์ชันอ่านภาพจากกล้อง รัน ML และส่งสตรีมมิ่ง"""
    global is_analyzing
    
    cap = cv2.VideoCapture(RTSP_URL)
    frame_count = 0

    while True:
        success, frame = cap.read()
        if not success:
            print("⚠️ ไม่สามารถอ่านภาพจากกล้องได้ กำลังพยายามเชื่อมต่อใหม่...")
            cap = cv2.VideoCapture(RTSP_URL)
            continue

        frame_count += 1

        # --- 1. รัน ML Model (ควรทำแบบข้ามเฟรมเพื่อไม่ให้กระตุก เช่น ทุก 5 เฟรม) ---
        if frame_count % 5 == 0:
            # สมมติฐานการเรียกใช้โมเดล ML ของคุณ
            # detections = my_cat_ml_model.predict(frame)
            # is_cat_detected = detections.has_cat
            # is_behavior_target = detections.behavior == 'vomiting'
            
            # สมมติว่าเจอพฤติกรรมเป้าหมาย
            is_behavior_target = True # เปลี่ยนเป็น Logic จริงของคุณ
            
            # --- 2. ถ้าเจอพฤติกรรม และไม่ได้กำลังวิเคราะห์อยู่ ให้ Snapshot ---
            if is_behavior_target and not is_analyzing:
                is_analyzing = True
                # โยนเฟรมเข้าไปทำงานใน Thread ใหม่ เพื่อไม่ให้วิดีโอที่สตรีมอยู่ค้าง
                threading.Thread(target=analyze_frame_with_gemini, args=(frame.copy(),)).start()

        # --- 3. เข้ารหัสภาพเพื่อทำ Streaming ไปยัง Frontend ---
        ret, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()

        # ส่งภาพออกแบบ MJPEG
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

# =====================================================
# API ENDPOINT สำหรับ Frontend มารับ Video Stream
# =====================================================
@app.route('/api/video_feed')
def video_feed():
    """
    Frontend สามารถใช้: <img src="http://localhost:3000/api/video_feed" />
    เพื่อดูสตรีมสดได้เลย
    """
    return Response(generate_video_stream(), 
                    mimetype='multipart/x-mixed-replace; boundary=frame')