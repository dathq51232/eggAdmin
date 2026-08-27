from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable, Iterator


APP_DIR = Path(__file__).resolve().parent
DATA_DIR = APP_DIR / "data"
DB_PATH = DATA_DIR / "egg_admin.db"
EGGS_PER_TREE = 300

PACKAGING_ITEMS = (
    ("THUNG_6", "Thùng 6 vỉ", "thùng"),
    ("THUNG_10", "Thùng 10 vỉ", "thùng"),
    ("KHAY_30", "Khay 30 trứng", "khay"),
    ("TEM_NHAN", "Tem nhãn", "cái"),
    ("TUI", "Túi đóng gói", "cái"),
)


def _db_path(db_path: str | Path | None = None) -> Path:
    return Path(db_path) if db_path else DB_PATH


@contextmanager
def connection(db_path: str | Path | None = None) -> Iterator[sqlite3.Connection]:
    path = _db_path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA busy_timeout = 30000")
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db(db_path: str | Path | None = None) -> None:
    with connection(db_path) as db:
        db.executescript(
            """
            PRAGMA journal_mode = WAL;

            CREATE TABLE IF NOT EXISTS receipts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                receipt_no TEXT NOT NULL UNIQUE,
                receipt_date TEXT NOT NULL,
                receipt_time TEXT,
                receipt_type TEXT NOT NULL,
                area TEXT NOT NULL,
                stock_bucket TEXT NOT NULL CHECK (stock_bucket IN ('RAW', 'FINISHED')),
                round_no INTEGER NOT NULL DEFAULT 1 CHECK (round_no > 0),
                lot_number TEXT,
                legal_entity TEXT,
                notes TEXT,
                source_image_path TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_receipts_date_area
                ON receipts(receipt_date, area);

            CREATE TABLE IF NOT EXISTS receipt_lines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                receipt_id INTEGER NOT NULL,
                egg_type TEXT NOT NULL,
                trees INTEGER NOT NULL DEFAULT 0 CHECK (trees >= 0),
                loose_eggs INTEGER NOT NULL DEFAULT 0 CHECK (loose_eggs >= 0),
                machine_eggs INTEGER NOT NULL DEFAULT 0 CHECK (machine_eggs >= 0),
                a5_eggs INTEGER NOT NULL DEFAULT 0 CHECK (a5_eggs >= 0),
                dirty_eggs INTEGER NOT NULL DEFAULT 0 CHECK (dirty_eggs >= 0),
                total_eggs INTEGER NOT NULL CHECK (total_eggs > 0),
                FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE,
                UNIQUE (receipt_id, egg_type)
            );

            CREATE TABLE IF NOT EXISTS inventory_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                transaction_date TEXT NOT NULL,
                txn_type TEXT NOT NULL,
                bucket TEXT NOT NULL CHECK (bucket IN ('RAW', 'FINISHED')),
                egg_type TEXT NOT NULL,
                quantity INTEGER NOT NULL CHECK (quantity <> 0),
                area TEXT,
                lot_number TEXT,
                reference TEXT,
                notes TEXT,
                receipt_id INTEGER,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_inventory_type_bucket
                ON inventory_transactions(egg_type, bucket);
            CREATE INDEX IF NOT EXISTS idx_inventory_date
                ON inventory_transactions(transaction_date);

            CREATE TABLE IF NOT EXISTS packaging_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                unit TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS packaging_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                transaction_date TEXT NOT NULL,
                txn_type TEXT NOT NULL,
                item_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL CHECK (quantity <> 0),
                reference TEXT,
                notes TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (item_id) REFERENCES packaging_items(id)
            );

            CREATE INDEX IF NOT EXISTS idx_packaging_date_item
                ON packaging_transactions(transaction_date, item_id);
            """
        )
        db.executemany(
            """
            INSERT INTO packaging_items(code, name, unit)
            VALUES (?, ?, ?)
            ON CONFLICT(code) DO UPDATE SET name = excluded.name, unit = excluded.unit, active = 1
            """,
            PACKAGING_ITEMS,
        )


def non_negative_int(value: Any) -> int:
    if value is None or value == "":
        return 0
    number = float(value)
    if number < 0 or not number.is_integer():
        raise ValueError("Số lượng phải là số nguyên không âm.")
    return int(number)


def line_total(line: dict[str, Any]) -> int:
    return (
        non_negative_int(line.get("trees")) * EGGS_PER_TREE
        + non_negative_int(line.get("loose_eggs"))
        + non_negative_int(line.get("machine_eggs"))
        + non_negative_int(line.get("a5_eggs"))
        + non_negative_int(line.get("dirty_eggs"))
    )


