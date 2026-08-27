import { Area, InventoryTxnType, Role, StockBucket } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";
import { dateFormat, inventoryTypeLabels, numberFormat, vietnamToday } from "@/lib/format";
import { createInventoryMovementAction } from "../actions";

export default async function InventoryPage({ searchParams }: { searchParams?: { created?: string } }) {
  const user = await requireUser();
  const canMove = user.role === Role.ADMIN || user.role === Role.WAREHOUSE;
  const [eggTypes, groups, movements] = await Promise.all([
    prisma.eggType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.inventoryTransaction.groupBy({ by: ["eggTypeId", "bucket"], _sum: { quantity: true } }),
    prisma.inventoryTransaction.findMany({
      include: { eggType: true, user: { select: { name: true } } },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
  ]);
  const groupMap = new Map(groups.map((item) => [`${item.eggTypeId}_${item.bucket}`, item._sum.quantity ?? 0]));
  const today = vietnamToday();

  return (
    <>
      <header className="page-head"><div><h1>Tồn kho trứng</h1><p>Sổ kho bất biến: phiếu nhập tự động ghi tăng; xuất, bể và điều chỉnh được truy vết riêng.</p></div></header>
      {searchParams?.created && <div className="notice">Đã ghi nhận phát sinh kho.</div>}
      {canMove && <section className="card" style={{ marginBottom: 18 }}>
        <h2>Ghi phát sinh thủ công</h2>
        <form action={createInventoryMovementAction}>
          <div className="form-grid">
            <div className="field"><label>Ngày</label><input type="date" name="transactionDate" defaultValue={today} required /></div>
            <div className="field"><label>Nghiệp vụ</label><select name="type" defaultValue={InventoryTxnType.ISSUE}>
              <option value="ISSUE">Xuất kho</option><option value="BREAKAGE">Bể/loại bỏ</option>
              <option value="ADJUSTMENT">Điều chỉnh tăng</option><option value="OPENING">Tồn đầu kỳ</option>
            </select></div>
            <div className="field"><label>Nhóm tồn</label><select name="bucket" defaultValue={StockBucket.RAW}><option value="RAW">Nguyên liệu</option><option value="FINISHED">Thành phẩm</option></select></div>
            <div className="field"><label>Loại trứng</label><select name="eggTypeId">{eggTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
            <div className="field"><label>Số lượng</label><input type="number" name="quantity" min="1" step="1" required /></div>
            <div className="field"><label>Khu (nếu có)</label><select name="area"><option value="">—</option>{Object.values(Area).map((area) => <option key={area}>{area}</option>)}</select></div>
            <div className="field"><label>Số lô</label><input name="lotNumber" maxLength={80} /></div>
            <div className="field"><label>Tham chiếu</label><input name="reference" maxLength={80} placeholder="Lệnh xuất/biên bản" /></div>
            <div className="field span-all"><label>Ghi chú</label><input name="notes" maxLength={300} /></div>
          </div>
          <div className="form-submit"><span className="hint">Không cho phép xuất vượt tồn.</span><button className="btn" type="submit">Ghi sổ kho</button></div>
        </form>
      </section>}

      <section className="card" style={{ marginBottom: 18 }}>
        <h2>Tồn theo loại</h2>
        <div className="table-wrap"><table><thead><tr><th>Loại trứng</th><th className="number">Nguyên liệu</th><th className="number">Thành phẩm</th><th className="number">Tổng</th></tr></thead>
          <tbody>{eggTypes.map((item) => {
            const raw = groupMap.get(`${item.id}_RAW`) ?? 0;
            const finished = groupMap.get(`${item.id}_FINISHED`) ?? 0;
            return <tr key={item.id}><td className="strong">{item.name}</td><td className="number">{numberFormat.format(raw)}</td><td className="number">{numberFormat.format(finished)}</td><td className="number strong">{numberFormat.format(raw + finished)}</td></tr>;
          })}</tbody>
        </table></div>
      </section>

      <section className="card"><h2>100 phát sinh gần nhất</h2><div className="table-wrap"><table>
        <thead><tr><th>Ngày</th><th>Nghiệp vụ</th><th>Loại</th><th>Kho</th><th>Tham chiếu</th><th>Người ghi</th><th className="number">Số lượng</th></tr></thead>
        <tbody>{movements.length === 0 ? <tr><td colSpan={7} className="empty">Chưa có phát sinh.</td></tr> : movements.map((item) => <tr key={item.id}>
          <td>{dateFormat.format(item.transactionDate)}</td><td>{inventoryTypeLabels[item.type]}</td><td>{item.eggType.name}</td>
          <td>{item.bucket === "RAW" ? "Nguyên liệu" : "Thành phẩm"}</td><td>{item.reference ?? "—"}</td><td>{item.user.name}</td>
          <td className={`number ${item.quantity >= 0 ? "positive" : "negative"}`}>{item.quantity > 0 ? "+" : ""}{numberFormat.format(item.quantity)}</td>
        </tr>)}</tbody>
      </table></div></section>
    </>
  );
}
