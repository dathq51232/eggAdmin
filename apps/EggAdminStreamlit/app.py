from __future__ import annotations

from datetime import date, datetime, time
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import pandas as pd
import streamlit as st

from database import (
    APP_DIR,
    DATA_DIR,
    DB_PATH,
    add_inventory_movement,
    add_packaging_movement,
    backup_database,
    delete_receipt,
    get_receipt,
    init_db,
    inventory_ledger,
    inventory_summary,
    line_total,
    list_receipts,
    packaging_items,
    packaging_ledger,
    packaging_summary,
    receipt_line_report,
    save_receipt,
)


st.set_page_config(
    page_title="Egg Admin · Streamlit",
    page_icon="🥚",
    layout="wide",
    initial_sidebar_state="expanded",
)

AREAS_INPUT = [
    "KHU C",
    "KHU E",
    "KHU F",
    "KHU TFP",
    "TRỨNG RỬA",
    "CỬA HÀNG TAFA",
    "CỬA HÀNG SUNFARM",
]
AREAS_REPORT = ["KHU A", *AREAS_INPUT]
LEGAL_ENTITIES = ["TAFA VIỆT", "SUNFARM"]
RECEIPT_TYPES = ["NHẬP CHĂN NUÔI", "NHẬP TFP", "YÊU CẦU NHẬP KHO"]

FRESH_EGG_TYPES = [
    "SO", "14.5", "16", "17", "18", "19", "20", "21", "22", "23", "24",
    "Đôi", "2A", "2B", "L3", "Móp", "Móp Đỏ",
]
FARM_EGG_TYPES = ["BTP", *FRESH_EGG_TYPES, "Bể"]
TFP_EGG_TYPES = [
    *FRESH_EGG_TYPES,
    "700 giấy", "600 giấy", "360 giấy", "700 nhựa", "600 nhựa", "360 nhựa",
    "Pro", "Plus", "6 Plus", "Nướng 10", "Nướng 6",
    "Bịch tím", "Bịch đỏ", "Bịch NMT", "Bịch chăn nuôi", "Bịch quá hạn", "Bể",
]
EGG_TYPES_BY_RECEIPT = {
    "NHẬP CHĂN NUÔI": FARM_EGG_TYPES,
    "NHẬP TFP": TFP_EGG_TYPES,
    "YÊU CẦU NHẬP KHO": FRESH_EGG_TYPES,
}
ALL_EGG_TYPES = list(dict.fromkeys([*FARM_EGG_TYPES, *TFP_EGG_TYPES]))

MENU = ["Tổng quan", "Nhập phiếu", "Xuất nhập tồn", "Bao bì", "Dữ liệu", "Báo cáo"]


def inject_css() -> None:
    st.markdown(
        """
        <style>
        :root { --egg-green:#176b3a; --egg-soft:#eef8f0; --egg-gold:#d59a20; }
        .stApp { background: #f5f7f3; }
        [data-testid="stSidebar"] { background: #10351f; }
        [data-testid="stSidebar"] * { color: #f4fff6; }
        [data-testid="stSidebar"] .stRadio label { padding: .35rem .25rem; }
        [data-testid="stMetric"] {
            background: white; border: 1px solid #dce6dd; border-radius: 14px;
            padding: 1rem 1.1rem; box-shadow: 0 8px 25px rgba(31,55,37,.05);
        }
        [data-testid="stMetricValue"] { color: #176b3a; }
        .block-container { padding-top: 1.6rem; padding-bottom: 3rem; }
        div[data-testid="stDataFrame"] { border: 1px solid #dce6dd; border-radius: 12px; }
        .egg-header {
            background: linear-gradient(115deg,#123d24,#1c7540); color: white;
            padding: 1.25rem 1.4rem; border-radius: 16px; margin-bottom: 1rem;
        }
        .egg-header h1 { margin: 0; font-size: 1.9rem; }
        .egg-header p { margin: .35rem 0 0; color: #cde8d3; }
        .small-note { color:#617067; font-size:.85rem; }
        </style>
        """,
        unsafe_allow_html=True,
    )


