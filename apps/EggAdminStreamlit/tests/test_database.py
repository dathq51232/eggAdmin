import tempfile
import unittest
from pathlib import Path

from database import (
    add_inventory_movement,
    delete_receipt,
    init_db,
    inventory_summary,
    line_total,
    list_receipts,
    save_receipt,
)


class EggAdminDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test.db"
        init_db(self.db_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def receipt(self):
        return {
            "receipt_date": "2026-08-27",
            "receipt_time": "08:30",
            "receipt_type": "NHẬP CHĂN NUÔI",
            "area": "KHU C",
            "stock_bucket": "RAW",
            "round_no": 1,
            "lot_number": "C-001",
            "legal_entity": "TAFA VIỆT",
        }

    def test_one_tree_is_300_eggs(self):
        self.assertEqual(
            line_total(
                {
                    "trees": 2,
                    "loose_eggs": 5,
                    "machine_eggs": 10,
                    "a5_eggs": 3,
                    "dirty_eggs": 2,
                }
            ),
            620,
        )

    def test_save_and_update_receipt_rebuilds_inventory(self):
        receipt_id, receipt_no = save_receipt(
            self.receipt(),
            [{"egg_type": "BTP", "trees": 1, "loose_eggs": 10}],
            self.db_path,
        )
        self.assertTrue(receipt_no.startswith("NC-20260827-C-"))
        self.assertEqual(list_receipts(db_path=self.db_path)[0]["total_eggs"], 310)
        self.assertEqual(inventory_summary(self.db_path)[0]["quantity"], 310)

        save_receipt(
            self.receipt(),
            [{"egg_type": "BTP", "trees": 2}],
            self.db_path,
            receipt_id=receipt_id,
        )
        self.assertEqual(list_receipts(db_path=self.db_path)[0]["total_eggs"], 600)
        self.assertEqual(inventory_summary(self.db_path)[0]["quantity"], 600)

    def test_delete_receipt_removes_inventory_entry(self):
        receipt_id, _ = save_receipt(
            self.receipt(),
            [{"egg_type": "BTP", "trees": 1}],
            self.db_path,
        )
        delete_receipt(receipt_id, self.db_path)
        self.assertEqual(list_receipts(db_path=self.db_path), [])
        self.assertEqual(inventory_summary(self.db_path), [])

    def test_cannot_issue_more_than_stock(self):
        save_receipt(
            self.receipt(),
            [{"egg_type": "BTP", "loose_eggs": 100}],
            self.db_path,
        )
        with self.assertRaisesRegex(ValueError, "Không đủ tồn kho"):
            add_inventory_movement(
                {
                    "transaction_date": "2026-08-27",
                    "txn_type": "XUẤT",
                    "bucket": "RAW",
                    "egg_type": "BTP",
                    "quantity": 101,
                },
                self.db_path,
            )

    def test_receipt_sequence_is_not_reused_after_delete(self):
        first_id, first_no = save_receipt(
            self.receipt(), [{"egg_type": "BTP", "loose_eggs": 1}], self.db_path
        )
        _, second_no = save_receipt(
            self.receipt(), [{"egg_type": "BTP", "loose_eggs": 1}], self.db_path
        )
        delete_receipt(first_id, self.db_path)
        _, third_no = save_receipt(
            self.receipt(), [{"egg_type": "BTP", "loose_eggs": 1}], self.db_path
        )
        self.assertTrue(first_no.endswith("-001"))
        self.assertTrue(second_no.endswith("-002"))
        self.assertTrue(third_no.endswith("-003"))


if __name__ == "__main__":
    unittest.main()
