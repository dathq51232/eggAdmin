import { ReceiptStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";
import { dateFormat, numberFormat, receiptStatusLabels, receiptTypeLabels } from "@/lib/format";
import { transitionReceiptAction } from "../actions";

export default async function ApprovalsPage({ searchParams }: { searchParams?: { updated?: string } }) {
  const user = await requireUser();
  const statuses: ReceiptStatus[] = user.role === Role.ADMIN
    ? [ReceiptStatus.PENDING_QC, ReceiptStatus.PENDING_WAREHOUSE]
    : user.role === Role.QC
      ? [ReceiptStatus.PENDING_QC]
      : user.role === Role.WAREHOUSE
        ? [ReceiptStatus.PENDING_WAREHOUSE]
        : [];
  const receipts = statuses.length ? await prisma.receipt.findMany({
    where: { status: { in: statuses } },
    include: {
      createdBy: { select: { name: true } },
      lines: { include: { eggType: true }, orderBy: { eggType: { sortOrder: "asc" } } },
      approvals: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
    },
    orderBy: [{ receiptDate: "asc" }, { createdAt: "asc" }],
  }) : [];

  return (
    <>
      <header className="page-head"><div><h1>Phê duyệt phiếu</h1><p>QC kiểm số liệu trước; thủ kho xác nhận mới phát sinh tồn kho.</p></div></header>
      {searchParams?.updated && <div className="notice">Đã cập nhật trạng thái phiếu.</div>}
      <section className="grid">
        {receipts.length === 0 && <div className="card empty">Không có phiếu nào đang chờ bạn xử lý.</div>}
        {receipts.map((receipt) => {
          const total = receipt.lines.reduce((sum, line) => sum + line.totalEggs, 0);
          const nextAction = receipt.status === ReceiptStatus.PENDING_QC ? "VERIFY" : "APPROVE";
          const nextLabel = receipt.status === ReceiptStatus.PENDING_QC ? "QC xác minh" : "Kho xác nhận";
          return (
            <article className="card approval-card" key={receipt.id}>
              <div className="page-head" style={{ marginBottom: 0 }}>
                <div><h2 style={{ margin: 0 }}>{receipt.receiptNo}</h2><p>{receiptTypeLabels[receipt.type]} · Khu {receipt.area}</p></div>
                <span className={`badge badge-${receipt.status}`}>{receiptStatusLabels[receipt.status]}</span>
              </div>
              <div className="approval-meta">
                <span>Ngày: <strong>{dateFormat.format(receipt.receiptDate)}</strong></span>
                <span>Lần giao: <strong>{receipt.roundNo}</strong></span>
                <span>Người nhập: <strong>{receipt.createdBy.name}</strong></span>
                <span>Tổng: <strong>{numberFormat.format(total)} trứng</strong></span>
                {receipt.lotNumber && <span>Lô: <strong>{receipt.lotNumber}</strong></span>}
              </div>
              <div className="table-wrap"><table>
                <thead><tr><th>Loại</th><th className="number">Cây</th><th className="number">Lẻ</th><th className="number">Máy/A5/Dơ</th><th className="number">Tổng</th></tr></thead>
                <tbody>{receipt.lines.map((line) => <tr key={line.id}>
                  <td className="strong">{line.eggType.name}</td><td className="number">{line.trees}</td>
                  <td className="number">{numberFormat.format(line.looseEggs)}</td>
                  <td className="number">{numberFormat.format(line.machineEggs + line.a5Eggs + line.dirtyEggs)}</td>
                  <td className="number strong">{numberFormat.format(line.totalEggs)}</td>
                </tr>)}</tbody>
              </table></div>
              {receipt.sourceDocumentUrl && <a className="muted" href={receipt.sourceDocumentUrl} target="_blank" rel="noreferrer">Mở ảnh/PDF phiếu gốc ↗</a>}
              <form action={transitionReceiptAction} className="approval-actions">
                <input type="hidden" name="receiptId" value={receipt.id} />
                <input name="comment" maxLength={300} placeholder="Nhận xét hoặc lý do từ chối" />
                <button className="btn" type="submit" name="action" value={nextAction}>{nextLabel}</button>
                <button className="btn danger" type="submit" name="action" value="REJECT">Từ chối</button>
              </form>
              <div className="hint">Lịch sử: {receipt.approvals.map((item) => `${item.user.name} · ${item.action}`).join(" → ")}</div>
            </article>
          );
        })}
      </section>
    </>
  );
}