def page_header(title: str, subtitle: str) -> None:
    st.markdown(
        f'<div class="egg-header"><h1>{title}</h1><p>{subtitle}</p></div>',
        unsafe_allow_html=True,
    )


def iso(value: date) -> str:
    return value.isoformat()


def number(value: int | float) -> str:
    return f"{int(value):,}".replace(",", ".")


def save_source_file(uploaded_file) -> str | None:
    if uploaded_file is None:
        return None
    suffix = Path(uploaded_file.name).suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".pdf"}:
        raise ValueError("Chỉ nhận ảnh JPG/PNG hoặc PDF.")
    folder = DATA_DIR / "source_images"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"{datetime.now():%Y%m%d_%H%M%S}_{uuid4().hex[:8]}{suffix}"
    target.write_bytes(uploaded_file.getvalue())
    return str(target)


def editor_frame(egg_types: list[str], existing: list[dict] | None = None) -> pd.DataFrame:
    existing_map = {row["egg_type"]: row for row in (existing or [])}
    rows = []
    for egg_type in egg_types:
        row = existing_map.get(egg_type, {})
        rows.append(
            {
                "Loại trứng": egg_type,
                "Số cây": int(row.get("trees", 0)),
                "Trứng lẻ": int(row.get("loose_eggs", 0)),
                "Máy (BTP)": int(row.get("machine_eggs", 0)),
                "A5 (BTP)": int(row.get("a5_eggs", 0)),
                "Dơ (BTP)": int(row.get("dirty_eggs", 0)),
            }
        )
    return pd.DataFrame(rows)


EDITOR_CONFIG = {
    "Loại trứng": st.column_config.TextColumn(disabled=True),
    "Số cây": st.column_config.NumberColumn(min_value=0, step=1, format="%d"),
    "Trứng lẻ": st.column_config.NumberColumn(min_value=0, step=1, format="%d"),
    "Máy (BTP)": st.column_config.NumberColumn(min_value=0, step=1, format="%d"),
    "A5 (BTP)": st.column_config.NumberColumn(min_value=0, step=1, format="%d"),
    "Dơ (BTP)": st.column_config.NumberColumn(min_value=0, step=1, format="%d"),
}


def editor_to_lines(frame: pd.DataFrame) -> list[dict]:
    lines = []
    for row in frame.to_dict("records"):
        line = {
            "egg_type": row["Loại trứng"],
            "trees": row["Số cây"],
            "loose_eggs": row["Trứng lẻ"],
            "machine_eggs": row["Máy (BTP)"],
            "a5_eggs": row["A5 (BTP)"],
            "dirty_eggs": row["Dơ (BTP)"],
        }
        if line_total(line) > 0:
            lines.append(line)
    return lines


def create_excel_report(detail: pd.DataFrame, summary_area: pd.DataFrame, summary_type: pd.DataFrame) -> bytes:
    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        detail.to_excel(writer, index=False, sheet_name="CHI TIẾT")
        summary_area.to_excel(writer, sheet_name="THEO KHU")
        summary_type.to_excel(writer, sheet_name="THEO LOẠI")
        for worksheet in writer.book.worksheets:
            worksheet.freeze_panes = "A2"
            worksheet.auto_filter.ref = worksheet.dimensions
            for column in worksheet.columns:
                width = min(max(len(str(cell.value or "")) for cell in column) + 2, 35)
                worksheet.column_dimensions[column[0].column_letter].width = width
    return output.getvalue()


