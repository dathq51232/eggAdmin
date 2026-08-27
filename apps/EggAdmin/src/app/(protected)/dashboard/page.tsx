import Link from "next/link";
import { ReceiptStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dateFormat, numberFormat, receiptStatusLabels } from "@/lib/format";
import { requireUser } from "@/lib/auth-guard";

function monthStartUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export default async function DashboardPage() {
  await requireUser();
  const start = monthStartUtc();
  const [receipts, statusGroups, inventoryGroups, eggTypes, latestReceipt] = await Promise.all([
    prisma.receipt.findMany({
      where: { receiptDate: { gte: start }, status: ReceiptStatus.CONFIRMED },
      select: { area: true, lines: { select: { totalEggs: true } } },
    }),
    prisma.receipt.groupBy({
      by: ["status"],
      where: { receiptDate: { gte: start } },
      _count: { _all: true },
    }),
    prisma.inventoryTransaction.groupBy({
      by: ["eggTypeId", "bucket"],
      _sum: { quantity: true },
    }),
    prisma.eggType.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.receipt.findFirst({ orderBy: [{ receiptDate: "desc" }, { createdAt: "desc" }] }),
  ]);

  const totalEggs = receipts.reduce((sum, receipt) => sum + receipt.lines.reduce((s, line) => s + line.totalEggs, 0), 0);
  const statusCount = Object.fromEntries(statusGroups.map((item) => [item.status, item._count._all]));
  const stockTotal = inventoryGroups.reduce((sum, item) => sum + (item._sum.quantity ?? 0), 0);
  const byArea = new Map<string, number>();
  for (const receipt of receipts) {
    byArea.set(receipt.area, (byArea.get(receipt.area) ?? 0) + receipt.lines.reduce((sum, line) => sum + line.totalEggs, 0));
  }
  const maxArea = Math.max(1, ...byArea.values());
  const eggTypeMap = new Map(eggTypes.map((item) => [item.id, item.name]));
  const stockRows = inventoryGroups
    .filter((item) => (item._sum.quantity ?? 0) !== 0)
    .sort((a, b) => (b._sum.quantity ?? 0) - (a._sum.quantity ?? 0))
    .slice(0, 8);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Tổng quan nhà máy</h1>
          <p>Số liệu tháng hiện tại, chỉ tính phiếu đã được thủ kho xác nhận.</p>
        </div>
        <div className="page-actions"><Link className="btn" href="/receipts">+ Tạo phiếu nhập</Link></div>
      </header>

      <section className="grid kpi-grid">
        <article className="card accent">
          <div className="kpi-label">Trứng nhập trong tháng</div>
          <div className="kpi-value">{numberFormat.format(totalEggs)}</div>
          <div className="kpi-note">{numberFormat.format(receipts.length)} phiếu đã xác nhận</div>
        </article>
        <article className="card accent gold">
          <div className="kpi-label">Phiếu đang chờ</div>
          <div className="kpi-value">{(statusCount.PENDING_QC ?? 0) + (statusCount.PENDING_WAREHOUSE ?? 0)}</div>
          <div className="kpi-note">QC: {statusCount.PENDING_QC ?? 0} · Kho: {statusCount.PENDING_WAREHOUSE ?? 0}</div>
        </article>
        <article className="card accent blue">
          <div className="kpi-label">Tồn trứng hiện tại</div>
          <div className="kpi-value">{numberFormat.format(stockTotal)}</div>
          <div className="kpi-note">Nguyên liệu và thành phẩm</div>
        </article>
        <article className="card accent red">
          <div className="kpi-label">Dữ liệu mới nhất</div>
          <div className="kpi-value" style={{ fontSize: 24 }}>{latestReceipt ? dateFormat.format(latestReceipt.receiptDate) : "—"}</div>
          <div className="kpi-note">{latestReceipt?.receiptNo ?? "Chưa có phiếu"}</div>
        </article>
      </section>

      <section className="grid two-col" style={{ marginTop: 16 }}>
        <article className="card">
          <h2>Sản lượng đã xác nhận theo khu</h2>
          {byArea.size === 0 ? <div className="empty">Chưa có dữ liệu trong tháng.</div> : [...byArea.entries()].map(([area, total]) => (
            <div className="bar-row" key={area}>
              <strong>Khu {area}</strong>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(3, total / maxArea * 100)}%` }} /></div>
              <span className="number">{numberFormat.format(total)}</span>
            </div>
          ))}
        </article>
        <article className="card">
          <h2>Tồn nổi bật</h2>
          {stockRows.length === 0 ? <div className="empty">Chưa có phát sinh kho.</div> : stockRows.map((row) => (
            <div className="bar-row" key={`${row.eggTypeId}-${row.bucket}`} style={{ gridTemplateColumns: "1fr 80px 100px" }}>
              <span>{eggTypeMap.get(row.eggTypeId)}</span>
              <span className="muted">{row.bucket === "RAW" ? "Nguyên liệu" : "Thành phẩm"}</span>
              <strong className="number">{numberFormat.format(row._sum.quantity ?? 0)}</strong>
            </div>
          ))}
        </article>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Trạng thái phiếu tháng này</h2>
        <div className="page-actions">
          {Object.values(ReceiptStatus).map((status) => (
            <span key={status} className={`badge badge-${status}`}>{receiptStatusLabels[status]}: {statusCount[status] ?? 0}</span>
          ))}
        </div>
      </section>
    </>
  );
}
