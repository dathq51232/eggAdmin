import { ReceiptStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { receiptTypeLabels } from "@/lib/format";

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
  const url = new URL(request.url);
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return new NextResponse("Khoảng ngày không hợp lệ", { status: 400 });
  }
  const from = new Date(`${start}T00:00:00.000Z`);
  const to = new Date(`${end}T00:00:00.000Z`);
  to.setUTCDate(to.getUTCDate() + 1);
  const receipts = await prisma.receipt.findMany({
    where: { status: ReceiptStatus.CONFIRMED, receiptDate: { gte: from, lt: to } },
    include: { lines: { include: { eggType: true } }, createdBy: { select: { name: true } } },
    orderBy: [{ receiptDate: "asc" }, { receiptNo: "asc" }],
  });
  const rows = [["Ngày", "Số phiếu", "Loại phiếu", "Khu", "Lô", "Loại trứng", "Cây", "Trứng lẻ", "Tổng trứng", "Người nhập"]];
  for (const receipt of receipts) {
    for (const line of receipt.lines) rows.push([
      receipt.receiptDate.toISOString().slice(0, 10), receipt.receiptNo, receiptTypeLabels[receipt.type], receipt.area,
      receipt.lotNumber ?? "", line.eggType.name, String(line.trees), String(line.looseEggs), String(line.totalEggs), receipt.createdBy.name,
    ]);
  }
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="egg-report-${start}-${end}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
