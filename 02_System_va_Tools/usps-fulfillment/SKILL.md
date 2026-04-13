---
name: usps-fulfillment
description: Hỗ trợ, bảo trì và tự động hóa hệ thống quản lý Fulfillment USPS dựa trên Google Apps Script (xử lý PDF, OCR, Barcode, Shortlink).
---

# usps-fulfillment

Skill này cung cấp cho THE-Agent năng lực **hiểu, bảo trì và nâng cấp** toàn bộ quy trình Fulfillment nội bộ đang chạy trên Google Sheets & Google Drive.

## Khi nào dùng skill này

Tự động kích hoạt khi user đề cập đến:
- `USPS`, `Fulfillment`, `Barcode`, `Short link`
- Sửa lỗi, thêm tính năng cho App Script quản lý đơn.
- Gặp lỗi không tạo được PDF A7, lỗi OCR, lỗi link Drive.
- @usps-fulfillment

## Kiến trúc hệ thống hiện tại

Google Apps Script (GAS) đang đảm nhận 3 module chính:
1. **Link & Barcode Engine**: 
   - Đầu vào: Sheet `USPS`.
   - Xử lý: Tìm file PDF trong Drive, khớp tên (Exact) hoặc dùng thuật toán OCR.
   - Đầu ra: Tạo Short Link (qua API `is.gd`) và tạo mã Barcode hình ảnh Code128 (qua API `metafloor`).
2. **PDF Exporter Engine**: 
   - Đầu vào: Các dòng được chọn/tick trên sheet USPS.
   - Tính toán: Dựng template HTML size A7 (74x105mm).
   - Đầu ra: Convert HTML to PDF và lưu vào folder export riêng trên Drive.
3. **Trigger & UI**: 
   - `onOpen` tạo custom menu `THE Tools`.
   - `onEdit` auto fill công thức Barcode Text tự động.

## Nguyên tắc hành xử của Agent (Agent Rules)

Do hệ thống hiện tại chạy bằng Google Apps Script, Agent **KHÔNG CHẠY TRỰC TIẾP lệnh trên Terminal**. Thay vào đó, Agent đóng vai trò là **Code Maintainer & Tech Support**:

1. **Khi user báo lỗi (VD: Barcode không hiện)**
   - Kiểm tra xem API của `is.gd` hoặc `metafloor` có đang tèo không.
   - Hướng dẫn user xem tab `LOG` trên Sheet để biết nguyên nhân.

2. **Khi user muốn update tính năng vào code**
   - Đọc kỹ source code tại `scripts/gas-code.gs`.
   - Phân tích luồng (đặc biệt lưu ý các hàm util dùng chung như `findColumn`, `getRichTextUrl`).
   - Cung cấp đoạn code thay thế và hướng dẫn user copy/paste vào Apps Script Editor.

3. **Khi user muốn di chuyển hệ thống rời khỏi Google Sheet**
   - Sử dụng kiến trúc hiện tại để viết lại thành Python/NodeJS (ví dụ: dùng `google-api-python-client`, `pytesseract` cho OCR).

## Files đính kèm
- `scripts/gas-code.gs`: Source code hoàn chỉnh của hệ thống đang chạy.
