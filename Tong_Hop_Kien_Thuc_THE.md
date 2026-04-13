# TỔNG HỢP KIẾN THỨC VÀ QUY TRÌNH HỆ THỐNG THE HUMAN EXPRESS
*Tài liệu đúc kết và chuẩn hóa dựa trên kho dữ liệu dự phòng.*

---

## PHẦN 1: TỔNG QUAN THE-AGENT VÀ SKILLSET
**THE-Agent** hoạt động với định danh là Chuyên viên Hệ thống AI vận hành của The Human Express (Giải pháp vận chuyển All-in-one).
Mục tiêu: Quản lý thông tin dịch vụ, chuẩn hóa quy trình (SOP), gỡ rối CS, tự động hóa USPS Fulfillment và phân tích lỗi hệ thống.

**Các Skill nội bộ của Agent:**
- **`cs-copilot` (Customer Service Assistant):** Gỡ rối, tra cứu luật để giải quyết tranh chấp với khách hàng. Phân tích rõ THE sai hay Khách sai. Khuyến nghị và tạo Customer Draft chuyên nghiệp xoa dịu khách hàng.
- **`usps-fulfillment`:** Tự động hóa hệ thống quản lý Fulfillment USPS trên Google Sheet, xử lý và tạo mã Barcode, Shortlink. Cung cấp chức năng tạo file PDF A7 đi đơn.

## PHẦN 2: CHÍNH SÁCH VÀ QUY TRÌNH VẬN HÀNH (SOP)

### 1. Luật Vận chuyển Quốc Tế (FBA / FBM)
- **Khai báo thuế quan (Value):**
  - Khối EU (Đức, Pháp...): Bắt buộc có mã IOSS (hoặc VAT), set value = `30 USD`.
  - Canada: Set value = `14 USD` để tránh phạt thuế.
  - UK: Không có VAT set value `19 USD`, có VAT set `30 USD`.
  - US/Nhật/Singapore/Úc: Set value `30 USD`, không cần IOSS.
- **Hàng hóa Hư hỏng/Thất lạc:** 
  - Thất lạc: đền bù theo giá gốc (Cost).
  - Hải quan thu giữ (gửi hàng Fake): THE **khoanh vùng miễn trừ**, không đền bù. THE chỉ hỗ trợ thương lượng. 

### 2. Quy trình Thẩm Định Cổng Tài Chính (Refund / Claim)
Nhân sự / CS **không bao giờ lệnh bồi thường (Refund) mà chưa được thẩm định**. 
Khi gửi yêu cầu bồi thường, cần trả lời 5 câu hỏi trọng tâm: Lý do lõi? Tính từ ngày nào? Đối tác giải thích sao? Đã thỏa SLA chưa? Có nỗ lực xin khách chờ thêm không? (Pending Financial Approval).
**Trường hợp vỡ hàng:** Bắt buộc thu thập 4 loại ảnh trong thời gian quy định (6 mặt thùng, label UPS/FedEx, xốp lót, hàng vỡ). Thiếu = Hãng hủy khiếu nại (Reject).

### 3. Quy trình Xử lý Hàng Gỗ và Hàng Quá Khổ (Oversize)
- **Đóng gói:** Các kiện nặng trên 25kg / Hàng Gỗ bắt buộc lót xốp chống sốc ở các góc. Không lót mút = THE từ chối miễn trừ trách nhiệm 100%. Phạt cồng kềnh với hàng trên 26kg, 29kg.
- **Chứng từ (TSCA & Lacey Act):** Lên form và khai báo hải quan gỗ ngay trước khi cất cánh.

## PHẦN 3: ĐÁNH GIÁ NHÂN SỰ VÀ KHUNG NĂNG LỰC (KNL)
**Tỷ trọng Đánh giá:** Hành vi thái độ (30%) + Hiệu quả công việc / OKR (70%).
**5 Năng lực Lõi (Core KNL):**
1. **Ownership:** Chịu trách nhiệm đến outcome cuối cùng, không đổ lỗi, tập trung tìm giải pháp.
2. **AI-First & Automation:** Áp dụng AI thực thi công việc hằng ngày (Prompting), thiết kế quy trình Auto-QC (Người soát lỗi + Duyệt).
3. **Customer-centric:** Mọi quyết định lấy giá trị và trải nghiệm của Khách hàng làm trung tâm. Trade-off ưu tiên cho trải nghiệm cuối.
4. **Learning Agility:** Tự soi lỗi bản thân, khả năng Kaizen (làm mới và cải thiện từng quy trình nhỏ hằng ngày), học nhanh để ứng phó vấn đề mới.
5. **Cross-functional Collaboration:** Biết cách giao tiếp và đồng bộ thông tin trên nền tảng (Async), làm việc liên nhóm linh hoạt. Năng lực làm rõ trách nhiệm để không bị đùn đẩy công việc.

*Bộ KNL kỹ năng Sales:* Đòi hỏi hiểu biết giải pháp logistic (Solution Selling), phối hợp các bộ phận Kho+CS, am hiểu thủ hải quan/rủi ro hàng cấm (Compliance Awareness) để tối ưu lợi nhuận (Profit-margin).

## PHẦN 4: HỆ THỐNG DỮ LIỆU & BÁO CÁO (REPORTING)
Toàn bộ sổ sách và tracking của THE chia ra các nhánh chính: Báo cáo Trong hệ thống và Ngoài hệ thống qua các hãng.
- **Quản lý Cước (HPW, YUN, HEAD, NDE):** Kiểm soát theo tháng (T11 -> T3). Ghi nhận các khoản Gross Weight (Cân thực), Volume Weight (Cân quy đổi), Phụ phí IPF, Surge Demand và Lệch cân từ hãng về.
- **Quản trị P&L (Lỗ/Lãi):** Phân tích được Doanh thu/ Giá Vốn/ Lợi nhuận gộp, phân bổ Overhead và Quỹ Trích trước/ Công đoàn y tế nhân sự theo tháng.

## PHẦN 5: GHI CHÚ KỸ THUẬT - VẤN ĐỀ OOM (Kỹ sư THE)
Phân tích Crash OOM (Out-of-memory) lúc chạy Tiện Ích Agent:
- Lỗi CRASH không xuất phát từ bộ nhớ Heap Memory của Agent (Extension Process luôn ở mức an toàn ~128MB).
- Việc sập đến từ quá trình nhồi Request render liên tục qua CDP (Chrome DevTool Protocol) của các tab F12 trên Browser, thuộc về **Renderer Process**, không phải Node.js Host process. Hệ thống đã tối ưu bằng Script Caching và Timer ngủ tự động nên đang hoạt động mượt mà. Đề xuất team ngừng debug Extension và xem lại việc quản lý RAM của Client/Electron browser.

---
Văn bản quy chuẩn hóa ngày `13-04-2026`.
