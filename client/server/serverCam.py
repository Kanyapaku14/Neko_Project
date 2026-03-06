from flask import Flask, Response
from flask_cors import CORS
import cv2
import time
import os

# บังคับการเชื่อมต่อผ่าน TCP
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"

app = Flask(__name__)
CORS(app)

# 🚨 ลิงก์ RTSP กล้องของคุณ
RTSP_URL = "rtsp://testt1:1234test@192.168.1.145:554/stream2"

def generate_camera_frames():
    print(f"📷 [Camera Server] กำลังเชื่อมต่อกล้อง: {RTSP_URL}")
    cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
    
    if not cap.isOpened():
        print("❌ [Camera Server] ERROR: ไม่สามารถเปิดกล้อง RTSP ได้ โปรดเช็ครหัสผ่าน หรือ IP กล้อง")
        return

    print("✅ [Camera Server] เชื่อมต่อกล้องสำเร็จ!")
    while True:
        success, frame = cap.read()
        if not success:
            print("⚠️ [Camera Server] สัญญาณภาพขาดหาย กำลังลองใหม่...")
            time.sleep(1)
            continue
            
        ret, buffer = cv2.imencode('.jpg', frame)
        if not ret: continue
            
        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

@app.route('/api/video_feed')
def video_feed():
    return Response(generate_camera_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == '__main__':
    print("🚀 [Camera Server] กำลังรันกล้องบน Port 5000...")
    # รันบนพอร์ต 5000 แยกกับ API Server เลย
    app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)