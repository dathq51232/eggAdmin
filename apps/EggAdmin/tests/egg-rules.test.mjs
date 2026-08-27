import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateLineTotal,
  canTransition,
  signedInventoryQuantity,
} from "../src/lib/egg-rules.js";

test("một cây bằng 300 trứng và cộng đủ trứng lẻ/BTP", () => {
  assert.equal(
    calculateLineTotal({ trees: 2, looseEggs: 5, machineEggs: 10, a5Eggs: 3, dirtyEggs: 2 }),
    620,
  );
});

test("không chấp nhận số âm hoặc số lẻ", () => {
  assert.throws(() => calculateLineTotal({ trees: -1 }));
  assert.throws(() => calculateLineTotal({ looseEggs: 1.5 }));
});

test("xuất kho và bể làm giảm tồn", () => {
  assert.equal(signedInventoryQuantity("ISSUE", 20), -20);
  assert.equal(signedInventoryQuantity("BREAKAGE", 4), -4);
  assert.equal(signedInventoryQuantity("RECEIPT", 20), 20);
});

test("phân quyền duyệt theo đúng bước", () => {
  assert.equal(canTransition("PENDING_QC", "VERIFY", "QC"), true);
  assert.equal(canTransition("PENDING_QC", "APPROVE", "WAREHOUSE"), false);
  assert.equal(canTransition("PENDING_WAREHOUSE", "APPROVE", "WAREHOUSE"), true);
  assert.equal(canTransition("CONFIRMED", "REJECT", "ADMIN"), false);
});