def dashboard_page() -> None:
    page_header("Tổng quan nhà máy", "Theo dõi nhanh sản lượng nhập và tồn kho trên một màn hình.")
    today = date.today()
    start = today.replace(day=1)
    c1, c2 = st.columns(2)
    with c1:
        start_date = st.date_input("Từ ngày", start, key="dashboard_start")
    with c2:
        end_date = st.date_input("Đến ngày", today, key="dashboard_end")

    receipts = list_receipts(iso(start_date), iso(end_date))
    detail = receipt_line_report(iso(start_date), iso(end_date))
    total_eggs = sum(int(item["total_eggs"]) for item in receipts)
    areas = len({item["area"] for item in receipts})
    latest = max((item["receipt_date"] for item in receipts), default="—")
    stock = sum(int(item["quantity"] or 0) for item in inventory_summary())

    k1, k2, k3, k4 = st.columns(4)
    k1.metric("Tổng trứng nhập", number(total_eggs))
    k2.metric("Số phiếu", number(len(receipts)))
    k3.metric("Số khu phát sinh", number(areas))
    k4.metric("Tồn trứng hiện tại", number(stock), help=f"Dữ liệu mới nhất: {latest}")

    if not detail:
        st.info("Chưa có dữ liệu trong khoảng ngày đã chọn. Hãy tạo phiếu ở mục Nhập phiếu.")
        return

    frame = pd.DataFrame(detail)
    left, right = st.columns(2)
    with left:
        st.subheader("Sản lượng theo khu")
        area_chart = frame.groupby("area", as_index=True)["total_eggs"].sum().sort_values(ascending=False)
        st.bar_chart(area_chart, color="#24864a")
    with right:
        st.subheader("Sản lượng theo loại trứng")
        type_chart = frame.groupby("egg_type", as_index=True)["total_eggs"].sum().sort_values(ascending=False).head(12)
        st.bar_chart(type_chart, color="#d39a22")

    st.subheader("Phiếu gần nhất")
    recent = pd.DataFrame(receipts[:10])[
        ["receipt_no", "receipt_date", "receipt_type", "area", "round_no", "lot_number", "total_eggs"]
    ].rename(
        columns={
            "receipt_no": "Số phiếu", "receipt_date": "Ngày", "receipt_type": "Loại phiếu",
            "area": "Khu", "round_no": "Lần", "lot_number": "Lô", "total_eggs": "Tổng trứng",
        }
    )
    st.dataframe(recent, width="stretch", hide_index=True)


def receipt_entry_page() -> None:
    page_header("Nhập phiếu", "Nhập theo khu và lần giao; hệ thống tự quy đổi 1 cây = 300 trứng.")

    receipt_type = st.selectbox("Chọn loại phiếu", RECEIPT_TYPES, key="new_receipt_type")
    available_types = EGG_TYPES_BY_RECEIPT[receipt_type]
    default_type = "BTP" if receipt_type == "NHẬP CHĂN NUÔI" else "SO"
    selected_types = st.multiselect(
        "Loại trứng cần nhập",
        available_types,
        default=[default_type],
        key=f"selected_{receipt_type}",
        help="Chỉ chọn những loại có phát sinh để form luôn gọn.",
    )
    if not selected_types:
        st.warning("Hãy chọn ít nhất một loại trứng.")
        return

    with st.form("new_receipt_form", clear_on_submit=False):
        c1, c2, c3, c4 = st.columns(4)
        receipt_date = c1.date_input("Ngày phiếu", date.today())
        receipt_time = c2.time_input("Giờ bàn giao", datetime.now().time().replace(second=0, microsecond=0))
        area = c3.selectbox("Khu", AREAS_INPUT)
        round_no = c4.number_input("Lần nhập", min_value=1, max_value=20, value=1, step=1)

        c5, c6, c7 = st.columns(3)
        legal_entity = c5.selectbox("Pháp nhân", LEGAL_ENTITIES)
        stock_bucket_label = c6.selectbox("Nhóm tồn", ["Nguyên liệu", "Thành phẩm"])
        lot_number = c7.text_input("Số lô", placeholder="VD: C-2708-01")

        notes = st.text_input("Ghi chú")
        source_file = st.file_uploader("Ảnh hoặc PDF phiếu gốc (không bắt buộc)", type=["jpg", "jpeg", "png", "pdf"])
        st.caption("Nhập số nguyên không âm. Các cột Máy/A5/Dơ chủ yếu dùng cho BTP.")
        edited = st.data_editor(
            editor_frame(selected_types),
            column_config=EDITOR_CONFIG,
            hide_index=True,
            width="stretch",
            num_rows="fixed",
            key=f"entry_editor_{receipt_type}",
        )
        submitted = st.form_submit_button("💾 Lưu phiếu", type="primary", width="stretch")

    if submitted:
        try:
            lines = editor_to_lines(edited)
            source_path = save_source_file(source_file)
            _, receipt_no = save_receipt(
                {
                    "receipt_date": iso(receipt_date),
                    "receipt_time": receipt_time.strftime("%H:%M"),
                    "receipt_type": receipt_type,
                    "area": area,
                    "stock_bucket": "RAW" if stock_bucket_label == "Nguyên liệu" else "FINISHED",
                    "round_no": int(round_no),
                    "lot_number": lot_number.strip() or None,
                    "legal_entity": legal_entity,
                    "notes": notes.strip() or None,
                    "source_image_path": source_path,
                },
                lines,
            )
            total = sum(line_total(line) for line in lines)
            st.success(f"Đã lưu {receipt_no} — tổng {number(total)} trứng và cập nhật tồn kho.")
        except Exception as exc:
            st.error(str(exc))


