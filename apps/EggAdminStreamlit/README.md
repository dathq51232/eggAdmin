# Egg Admin Streamlit — chạy local không Docker

Đây là bản Egg Admin dành cho một người dùng trên máy Windows:

- Giao diện: Streamlit.
- Dữ liệu: SQLite tại `data/egg_admin.db`.
- Không cần Next.js, Docker Desktop hoặc PostgreSQL.
- Chạy bằng một cú nhấp qua `run.bat`.

## Chạy trên Windows

1. Cài [Python 3.10+](https://www.python.org/downloads/windows/). Trong màn hình cài đặt,
   đánh dấu **Add Python to PATH**.
2. Nhấp đúp `run.bat`.
3. Lần đầu chương trình tự tạo `.venv`, cài thư viện và mở
   `http://localhost:8501`.

Những lần sau chỉ cần nhấp đúp `run.bat`. Không xóa thư mục `data` nếu muốn giữ dữ liệu.

## Chức năng V1

- Dashboard KPI theo khoảng ngày.
- Phiếu **Nhập chăn nuôi / Nhập TFP / Yêu cầu nhập kho**.
- Khu nhập mới: C, E, F, TFP, Trứng rửa và hai cửa hàng; Khu A chỉ xem lịch sử.
- Quy đổi 1 cây = 300 trứng; hỗ trợ BTP, SO, 14.5–24, 2A, 2B, L3,
  Móp, Móp Đỏ, Đôi, Bể và các quy cách TFP.
- Sửa/xóa phiếu có sao lưu trước thao tác.
- Xuất nhập tồn trứng và chặn xuất vượt tồn.
- Tồn vật tư bao bì.
- Báo cáo theo khu, khu + lần nhập, loại trứng và xuất Excel.
- Lưu ảnh/PDF phiếu gốc trong `data/source_images`.

## Sao lưu

Sao chép toàn bộ thư mục `data` sang OneDrive/SharePoint định kỳ. Các bản sao trước
khi sửa hoặc xóa phiếu nằm trong `data/backups`.

## Chạy thủ công

```powershell
cd apps\EggAdminStreamlit
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
streamlit run app.py
```

## Kiểm thử

```powershell
python -m unittest discover -s tests -v
```
