import { Area, ReceiptType, Role, StockBucket } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";
import { dateFormat, numberFormat, receiptStatusLabels, receiptTypeLabels, vietnamToday } from "@/lib/format";
import { createReceiptAction } from "../actions";

export default async function ReceiptsPage({ searchParams }: { searchParams?: { created?: string } }) {
  const user = await requireUser();
  const canCreate = user.role === Role.ADMIN || user.role === Role.COUNTER;
  const [eggTypes, receipts] = await Promise.all([
    prisma.eggType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.receipt.findMany({
      include: { createdBy: { select: { name: true } }, lines: { select: { totalEggs: true } } },
      orderBy: [{ receiptDate: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
  ]);
  const today = vietnamToday();

  return (
    <>
      <header className="page-head">
        <div><h1>Phiếu trứng</h1><p>Nhập một lần, chuyển QC và thủ kho xác nhận trước khi lên tồn.</p></div>
      </header>
      {searchParams?.created && <div className="notice">Đã tạo phiếu và chuyển sang chờ QC.</div>}

      {canCreate && (
        <section className="card" style={{ marginBottom: 18 }}>
          <h2>Tạo phiếu mới</h2>
          <form action={createReceiptAction}>
            <div className="form-grid">
              <div className="field"><label>Ngày phiếu</label><input name="receiptDate" type="date" defaultValue={today} required /></div>
              <div className="field"><label>Giờ bàn giao</label><input name="receiptTime" type="time" /></div>
              <div className="field"><label>Loại phiếu</label>
                <select name="type" defaultValue={ReceiptType.FARM_RECEIPT}>
                  {Object.values(ReceiptType).map((type) => <option key={type} value={type}>{receiptTypeLabels[type]}</option>)}
                </select>
              </div>
              <div className="field"><label>Khu</label>
                <select name="area" defaultValue={Area.A}>{Object.values(Area).map((area) => <option key={area}>{area}</option>)}</select>
              </div>
              <div className="field"><label>Nhóm tồn</label>
                <select name="stockBucket" defaultValue={StockBucket.RAW}>
                  <option value="RAW">Nguyên liệu</option><option value="FINISHED">Thành phẩm</option>
                </select>
              </div>
              <div className="field"><label>Lần giao</label><input name="roundNo" type="number" min="1" max="20" defaultValue="1" required /></div>
              <div className="field"><label>Số lô</label><input name="lotNumber" maxLength={80} placeholder="VD: A-2708-01" /></div>
              <div className="field"><label>Đơn vị/pháp nhân</label><input name="legalEntity" maxLength={120} /></div>
              <div className="field span-2"><label>Liên kết ảnh/PDF phiếu gốc</label><input name="sourceDocumentUrl" type="url" placeholder="https://... (có thể thêm sau)" /></div>
              <div className="field span-2"><label>Ghi chú</label><input name="notes" maxLength={500} /></div>
            </div>

            <details className="egg-entry" open>
              <summary>Nhập số lượng theo loại trứng</summary>
              <p className="hint">Quy đổi chuẩn: 1 cây = 300 trứng. BTP có thể cộng thêm máy, A5 và dơ.</p>
              <div className="table-wrap">
                <table className="egg-table">
                  <thead><tr><th>Loại trứng</th><th>Cây</th><th>Trứng lẻ</th><th>Máy (BTP)</th><th>A5 (BTP)</th><th>Dơ (BTP)</th></tr></thead>
                  <tbody>{eggTypes.map((eggType) => (
                    <tr key={eggType.id}>
                      <td className="strong">{eggType.name}</td>
                      <td><input name={`trees_${eggType.id}`} type="number" min="0" step="1" defaultValue="0" /></td>
                      <td><input name={`loose_${eggType.id}`} type="number" min="0" step="1" defaultValue="0" /></td>
                      <td><input name={`machine_${eggType.id}`} type="number" min="0" step="1" defaultValue="0" disabled={eggType.code !== "BTP"} /></td>
                      <td><input name={`a5_${eggType.id}`} type="number" min="0" step="1" defaultValue="0" disabled={eggType.code !== "BTP"} /></td>
                      <td><input name={`dirty_${eggType.id}`} type="number" min="0" step="1" defaultValue="0" disabled={eggType.code !== "BTP"} /></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </details>
            <div className="form-submit"><span className="hint">Sau khi gửi không sửa trực tiếp; nếu sai, QC từ chối và lập lại phiếu.</span><button className="btn" type="submit">Gửi phiếu sang QC</button></div>
          </form>
        </section>
      )}

      <section className="card">
        <h2>50 phiếu gần nhất</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>Số phiếu</th><th>Ngày</th><th>Loại</th><th>Khu</th><th>Người nhập</th><th className="number">Số trứng</th><th>Trạng thái</th></tr></thead>
          <tbody>{receipts.length === 0 ? <tr><td colSpan={7} className="empty">Chưa có phiếu.</td></tr> : receipts.map((receipt) => {
            const total = receipt.lines.reduce((sum, line) => sum + line.totalEggs, 0);
            return <tr key={receipt.id}>
              <td className="strong">{receipt.receiptNo}</td><td>{dateFormat.format(receipt.receiptDate)}</td>
              <td>{receiptTypeLabels[receipt.type]}</td><td>{receipt.area}</td><td>{receipt.createdBy.name}</td>
              <td className="number">{numberFormat.format(total)}</td>
              <td><span className={`badge badge-${receipt.status}`}>{receiptStatusLabels[receipt.status]}</span></td>
            </tr>;
          })}</tbody>
        </table></div>
      </section>
    </>
  );
}