def inventory_page() -> None:
    page_header("Xuất nhập tồn", "Phiếu nhập tự động ghi tăng; xuất, bể và điều chỉnh được lưu thành từng phát sinh.")
    summary = inventory_summary()
    if summary:
        frame = pd.DataFrame(summary)
        pivot = frame.pivot_table(index="egg_type", columns="bucket", values="quantity", aggfunc="sum", fill_value=0)
        for column in ["RAW", "FINISHED"]:
            if column not in pivot.columns:
                pivot[column] = 0
        pivot = pivot[["RAW", "FINISHED"]]
        pivot["TỔNG"] = pivot["RAW"] + pivot["FINISHED"]
        pivot = pivot.rename(columns={"RAW": "Nguyên liệu", "FINISHED": "Thành phẩm"})
        st.subheader("Tồn hiện tại")
        st.dataframe(pivot, width="stretch")
    else:
        st.info("Chưa có tồn kho. Hãy nhập phiếu hoặc ghi tồn đầu kỳ.")

    with st.expander("➕ Ghi phát sinh kho", expanded=not bool(summary)):
        with st.form("inventory_movement"):
            c1, c2, c3, c4 = st.columns(4)
            transaction_date = c1.date_input("Ngày", date.today(), key="inv_date")
            txn_type = c2.selectbox("Nghiệp vụ", ["XUẤT", "BỂ/LOẠI BỎ", "ĐIỀU CHỈNH TĂNG", "TỒN ĐẦU KỲ"])
            bucket_label = c3.selectbox("Nhóm tồn", ["Nguyên liệu", "Thành phẩm"], key="inv_bucket")
            egg_type = c4.selectbox("Loại trứng", ALL_EGG_TYPES)
            c5, c6, c7 = st.columns(3)
            quantity = c5.number_input("Số lượng", min_value=1, step=1)
            area = c6.selectbox("Khu", ["—", *AREAS_REPORT])
            lot_number = c7.text_input("Số lô")
            reference = st.text_input("Số lệnh/biên bản tham chiếu")
            notes = st.text_input("Ghi chú", key="inv_notes")
            submit = st.form_submit_button("Ghi sổ kho", type="primary")
        if submit:
            try:
                add_inventory_movement(
                    {
                        "transaction_date": iso(transaction_date), "txn_type": txn_type,
                        "bucket": "RAW" if bucket_label == "Nguyên liệu" else "FINISHED",
                        "egg_type": egg_type, "quantity": int(quantity),
                        "area": None if area == "—" else area, "lot_number": lot_number.strip() or None,
                        "reference": reference.strip() or None, "notes": notes.strip() or None,
                    }
                )
                st.success("Đã ghi phát sinh kho.")
                st.rerun()
            except Exception as exc:
                st.error(str(exc))

    st.subheader("200 phát sinh gần nhất")
    ledger = inventory_ledger()
    if ledger:
        ledger_frame = pd.DataFrame(ledger)[
            ["transaction_date", "txn_type", "bucket", "egg_type", "quantity", "area", "lot_number", "reference"]
        ].rename(
            columns={
                "transaction_date": "Ngày", "txn_type": "Nghiệp vụ", "bucket": "Nhóm tồn",
                "egg_type": "Loại trứng", "quantity": "Số lượng", "area": "Khu",
                "lot_number": "Lô", "reference": "Tham chiếu",
            }
        )
        st.dataframe(ledger_frame, width="stretch", hide_index=True)


