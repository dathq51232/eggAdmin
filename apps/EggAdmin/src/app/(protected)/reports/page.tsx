import Link from "next/link";
import { ReceiptStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dateFormat, numberFormat, receiptTypeLabels, vietnamToday } from "@/lib/format";
import { requireUser } from "@/lib/auth-guard";

function normalizeRange(start?: string, end?: string) {
  const defaultEnd = vietnamToday();
  const monthStart = `${defaultEnd.slice(0, 8)}01`;
  const valid = /^\d{4}-\d{2}-\d{2}$/;
  return { start: valid.test(start ?? "") ? start! : monthStart, end: valid.test(end ?? "") ? end! : defaultEnd };
}

export default async function ReportsPage({ searchParams }: { searchParams?: { start?: string; end?: string } }) {
  await requireUser();
  const range = normalizeRange(searchParams?.start, searchParams?.end);
  const from = new Date(`${range.start}T00:00:00.000Z`);
  const to = new Date(`${range.end}T00:00:00.000Z`);
  to.setUTCDate(to.getUTCDate() + 1);
  const receipts = await prisma.receipt.findMany({
    where: { status: ReceiptStatus.CONFIRMED, receiptDate: { gte: from, lt: to } },
    include: { lines: { include: { eggType: true }, orderBy: { eggType: { sortOrder: "asc" } } } },
    orderBy: [{ receiptDate: "asc" }, { receiptNo: "asc" }],
  });
  const totalEggs = receipts.reduce((sum, receipt) => sum + receipt.lines.reduce((s, line) => s + line.totalEggs, 0), 0);
  const byArea = new Map<string, number>();
  const byEggType = new Map<string, number>();
  for (const receipt of receipts) {
    const receiptTotal = receipt.lines.reduce((sum, line) => sum + line.totalEggs, 0);
    byArea.set(receipt.area, (byArea.get(receipt.area) ?? 0) + receiptTotal);
    for (const line of receipt.lines) byEggType.set(line.eggType.name, (byEggType.get(line.eggType.name) ?? 0) + line.totalEggs);
  }

  return <>
    <header className="page-head"><div><h1>Báo cáo nhập trứng</h1><p>Chỉ tổng hợp các phiếu đã xác nhận cuối cùng.</p></div>
      <div className="page-actions"><Link className="btn secondary" href={`/reports/export?start=${range.start}&end=${range.end}`}>Tải CSV</Link></div>
    </header>
    <section className="card" style={{ marginBottom: 18 }}>
      <form method="get" className="form-grid">
        <div className="field"><label>Từ ngày</label><input name="start" type="date" defaultValue={range.start} /></div>
        <div className="field"><label>Đến ngày</label><input name="end" type="date" defaultValue={range.end} /></div>
        <div className="field" style={{ alignSelf: "end" }}><button className="btn" type="submit">Xem báo cáo</button></div>
      </form>
    </section>
    <section className="grid kpi-grid" style={{ marginBottom: 18 }}>
      <article className="card accent"><div className="kpi-label">Tổng số trứng</div><div className="kpi-value">{numberFormat.format(totalEggs)}</div></article>
      <article className="card accent gold"><div className="kpi-label">Phiếu xác nhận</div><div className="kpi-value">{numberFormat.format(receipts.length)}</div></article>
      <article className="card accent blue"><div className="kpi-label">Khu có dữ liệu</div><div className="kpi-value">{byArea.size}</div></article>
      <article className="card accent red"><div className="kpi-label">Loại trứng phát sinh</div><div className="kpi-value">{byEggType.size}</div></article>
    </section>
    <section className="grid two-col" style={{ marginBottom: 18 }}>
      <article className="card"><h2>Theo khu</h2>{[...byArea.entries()].sort().map(([area, total]) => <div className="bar-row" key={area}><strong>Khu {area}</strong><span /> <strong className="number">{numberFormat.format(total)}</strong></div>)}</article>
      <article className="card"><h2>Theo loại trứng</h2>{[...byEggType.entries()].sort((a, b) => b[1] - a[1]).map(([name, total]) => <div className="bar-row" key={name} style={{ gridTemplateColumns: "1fr 0 110px" }}><span>{name}</span><span /><strong className="number">{numberFormat.format(total)}</strong></div>)}</article>
    </section>
    <section className="card"><h2>Chi tiết phiếu</h2><div className="table-wrap"><table>
      <thead><tr><th>Ngày</th><th>Số phiếu</th><th>Loại</th><th>Khu</th><th>Lô</th><th>Chi tiết</th><th className="number">Tổng</th></tr></thead>
      <tbody>{receipts.length === 0 ? <tr><td colSpan={7} className="empty">Không có dữ liệu trong khoảng ngày.</td></tr> : receipts.map((receipt) => <tr key={receipt.id}>
        <td>{dateFormat.format(receipt.receiptDate)}</td><td className="strong">{receipt.receiptNo}</td><td>{receiptTypeLabels[receipt.type]}</td><td>{receipt.area}</td><td>{receipt.lotNumber ?? "—"}</td>
        <td>{receipt.lines.map((line) => `${line.eggType.name}: ${numberFormat.format(line.totalEggs)}`).join(" · ")}</td>
        <td className="number strong">{numberFormat.format(receipt.lines.reduce((sum, line) => sum + line.totalEggs, 0))}</td>
      </tr>)}</tbody>
    </table></div></section>
  </>;
}