def _prefix(receipt_type: str) -> str:
    return {
        "NHẬP CHĂN NUÔI": "NC",
        "NHẬP TFP": "TFP",
        "YÊU CẦU NHẬP KHO": "YCNK",
    }.get(receipt_type, "PN")


def _area_code(area: str) -> str:
    if area.startswith("KHU "):
        return area.removeprefix("KHU ").replace(" ", "")
    replacements = {
        "TRỨNG RỬA": "TR",
        "CỬA HÀNG TAFA": "CHTAFA",
        "CỬA HÀNG SUNFARM": "CHSUN",
    }
    return replacements.get(area, area.replace(" ", ""))


def generate_receipt_no(
    db: sqlite3.Connection,
    receipt_date: str,
    receipt_type: str,
    area: str,
) -> str:
    row = db.execute(
        """
        SELECT COALESCE(MAX(CAST(substr(receipt_no, -3) AS INTEGER)), 0) AS max_sequence
        FROM receipts
        WHERE receipt_date = ? AND receipt_type = ? AND area = ?
        """,
        (receipt_date, receipt_type, area),
    ).fetchone()
    sequence = int(row["max_sequence"]) + 1
    date_part = receipt_date.replace("-", "")
    return f"{_prefix(receipt_type)}-{date_part}-{_area_code(area)}-{sequence:03d}"


def save_receipt(
    receipt: dict[str, Any],
    lines: Iterable[dict[str, Any]],
    db_path: str | Path | None = None,
    receipt_id: int | None = None,
) -> tuple[int, str]:
    normalized_lines: list[dict[str, Any]] = []
    for raw_line in lines:
        egg_type = str(raw_line.get("egg_type", "")).strip()
        if not egg_type:
            continue
        normalized = {
            "egg_type": egg_type,
            "trees": non_negative_int(raw_line.get("trees")),
            "loose_eggs": non_negative_int(raw_line.get("loose_eggs")),
            "machine_eggs": non_negative_int(raw_line.get("machine_eggs")),
            "a5_eggs": non_negative_int(raw_line.get("a5_eggs")),
            "dirty_eggs": non_negative_int(raw_line.get("dirty_eggs")),
        }
        normalized["total_eggs"] = line_total(normalized)
        if normalized["total_eggs"] > 0:
            normalized_lines.append(normalized)

    if not normalized_lines:
        raise ValueError("Phiếu phải có ít nhất một loại trứng có số lượng.")

    receipt_date = str(receipt["receipt_date"])
    stock_bucket = str(receipt.get("stock_bucket", "RAW"))
    if stock_bucket not in {"RAW", "FINISHED"}:
        raise ValueError("Nhóm tồn không hợp lệ.")

    with connection(db_path) as db:
        if receipt_id is None:
            receipt_no = generate_receipt_no(
                db, receipt_date, str(receipt["receipt_type"]), str(receipt["area"])
            )
            cursor = db.execute(
                """
                INSERT INTO receipts(
                    receipt_no, receipt_date, receipt_time, receipt_type, area,
                    stock_bucket, round_no, lot_number, legal_entity, notes, source_image_path
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    receipt_no,
                    receipt_date,
                    receipt.get("receipt_time"),
                    receipt["receipt_type"],
                    receipt["area"],
                    stock_bucket,
                    non_negative_int(receipt.get("round_no", 1)) or 1,
                    receipt.get("lot_number"),
                    receipt.get("legal_entity"),
                    receipt.get("notes"),
                    receipt.get("source_image_path"),
                ),
            )
            receipt_id = int(cursor.lastrowid)
        else:
            existing = db.execute(
                "SELECT receipt_no, source_image_path FROM receipts WHERE id = ?", (receipt_id,)
            ).fetchone()
            if not existing:
                raise ValueError("Không tìm thấy phiếu cần sửa.")
            receipt_no = str(existing["receipt_no"])
            source_image_path = receipt.get("source_image_path") or existing["source_image_path"]
            db.execute(
                """
                UPDATE receipts SET
                    receipt_date = ?, receipt_time = ?, receipt_type = ?, area = ?,
                    stock_bucket = ?, round_no = ?, lot_number = ?, legal_entity = ?,
                    notes = ?, source_image_path = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (
                    receipt_date,
                    receipt.get("receipt_time"),
                    receipt["receipt_type"],
                    receipt["area"],
                    stock_bucket,
                    non_negative_int(receipt.get("round_no", 1)) or 1,
                    receipt.get("lot_number"),
                    receipt.get("legal_entity"),
                    receipt.get("notes"),
                    source_image_path,
                    receipt_id,
                ),
            )
            db.execute("DELETE FROM inventory_transactions WHERE receipt_id = ?", (receipt_id,))
            db.execute("DELETE FROM receipt_lines WHERE receipt_id = ?", (receipt_id,))

        for line in normalized_lines:
            db.execute(
                """
                INSERT INTO receipt_lines(
                    receipt_id, egg_type, trees, loose_eggs, machine_eggs,
                    a5_eggs, dirty_eggs, total_eggs
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    receipt_id,
                    line["egg_type"],
                    line["trees"],
                    line["loose_eggs"],
                    line["machine_eggs"],
                    line["a5_eggs"],
                    line["dirty_eggs"],
                    line["total_eggs"],
                ),
            )
            db.execute(
                """
                INSERT INTO inventory_transactions(
                    transaction_date, txn_type, bucket, egg_type, quantity,
                    area, lot_number, reference, notes, receipt_id
                ) VALUES (?, 'NHẬP', ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    receipt_date,
                    stock_bucket,
                    line["egg_type"],
                    line["total_eggs"],
                    receipt["area"],
                    receipt.get("lot_number"),
                    receipt_no,
                    "Tự động từ phiếu nhập",
                    receipt_id,
                ),
            )
        return receipt_id, receipt_no


