import os
import json
import requests
from flask import Flask, request, jsonify
import google.generativeai as genai
from dotenv import load_dotenv

# Tải cấu hình từ .env
load_dotenv()

LARK_APP_ID = os.getenv("LARK_APP_ID")
LARK_APP_SECRET = os.getenv("LARK_APP_SECRET")
LARK_VERIFICATION_TOKEN = os.getenv("LARK_VERIFICATION_TOKEN")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Cấu hình AI
genai.configure(api_key=GEMINI_API_KEY)
# Sử dụng mô hình mới nhất của Google phù hợp cho chat
model = genai.GenerativeModel('gemini-1.5-flash')

app = Flask(__name__)

# Cache Token để đỡ phải goi API liên tục
TENANT_ACCESS_TOKEN = ""

def get_tenant_access_token():
    """Gọi API Lark để xin phiên làm việc mới (Tenant Access Token)"""
    global TENANT_ACCESS_TOKEN
    url = "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal"
    payload = {
        "app_id": LARK_APP_ID,
        "app_secret": LARK_APP_SECRET
    }
    response = requests.post(url, json=payload)
    if response.status_code == 200:
        data = response.json()
        if data.get("code") != 0:
            print(f"❌ Lỗi Token Lark: {data}")
        TENANT_ACCESS_TOKEN = data.get("tenant_access_token", "")
        return TENANT_ACCESS_TOKEN
    else:
        print(f"❌ API Token Thất Bại: {response.text}")
    return None

def send_lark_reply(message_id, text):
    """Phản hồi lại đoạn chat chứa message_id trên Lark"""
    token = get_tenant_access_token()
    if not token:
        print("❌ Hủy gửi tin: Không có Token (Do sai App ID/Secret)")
        return
        
    url = f"https://open.larksuite.com/open-apis/im/v1/messages/{message_id}/reply"
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": f"Bearer {token}"
    }
    payload = {
        "content": json.dumps({"text": text}),
        "msg_type": "text"
    }
    resp = requests.post(url, headers=headers, json=payload)
    if resp.status_code != 200 or resp.json().get("code") != 0:
        print(f"❌ Lỗi gửi tin (Lark chặn): {resp.text}")
    else:
        print(f"✅ Đã trả lời thành công cho message_id: {message_id}")

def generate_ai_response(user_text):
    """Nạp file Kiến thức vận hành THE Agent và yêu cầu AI suy luận"""
    root_path = os.path.dirname(os.path.abspath(__file__))
    knowledge_file = os.path.join(root_path, "Tong_Hop_Kien_Thuc_THE.md")
    
    agent_brain = "Bạn là THE-Agent. Hãy trả lời câu hỏi bằng tiếng Việt chuyên nghiệp.\n"
    if os.path.exists(knowledge_file):
        with open(knowledge_file, "r", encoding="utf-8") as f:
            agent_brain += f"--- KIẾN THỨC NỀN TẢNG ---\n{f.read()}\n"
            
    prompt = f"{agent_brain}\nCâu hỏi của User: {user_text}\nCâu trả lời của bạn:"
    
    try:
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        return f"Lỗi xử lý AI: {str(e)}"

@app.route('/webhook/event', methods=['POST'])
def lark_event_handler():
    """Hứng sự kiện từ Lark bắn về"""
    data = request.json
    
    # 1. BƯỚC VƯỢT ẢI (URL VERIFICATION / CHALLENGE)
    # Khi mới mốc Webhook, Lark sẽ bắn chữ "challenge" để thử xem Server có đang sống hay không
    if "challenge" in data and data.get("type") == "url_verification":
        # Xác minh Token tránh Hacker gọi giả mạo
        if data.get("token") != LARK_VERIFICATION_TOKEN:
            return jsonify({"error": "Invalid Token"}), 403
            
        print("✅ Đã vượt ải xác minh Lark Challenge thành công!")
        return jsonify({"challenge": data["challenge"]})
        
    # 2. XỬ LÝ SỰ KIỆN TIN NHẮN (MESSAGE RECEIVED)
    header = data.get("header", {})
    event = data.get("event", {})
    
    # Chỉ xử lý khi có tin nhắn mới gửi cho tới Agent
    if header.get("event_type") == "im.message.receive_v1":
        message_id = event["message"]["message_id"]
        # Phân giải chữ mà User đã gõ
        try:
            content = json.loads(event["message"]["content"])
            user_text = content.get("text", "")
            print(f"📩 Nhận tin nhắn từ Group: {user_text}")
            
            # Gửi cho AI phân tích
            bot_reply = generate_ai_response(user_text)
            
            # Rep lại trên Lark
            send_lark_reply(message_id, bot_reply)
            
        except Exception as e:
            print("Lỗi đọc tin nhắn", e)
            
    # Luôn phải trả về 200 để bấu với Lark rằng "Tôi đã xử lý xong"
    return jsonify({"status": "ok"}), 200

if __name__ == '__main__':
    print("🚀 THE Agent Server đang chạy...")
    app.run(port=5000, debug=False)