def packaging_page() -> None:
    page_header("Vật tư bao bì", "Theo dõi thùng, khay, tem và túi riêng với tồn trứng.")
    summary = packaging_summary()
    metric_columns = st.columns(min(5, max(1, len(summary))))
    for index, item in enumerate(summary):
        metric_columns[index % len(metric_columns)].metric(item["name"], f'{number(item["quantity"])} {item["unit"]}')

    items = packaging_items()
    item_map = {f'{item["name"]} ({item["unit"]})': item for item in items}
    with st.expander("➕ Nhập/xuất bao bì", expanded=not any(item["quantity"] for item in summary)):
        with st.form("packaging_movement"):
            c1, c2, c3, c4 = st.columns(4)
            transaction_date = c1.date_input("Ngày", date.today(), key="pack_date")
            txn_type = c2.selectbox("Nghiệp vụ", ["NHẬP", "XUẤT", "TỒN ĐẦU KỲ", "ĐIỀU CHỈNH TĂNG"])
            selected_item = c3.selectbox("Vật tư", list(item_map))
            quantity = c4.number_input("Số lượng", min_value=1, step=1, key="pack_qty")
            reference = st.text_input("Tham chiếu", key="pack_ref")
            notes = st.text_input("Ghi chú", key="pack_notes")
            submit = st.form_submit_button("Ghi sổ bao bì", type="primary")
        if submit:
            try:
                add_packaging_movement(
                    {
                        "transaction_date": iso(transaction_date), "txn_type": txn_type,
                        "item_id": item_map[selected_item]["id"], "quantity": int(quantity),
                        "reference": reference.strip() or None, "notes": notes.strip() or None,
                    }
                )
                st.success("Đã ghi phát sinh bao bì.")
                st.rerun()
            except Exception as exc:
                st.error(str(exc))

    st.subheader("200 phát sinh gần nhất")
    ledger = packaging_ledger()
    if ledger:
        frame = pd.DataFrame(ledger)[
            ["transaction_date", "txn_type", "item_name", "quantity", "unit", "reference", "notes"]
        ].rename(
            columns={
                "transaction_date": "Ngày", "txn_type": "Nghiệp vụ", "item_name": "Vật tư",
                "quantity": "Số lượng", "unit": "Đơn vị", "reference": "Tham chiếu", "notes": "Ghi chú",
            }
        )
        st.dataframe(frame, width="stretch", hide_index=True)


