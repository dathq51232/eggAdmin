import { PackagingTxnType, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";
import { dateFormat, numberFormat, vietnamToday } from "@/lib/format";
import { createPackagingMovementAction } from "../actions";

const typeLabels = { OPENING: "Đầu kỳ", RECEIPT: "Nhập", ISSUE: "Xuất", ADJUSTMENT: "Điều chỉnh tăng" } as const;

export default async function PackagingPage({ searchParams }: { searchParams?: { created?: string } }) {
  const user = await requireUser();
  const canMove = user.role === Role.ADMIN || user.role === Role.WAREHOUSE;
  const [items, groups, movements] = await Promise.all([
    prisma.packagingItem.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.packagingTransaction.groupBy({ by: ["itemId"], _sum: { quantity: true } }),
    prisma.packagingTransaction.findMany({ include: { item: true, user: { select: { name: true } } }, orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }], take: 100 }),
  ]);
  const balances = new Map(groups.map((group) => [group.itemId, group._sum.quantity ?? 0]));
  const today = vietnamToday();

  return <>
    <header className="page-head"><div><h1>Vật tư bao bì</h1><p>Theo dõi thùng, khay, tem và túi tách khỏi tồn trứng.</p></div></header>
    {searchParams?.created && <div className="notice">Đã ghi nhận phát sinh bao bì.</div>}
    {canMove && <section className="card" style={{ marginBottom: 18 }}><h2>Nhập/xuất bao bì</h2>
      <form action={createPackagingMovementAction}><div className="form-grid">
        <div className="field"><label>Ngày</label><input name="transactionDate" type="date" defaultValue={today} required /></div>
        <div className="field"><label>Nghiệp vụ</label><select name="type" defaultValue={PackagingTxnType.RECEIPT}>
          {Object.values(PackagingTxnType).map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}
        </select></div>
        <div className="field"><label>Vật tư</label><select name="itemId">{items.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}</select></div>
        <div className="field"><label>Số lượng</label><input name="quantity" type="number" min="1" step="1" required /></div>
        <div className="field span-2"><label>Tham chiếu</label><input name="reference" maxLength={80} /></div>
        <div className="field span-2"><label>Ghi chú</label><input name="notes" maxLength={300} /></div>
      </div><div className="form-submit"><button className="btn" type="submit">Ghi sổ bao bì</button></div></form>
    </section>}
    <section className="grid kpi-grid" style={{ marginBottom: 18 }}>{items.map((item) => <article className="card" key={item.id}>
      <div className="kpi-label">{item.name}</div><div className="kpi-value">{numberFormat.format(balances.get(item.id) ?? 0)}</div><div className="kpi-note">Đơn vị: {item.unit}</div>
    </article>)}</section>
    <section className="card"><h2>100 phát sinh gần nhất</h2><div className="table-wrap"><table>
      <thead><tr><th>Ngày</th><th>Nghiệp vụ</th><th>Vật tư</th><th>Tham chiếu</th><th>Người ghi</th><th className="number">Số lượng</th></tr></thead>
      <tbody>{movements.length === 0 ? <tr><td colSpan={6} className="empty">Chưa có phát sinh.</td></tr> : movements.map((item) => <tr key={item.id}>
        <td>{dateFormat.format(item.transactionDate)}</td><td>{typeLabels[item.type]}</td><td>{item.item.name}</td><td>{item.reference ?? "—"}</td><td>{item.user.name}</td>
        <td className={`number ${item.quantity >= 0 ? "positive" : "negative"}`}>{item.quantity > 0 ? "+" : ""}{numberFormat.format(item.quantity)} {item.item.unit}</td>
      </tr>)}</tbody>
    </table></div></section>
  </>;
}
