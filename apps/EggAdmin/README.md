# Egg Admin — lõi MRP rút gọn

Ứng dụng độc lập nằm trong Viet ERP, dành cho vận hành nhà máy trứng. Bản V1 tập trung vào năm việc:

1. Nhập phiếu **Nhập chăn nuôi / Nhập TFP / Yêu cầu nhập kho**.
2. QC xác minh, sau đó thủ kho xác nhận.
3. Tự động cập nhật tồn trứng nguyên liệu hoặc thành phẩm khi phiếu được xác nhận.
4. Ghi xuất kho, trứng bể/loại bỏ, tồn đầu kỳ và vật tư bao bì.
5. Dashboard và báo cáo CSV theo ngày, khu, loại trứng.

## Quy tắc nghiệp vụ chính

- Khu chuẩn: A, C, E, F, TFP (có thêm NMT cho luồng nội bộ).
- 1 cây = 300 trứng.
- Phiếu đã xác nhận không sửa hoặc xóa; mọi phát sinh kho là sổ nối tiếp để truy vết.
- Người lập và người duyệt được lấy từ phiên đăng nhập, không lấy từ dữ liệu gửi lên.
- Không cho phép xuất trứng hoặc bao bì vượt tồn hiện tại.
- Ảnh/PDF phiếu gốc có thể gắn bằng URL để chuẩn bị tích hợp SharePoint sau này.

## Chạy tại máy

Yêu cầu: Node.js 20+, npm và Docker Desktop.

### Windows — chạy bằng một cú nhấp

1. Cài [Node.js 20+](https://nodejs.org/) và [Docker Desktop](https://www.docker.com/products/docker-desktop/).
2. Mở Docker Desktop và đợi trạng thái **Ready**.
3. Nhấp đúp `run.bat` trong thư mục `apps/EggAdmin`.

Lần chạy đầu, chương trình sẽ tự động:

- Tạo `.env` với mật khẩu ngẫu nhiên, không dùng mật khẩu mẫu.
- Khởi động PostgreSQL bằng Docker.
- Cài thư viện, tạo bảng dữ liệu và bốn tài khoản theo vai trò.
- Lưu tài khoản vào `local-credentials.txt` trên máy và tự mở `http://localhost:3030`.

Các lần sau chỉ cần mở Docker Desktop rồi nhấp đúp `run.bat`. Không đưa `.env` hoặc
`local-credentials.txt` lên GitHub hay gửi công khai.

### Chạy thủ công

```bash
cd apps/EggAdmin
cp .env.example .env
# Sửa mật khẩu database ở cả POSTGRES_PASSWORD và DATABASE_URL,
# sau đó sửa toàn bộ mật khẩu tài khoản mẫu và AUTH_SECRET.
docker compose up -d
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

Mở `http://localhost:3030`.

Tạo `AUTH_SECRET` an toàn bằng:

```bash
openssl rand -base64 32
```

## Phân quyền

| Vai trò | Quyền chính |
|---|---|
| ADMIN | Xem và thao tác toàn hệ thống |
| COUNTER | Lập phiếu nhập trứng |
| QC | Kiểm tra hoặc từ chối phiếu chờ QC |
| WAREHOUSE | Xác nhận phiếu, ghi xuất/bể/điều chỉnh kho và bao bì |
| VIEWER | Xem dashboard, tồn kho và báo cáo |

## Kiểm tra mã nguồn

```bash
npm test
npm run typecheck
npm run build
```

## Phạm vi chưa đưa vào V1

- Đồng bộ tự động SharePoint/OneDrive và OCR phiếu ảnh.
- Chữ ký điện tử nâng cao.
- Lập kế hoạch nhu cầu nguyên vật liệu nhiều cấp (BOM/MPS).
- Mua hàng, bán hàng, kế toán và nhân sự của ERP tổng.

Những phần này được giữ ngoài ứng dụng tinh gọn để triển khai nhà máy nhanh và giảm rủi ro nhập liệu.