def delete_receipt(receipt_id: int, db_path: str | Path | None = None) -> None:
    with connection(db_path) as db:
        cursor = db.execute("DELETE FROM receipts WHERE id = ?", (receipt_id,))
        if cursor.rowcount != 1:
            raise ValueError("Không tìm thấy phiếu cần xóa.")


def get_receipt(receipt_id: int, db_path: str | Path | None = None) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    with connection(db_path) as db:
        receipt = db.execute("SELECT * FROM receipts WHERE id = ?", (receipt_id,)).fetchone()
        if not receipt:
            raise ValueError("Không tìm thấy phiếu.")
        lines = db.execute(
            "SELECT * FROM receipt_lines WHERE receipt_id = ? ORDER BY id", (receipt_id,)
        ).fetchall()
        return dict(receipt), [dict(row) for row in lines]


def fetch_all(query: str, params: Iterable[Any] = (), db_path: str | Path | None = None) -> list[dict[str, Any]]:
    with connection(db_path) as db:
        return [dict(row) for row in db.execute(query, tuple(params)).fetchall()]


def list_receipts(
    start_date: str | None = None,
    end_date: str | None = None,
    area: str | None = None,
    db_path: str | Path | None = None,
) -> list[dict[str, Any]]:
    conditions: list[str] = []
    params: list[Any] = []
    if start_date:
        conditions.append("r.receipt_date >= ?")
        params.append(start_date)
    if end_date:
        conditions.append("r.receipt_date <= ?")
        params.append(end_date)
    if area:
        conditions.append("r.area = ?")
        params.append(area)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    return fetch_all(
        f"""
        SELECT r.*, COALESCE(SUM(l.total_eggs), 0) AS total_eggs
        FROM receipts r
        LEFT JOIN receipt_lines l ON l.receipt_id = r.id
        {where}
        GROUP BY r.id
        ORDER BY r.receipt_date DESC, r.created_at DESC
        """,
        params,
        db_path,
    )


def receipt_line_report(
    start_date: str,
    end_date: str,
    db_path: str | Path | None = None,
) -> list[dict[str, Any]]:
    return fetch_all(
        """
        SELECT
            r.id, r.receipt_no, r.receipt_date, r.receipt_time, r.receipt_type,
            r.area, r.round_no, r.lot_number, r.legal_entity, r.stock_bucket,
            l.egg_type, l.trees, l.loose_eggs, l.machine_eggs,
            l.a5_eggs, l.dirty_eggs, l.total_eggs
        FROM receipts r
        JOIN receipt_lines l ON l.receipt_id = r.id
        WHERE r.receipt_date BETWEEN ? AND ?
        ORDER BY r.receipt_date, r.area, r.receipt_no, l.id
        """,
        (start_date, end_date),
        db_path,
    )


def inventory_balance(
    egg_type: str,
    bucket: str,
    db: sqlite3.Connection,
) -> int:
    row = db.execute(
        """
        SELECT COALESCE(SUM(quantity), 0) AS balance
        FROM inventory_transactions
        WHERE egg_type = ? AND bucket = ?
        """,
        (egg_type, bucket),
    ).fetchone()
    return int(row["balance"])