def data_page() -> None:
    page_header("Dữ liệu phiếu", "Tìm, xem, sửa hoặc xóa phiếu; Khu A lịch sử chỉ được xem.")
    today = date.today()
    c1, c2, c3 = st.columns(3)
    start_date = c1.date_input("Từ ngày", today.replace(day=1), key="data_start")
    end_date = c2.date_input("Đến ngày", today, key="data_end")
    area_filter = c3.selectbox("Khu", ["Tất cả", *AREAS_REPORT], key="data_area")
    receipts = list_receipts(
        iso(start_date), iso(end_date), None if area_filter == "Tất cả" else area_filter
    )
    if not receipts:
        st.info("Không có phiếu phù hợp.")
        return

    display = pd.DataFrame(receipts)[
        ["id", "receipt_no", "receipt_date", "receipt_time", "receipt_type", "area", "round_no", "lot_number", "total_eggs"]
    ].rename(
        columns={
            "id": "ID", "receipt_no": "Số phiếu", "receipt_date": "Ngày", "receipt_time": "Giờ",
            "receipt_type": "Loại phiếu", "area": "Khu", "round_no": "Lần", "lot_number": "Lô",
            "total_eggs": "Tổng trứng",
        }
    )
    st.dataframe(display, width="stretch", hide_index=True)
    st.download_button(
        "Tải danh sách CSV", display.to_csv(index=False).encode("utf-8-sig"),
        file_name=f"danh_sach_phieu_{start_date}_{end_date}.csv", mime="text/csv",
    )

    receipt_map = {f'{item["receipt_no"]} · {item["area"]} · {number(item["total_eggs"])} trứng': item["id"] for item in receipts}
    selected_label = st.selectbox("Chọn phiếu để xem chi tiết", list(receipt_map))
    selected_id = int(receipt_map[selected_label])
    receipt, lines = get_receipt(selected_id)

    st.subheader(receipt["receipt_no"])
    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Ngày", receipt["receipt_date"])
    m2.metric("Khu / lần", f'{receipt["area"]} / {receipt["round_no"]}')
    m3.metric("Số lô", receipt["lot_number"] or "—")
    m4.metric("Tổng trứng", number(sum(line["total_eggs"] for line in lines)))
    detail = pd.DataFrame(lines)[
        ["egg_type", "trees", "loose_eggs", "machine_eggs", "a5_eggs", "dirty_eggs", "total_eggs"]
    ].rename(
        columns={
            "egg_type": "Loại", "trees": "Cây", "loose_eggs": "Lẻ", "machine_eggs": "Máy",
            "a5_eggs": "A5", "dirty_eggs": "Dơ", "total_eggs": "Tổng",
        }
    )
    st.dataframe(detail, width="stretch", hide_index=True)

    source_path = receipt.get("source_image_path")
    if source_path and Path(source_path).exists():
        if Path(source_path).suffix.lower() == ".pdf":
            st.caption(f"PDF phiếu gốc: {source_path}")
        else:
            st.image(source_path, caption="Phiếu gốc", width=520)

    if receipt["area"] == "KHU A":
        st.warning("Phiếu Khu A là dữ liệu lịch sử, chỉ được xem và báo cáo.")
        return

    with st.expander("✏️ Sửa phiếu"):
        egg_types = EGG_TYPES_BY_RECEIPT.get(receipt["receipt_type"], ALL_EGG_TYPES)
        with st.form(f"edit_receipt_{selected_id}"):
            c1, c2, c3, c4 = st.columns(4)
            edited_date = c1.date_input("Ngày", date.fromisoformat(receipt["receipt_date"]), key=f"edit_date_{selected_id}")
            current_time = time.fromisoformat(receipt["receipt_time"] or "00:00")
            edited_time = c2.time_input("Giờ", current_time, key=f"edit_time_{selected_id}")
            edited_area = c3.selectbox("Khu", AREAS_INPUT, index=AREAS_INPUT.index(receipt["area"]), key=f"edit_area_{selected_id}")
            edited_round = c4.number_input("Lần", min_value=1, max_value=20, value=int(receipt["round_no"]), key=f"edit_round_{selected_id}")
            c5, c6, c7 = st.columns(3)
            legal_index = LEGAL_ENTITIES.index(receipt["legal_entity"]) if receipt["legal_entity"] in LEGAL_ENTITIES else 0
            edited_legal = c5.selectbox("Pháp nhân", LEGAL_ENTITIES, index=legal_index, key=f"edit_legal_{selected_id}")
            edited_bucket = c6.selectbox("Nhóm tồn", ["RAW", "FINISHED"], index=0 if receipt["stock_bucket"] == "RAW" else 1, key=f"edit_bucket_{selected_id}")
            edited_lot = c7.text_input("Số lô", receipt["lot_number"] or "", key=f"edit_lot_{selected_id}")
            edited_notes = st.text_input("Ghi chú", receipt["notes"] or "", key=f"edit_notes_{selected_id}")
            edited_lines = st.data_editor(
                editor_frame(egg_types, lines), column_config=EDITOR_CONFIG, hide_index=True,
                width="stretch", num_rows="fixed", key=f"edit_lines_{selected_id}",
            )
            update = st.form_submit_button("Lưu thay đổi", type="primary")
        if update:
            try:
                backup_database(DATA_DIR / "backups" / f'before_edit_{datetime.now():%Y%m%d_%H%M%S}.db')
                save_receipt(
                    {
                        "receipt_date": iso(edited_date), "receipt_time": edited_time.strftime("%H:%M"),
                        "receipt_type": receipt["receipt_type"], "area": edited_area,
                        "stock_bucket": edited_bucket, "round_no": int(edited_round),
                        "lot_number": edited_lot.strip() or None, "legal_entity": edited_legal,
                        "notes": edited_notes.strip() or None, "source_image_path": receipt.get("source_image_path"),
                    },
                    editor_to_lines(edited_lines), receipt_id=selected_id,
                )
                st.success("Đã sửa phiếu và tính lại tồn kho.")
                st.rerun()
            except Exception as exc:
                st.error(str(exc))

    with st.expander("🗑️ Xóa phiếu"):
        confirm = st.checkbox(f'Tôi xác nhận xóa {receipt["receipt_no"]}', key=f"delete_confirm_{selected_id}")
        if st.button("Xóa phiếu", type="secondary", disabled=not confirm, key=f"delete_button_{selected_id}"):
            try:
                backup_database(DATA_DIR / "backups" / f'before_delete_{datetime.now():%Y%m%d_%H%M%S}.db')
                delete_receipt(selected_id)
                st.success("Đã xóa phiếu và phát sinh tồn liên quan. Bản sao lưu đã được tạo.")
                st.rerun()
            except Exception as exc:
                st.error(str(exc))


