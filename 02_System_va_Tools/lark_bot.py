import requests
import json
import os
import argparse
from datetime import datetime

# URL Webhook lấy từ người dùng
WEBHOOK_URL = "https://open.larksuite.com/open-apis/bot/v2/hook/84184d00-17db-4bb3-b770-7b197b8b8837"

def send_text_message(text):
    """Gửi tin nhắn văn bản thuần túy"""
    headers = {"Content-Type": "application/json"}
    payload = {
        "msg_type": "text",
        "content": {"text": text}
    }
    response = requests.post(WEBHOOK_URL, headers=headers, data=json.dumps(payload))
    return response.json()

def send_interactive_card(title, markdown_content, button_text="Xác nhận", card_color="blue"):
    """Gửi thẻ tương tác (Interactive Message Card). Header color: blue, red, green, orange, etc."""
    headers = {"Content-Type": "application/json"}
    payload = {
        "msg_type": "interactive",
        "card": {
            "header": {
                "title": {
                    "tag": "plain_text",
                    "content": title
                },
                "template": card_color
            },
            "elements": [
                {
                    "tag": "markdown",
                    "content": markdown_content
                },
                {
                    "tag": "hr"
                },
                {
                    "tag": "action",
                    "actions": [
                        {
                            "tag": "button",
                            "text": {
                                "tag": "plain_text",
                                "content": button_text
                            },
                            "type": "primary"
                        }
                    ]
                }
            ]
        }
    }
    response = requests.post(WEBHOOK_URL, headers=headers, data=json.dumps(payload))
    return response.json()

def broadcast_knowledge(md_file_path):
    """Đọc một phần kiến thức từ file để gửi dạng Tips of the day"""
    if not os.path.exists(md_file_path):
        print(f"File {md_file_path} không tồn tại!")
        return

    with open(md_file_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Ở đây giả lập trích xuất một đoạn quan trọng (ví dụ: Quy trình Refund)
    # Tìm đoạn chữ: "Quy trình Thẩm Định" đến đoạn tiếp theo
    start_keyword = "### 2. Quy trình Thẩm Định"
    end_keyword = "### 3. Quy"
    
    start_idx = content.find(start_keyword)
    end_idx = content.find(end_keyword)
    
    if start_idx != -1 and end_idx != -1:
        extracted_text = content[start_idx:end_idx].strip()
    else:
        # Fallback snippet
        extracted_text = "**THE-Agent Reminder**: " + content[:200] + "..."

    # Trình bày vào Markdown của Lark
    lark_markdown = f"🔔 **TIPS VẬN HÀNH TRONG NGÀY:**\n\n{extracted_text}\n\n*📌 Trích xuất tự động từ Hệ thống THE Agent Knowledge Base*"
    
    print("Đang gửi kiến thức lên Lark...")
    res = send_interactive_card(
        title="🤖 THÔNG BÁO TỪ THE AGENT",
        markdown_content=lark_markdown,
        button_text="Đã đọc & Nắm rõ",
        card_color="blue"
    )
    print("Kết quả:", res)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="THE Agent - Lark Webhook Bot")
    parser.add_argument("--broadcast", action="store_true", help="Phát sóng kiến thức vận hành tự động")
    parser.add_argument("--msg", type=str, help="Gửi một tin nhắn test thuần túy")
    
    args = parser.parse_args()

    # Đường dẫn trỏ ra ngoài gốc tới file Tổng hợp
    root_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    knowledge_file = os.path.join(root_path, "Tong_Hop_Kien_Thuc_THE.md")

    if args.broadcast:
        broadcast_knowledge(knowledge_file)
    elif args.msg:
        res = send_text_message(args.msg)
        print("Kết quả gửi tin nhắn Text:", res)
    else:
        # Chạy mặc định nếu báo test
        res = send_interactive_card(
            title="🤖 THE AGENT ĐÃ ĐƯỢC KẾT NỐI",
            markdown_content="Xin chào THE Squad! Tôi là **THE-Agent**.\n\nHệ thống BOT thông báo và Cổng API của tôi đã được kích hoạt thành công trên nhóm Chat này.\n\nSau này, tôi sẽ thay mặt Quản lý để *nhắc việc, update luật hải quan và đẩy các báo cáo tự động* vào đây.",
            button_text="Chào mừng The Agent 🎉",
            card_color="wathet"
        )
        print("Đã gửi tin nhắn cấu hình gốc. Return:", res)