def add_inventory_movement(
    movement: dict[str, Any],
    db_path: str | Path | None = None,
) -> None:
    txn_type = str(movement["txn_type"])
    if txn_type == "NHẬP":
        raise ValueError("Nhập trứng phải thực hiện từ màn hình Nhập phiếu.")
    amount = non_negative_int(movement["quantity"])
    if amount <= 0:
        raise ValueError("Số lượng phải lớn hơn 0.")
    quantity = -amount if txn_type in {"XUẤT", "BỂ/LOẠI BỎ"} else amount
    with connection(db_path) as db:
        current = inventory_balance(str(movement["egg_type"]), str(movement["bucket"]), db)
        if quantity < 0 and current + quantity < 0:
            raise ValueError(f"Không đủ tồn kho. Tồn hiện tại: {current:,} trứng.")
        db.execute(
            """
            INSERT INTO inventory_transactions(
                transaction_date, txn_type, bucket, egg_type, quantity,
                area, lot_number, reference, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                movement["transaction_date"],
                txn_type,
                movement["bucket"],
                movement["egg_type"],
                quantity,
                movement.get("area"),
                movement.get("lot_number"),
                movement.get("reference"),
                movement.get("notes"),
            ),
        )


def inventory_summary(db_path: str | Path | None = None) -> list[dict[str, Any]]:
    return fetch_all(
        """
        SELECT egg_type, bucket, SUM(quantity) AS quantity
        FROM inventory_transactions
        GROUP BY egg_type, bucket
        ORDER BY egg_type, bucket
        """,
        db_path=db_path,
    )


def inventory_ledger(limit: int = 200, db_path: str | Path | None = None) -> list[dict[str, Any]]:
    return fetch_all(
        """
        SELECT * FROM inventory_transactions
        ORDER BY transaction_date DESC, id DESC
        LIMIT ?
        """,
        (limit,),
        db_path,
    )


def packaging_items(db_path: str | Path | None = None) -> list[dict[str, Any]]:
    return fetch_all(
        "SELECT * FROM packaging_items WHERE active = 1 ORDER BY name",
        db_path=db_path,
    )


def add_packaging_movement(
    movement: dict[str, Any],
    db_path: str | Path | None = None,
) -> None:
    amount = non_negative_int(movement["quantity"])
    if amount <= 0:
        raise ValueError("Số lượng phải lớn hơn 0.")
    quantity = -amount if movement["txn_type"] == "XUẤT" else amount
    with connection(db_path) as db:
        row = db.execute(
            "SELECT COALESCE(SUM(quantity), 0) AS balance FROM packaging_transactions WHERE item_id = ?",
            (movement["item_id"],),
        ).fetchone()
        current = int(row["balance"])
        if quantity < 0 and current + quantity < 0:
            raise ValueError(f"Không đủ tồn bao bì. Tồn hiện tại: {current:,}.")
        db.execute(
            """
            INSERT INTO packaging_transactions(
                transaction_date, txn_type, item_id, quantity, reference, notes
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                movement["transaction_date"],
                movement["txn_type"],
                movement["item_id"],
                quantity,
                movement.get("reference"),
                movement.get("notes"),
            ),
        )


def packaging_summary(db_path: str | Path | None = None) -> list[dict[str, Any]]:
    return fetch_all(
        """
        SELECT i.id, i.code, i.name, i.unit, COALESCE(SUM(t.quantity), 0) AS quantity
        FROM packaging_items i
        LEFT JOIN packaging_transactions t ON t.item_id = i.id
        WHERE i.active = 1
        GROUP BY i.id
        ORDER BY i.name
        """,
        db_path=db_path,
    )


def packaging_ledger(limit: int = 200, db_path: str | Path | None = None) -> list[dict[str, Any]]:
    return fetch_all(
        """
        SELECT t.*, i.name AS item_name, i.unit
        FROM packaging_transactions t
        JOIN packaging_items i ON i.id = t.item_id
        ORDER BY t.transaction_date DESC, t.id DESC
        LIMIT ?
        """,
        (limit,),
        db_path,
    )


def backup_database(destination: str | Path, db_path: str | Path | None = None) -> Path:
    destination_path = Path(destination)
    destination_path.parent.mkdir(parents=True, exist_ok=True)
    with connection(db_path) as source:
        target = sqlite3.connect(destination_path)
        try:
            source.backup(target)
        finally:
            target.close()
    return destination_path