def report_page() -> None:
    page_header("Báo cáo", "Tổng hợp nhanh theo khu, loại trứng và lần nhập; xuất Excel gửi quản lý.")
    today = date.today()
    c1, c2 = st.columns(2)
    start_date = c1.date_input("Từ ngày", today.replace(day=1), key="report_start")
    end_date = c2.date_input("Đến ngày", today, key="report_end")
    if start_date > end_date:
        st.error("Từ ngày không được lớn hơn đến ngày.")
        return
    rows = receipt_line_report(iso(start_date), iso(end_date))
    if not rows:
        st.info("Không có dữ liệu trong khoảng ngày.")
        return

    frame = pd.DataFrame(rows)
    total_eggs = int(frame["total_eggs"].sum())
    k1, k2, k3, k4 = st.columns(4)
    k1.metric("Tổng trứng", number(total_eggs))
    k2.metric("Số phiếu", frame["receipt_no"].nunique())
    k3.metric("Số khu", frame["area"].nunique())
    k4.metric("Số loại", frame["egg_type"].nunique())

    summary_area = pd.pivot_table(
        frame, index="egg_type", columns="area", values="total_eggs", aggfunc="sum", fill_value=0,
    )
    summary_area["TỔNG"] = summary_area.sum(axis=1)
    summary_type = pd.pivot_table(
        frame, index=["area", "round_no"], columns="egg_type", values="total_eggs", aggfunc="sum", fill_value=0,
    )
    summary_type["TỔNG"] = summary_type.sum(axis=1)

    tab1, tab2, tab3 = st.tabs(["Theo khu", "Khu + lần nhập", "Chi tiết phiếu"])
    with tab1:
        st.dataframe(summary_area, width="stretch")
    with tab2:
        st.dataframe(summary_type, width="stretch")
    with tab3:
        detail_display = frame.rename(
            columns={
                "receipt_no": "Số phiếu", "receipt_date": "Ngày", "receipt_time": "Giờ",
                "receipt_type": "Loại phiếu", "area": "Khu", "round_no": "Lần", "lot_number": "Lô",
                "egg_type": "Loại trứng", "trees": "Cây", "loose_eggs": "Lẻ", "total_eggs": "Tổng trứng",
            }
        )
        st.dataframe(detail_display, width="stretch", hide_index=True)

    excel_data = create_excel_report(frame, summary_area, summary_type)
    st.download_button(
        "📥 Xuất báo cáo Excel",
        excel_data,
        file_name=f"Egg_Admin_{start_date}_{end_date}.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        type="primary",
    )


def main() -> None:
    init_db()
    inject_css()
    st.sidebar.markdown("## 🥚 Egg Admin")
    st.sidebar.caption("MRP tinh gọn · Streamlit local")
    page = st.sidebar.radio("Điều hướng", MENU, label_visibility="collapsed")
    st.sidebar.markdown("---")
    st.sidebar.caption(f"Dữ liệu: {DB_PATH}")
    st.sidebar.caption("1 cây = 300 trứng")

    pages = {
        "Tổng quan": dashboard_page,
        "Nhập phiếu": receipt_entry_page,
        "Xuất nhập tồn": inventory_page,
        "Bao bì": packaging_page,
        "Dữ liệu": data_page,
        "Báo cáo": report_page,
    }
    pages[page]()


if __name__ == "__main__":
    main()
