"use server";

import {
  ApprovalAction,
  Area,
  InventoryTxnType,
  PackagingTxnType,
  Prisma,
  ReceiptStatus,
  ReceiptType,
  Role,
  StockBucket,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser } from "@/lib/auth-guard";
import {
  calculateLineTotal,
  canTransition,
  signedInventoryQuantity,
} from "@/lib/egg-rules.js";

const receiptSchema = z.object({
  receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  receiptTime: z.string().max(5).optional(),
  type: z.nativeEnum(ReceiptType),
  area: z.nativeEnum(Area),
  stockBucket: z.nativeEnum(StockBucket),
  roundNo: z.coerce.number().int().min(1).max(20),
  lotNumber: z.string().trim().max(80).optional(),
  legalEntity: z.string().trim().max(120).optional(),
  sourceDocumentUrl: z.union([z.literal(""), z.string().url()]).optional(),
  notes: z.string().trim().max(500).optional(),
});

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function localDateToUtc(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function receiptPrefix(type: ReceiptType) {
  return type === "FARM_RECEIPT" ? "NC" : type === "TFP_RECEIPT" ? "TFP" : "YCNK";
}

export async function createReceiptAction(formData: FormData) {
  const user = await requireRole([Role.ADMIN, Role.COUNTER]);
  const data = receiptSchema.parse({
    receiptDate: value(formData, "receiptDate"),
    receiptTime: value(formData, "receiptTime") || undefined,
    type: value(formData, "type"),
    area: value(formData, "area"),
    stockBucket: value(formData, "stockBucket"),
    roundNo: value(formData, "roundNo"),
    lotNumber: value(formData, "lotNumber") || undefined,
    legalEntity: value(formData, "legalEntity") || undefined,
    sourceDocumentUrl: value(formData, "sourceDocumentUrl"),
    notes: value(formData, "notes") || undefined,
  });

  const eggTypes = await prisma.eggType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  const lines = eggTypes.flatMap((eggType) => {
    const fields = {
      trees: Number(value(formData, `trees_${eggType.id}`) || "0"),
      eggsPerTree: eggType.eggsPerTree,
      looseEggs: Number(value(formData, `loose_${eggType.id}`) || "0"),
      machineEggs: Number(value(formData, `machine_${eggType.id}`) || "0"),
      a5Eggs: Number(value(formData, `a5_${eggType.id}`) || "0"),
      dirtyEggs: Number(value(formData, `dirty_${eggType.id}`) || "0"),
    };
    const totalEggs = calculateLineTotal(fields);
    if (totalEggs === 0) return [];
    return [{
      eggTypeId: eggType.id,
      trees: fields.trees,
      eggsPerTree: eggType.eggsPerTree,
      looseEggs: fields.looseEggs,
      machineEggs: fields.machineEggs,
      a5Eggs: fields.a5Eggs,
      dirtyEggs: fields.dirtyEggs,
      totalEggs,
    }];
  });

  if (lines.length === 0) throw new Error("Phiếu phải có ít nhất một loại trứng có số lượng.");
  const receiptDate = localDateToUtc(data.receiptDate);
  const datePart = data.receiptDate.replaceAll("-", "");

  let created = false;
  for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
    try {
      await prisma.$transaction(async (tx) => {
        const latest = await tx.receipt.findFirst({
          where: { receiptDate, type: data.type, area: data.area },
          orderBy: { sequence: "desc" },
          select: { sequence: true },
        });
        const sequence = (latest?.sequence ?? 0) + 1;
        const receiptNo = `${receiptPrefix(data.type)}-${datePart}-${data.area}-${String(sequence).padStart(3, "0")}`;
        const receipt = await tx.receipt.create({
          data: {
            ...data,
            receiptDate,
            receiptTime: data.receiptTime || null,
            lotNumber: data.lotNumber || null,
            legalEntity: data.legalEntity || null,
            sourceDocumentUrl: data.sourceDocumentUrl || null,
            notes: data.notes || null,
            sequence,
            receiptNo,
            createdById: user.id,
            status: ReceiptStatus.PENDING_QC,
            lines: { create: lines },
            approvals: {
              create: { action: ApprovalAction.SUBMIT, userId: user.id, comment: "Gửi phiếu" },
            },
          },
        });
        await tx.auditLog.create({
          data: {
            entityType: "Receipt",
            entityId: receipt.id,
            action: "SUBMIT",
            userId: user.id,
            payload: { receiptNo, lineCount: lines.length },
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      created = true;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || !["P2002", "P2034"].includes(error.code) || attempt === 2) {
        throw error;
      }
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/receipts");
  redirect("/receipts?created=1");
}

const transitionSchema = z.object({
  receiptId: z.string().min(1),
  action: z.enum([ApprovalAction.VERIFY, ApprovalAction.APPROVE, ApprovalAction.REJECT]),
  comment: z.string().trim().max(300).optional(),
});

export async function transitionReceiptAction(formData: FormData) {
  const user = await requireUser();
  const data = transitionSchema.parse({
    receiptId: value(formData, "receiptId"),
    action: value(formData, "action"),
    comment: value(formData, "comment") || undefined,
  });
  const action = data.action;

  await prisma.$transaction(async (tx) => {
    const receipt = await tx.receipt.findUnique({
      where: { id: data.receiptId },
      include: { lines: true },
    });
    if (!receipt || !canTransition(receipt.status, action, user.role)) {
      throw new Error("Phiếu không còn ở bước phù hợp hoặc bạn không có quyền duyệt.");
    }

    const nextStatus = action === ApprovalAction.VERIFY
      ? ReceiptStatus.PENDING_WAREHOUSE
      : action === ApprovalAction.APPROVE
        ? ReceiptStatus.CONFIRMED
        : ReceiptStatus.REJECTED;
    const updated = await tx.receipt.updateMany({
      where: { id: receipt.id, status: receipt.status },
      data: { status: nextStatus },
    });
    if (updated.count !== 1) throw new Error("Phiếu vừa được người khác xử lý. Hãy tải lại trang.");

    await tx.approval.create({
      data: { receiptId: receipt.id, action, userId: user.id, comment: data.comment },
    });

    if (action === ApprovalAction.APPROVE) {
      await tx.inventoryTransaction.createMany({
        data: receipt.lines.map((line) => ({
          transactionDate: receipt.receiptDate,
          type: InventoryTxnType.RECEIPT,
          bucket: receipt.stockBucket,
          quantity: line.totalEggs,
          area: receipt.area,
          lotNumber: receipt.lotNumber,
          reference: receipt.receiptNo,
          notes: "Tự động từ phiếu đã xác nhận",
          eggTypeId: line.eggTypeId,
          receiptId: receipt.id,
          receiptLineId: line.id,
          userId: user.id,
        })),
      });
    }

    await tx.auditLog.create({
      data: {
        entityType: "Receipt",
        entityId: receipt.id,
        action,
        userId: user.id,
        payload: { from: receipt.status, to: nextStatus, comment: data.comment ?? null },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidatePath("/dashboard");
  revalidatePath("/receipts");
  revalidatePath("/approvals");
  revalidatePath("/inventory");
  redirect("/approvals?updated=1");
}

const inventorySchema = z.object({
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.nativeEnum(InventoryTxnType),
  bucket: z.nativeEnum(StockBucket),
  quantity: z.coerce.number().int().positive(),
  eggTypeId: z.string().min(1),
  area: z.union([z.literal(""), z.nativeEnum(Area)]).optional(),
  lotNumber: z.string().trim().max(80).optional(),
  reference: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(300).optional(),
});

export async function createInventoryMovementAction(formData: FormData) {
  const user = await requireRole([Role.ADMIN, Role.WAREHOUSE]);
  const data = inventorySchema.parse({
    transactionDate: value(formData, "transactionDate"),
    type: value(formData, "type"),
    bucket: value(formData, "bucket"),
    quantity: value(formData, "quantity"),
    eggTypeId: value(formData, "eggTypeId"),
    area: value(formData, "area"),
    lotNumber: value(formData, "lotNumber") || undefined,
    reference: value(formData, "reference") || undefined,
    notes: value(formData, "notes") || undefined,
  });
  if (data.type === InventoryTxnType.RECEIPT) {
    throw new Error("Nhập trứng phải đi qua quy trình phiếu và duyệt.");
  }
  const quantity = signedInventoryQuantity(data.type, data.quantity);

  await prisma.$transaction(async (tx) => {
    const balance = await tx.inventoryTransaction.aggregate({
      where: { eggTypeId: data.eggTypeId, bucket: data.bucket },
      _sum: { quantity: true },
    });
    if (quantity < 0 && (balance._sum.quantity ?? 0) + quantity < 0) {
      throw new Error("Không đủ tồn kho để xuất hoặc ghi nhận bể.");
    }
    const movement = await tx.inventoryTransaction.create({
      data: {
        ...data,
        transactionDate: localDateToUtc(data.transactionDate),
        area: data.area || null,
        lotNumber: data.lotNumber || null,
        reference: data.reference || null,
        notes: data.notes || null,
        quantity,
        userId: user.id,
      },
    });
    await tx.auditLog.create({
      data: {
        entityType: "InventoryTransaction",
        entityId: movement.id,
        action: "CREATE",
        userId: user.id,
        payload: { type: data.type, quantity, bucket: data.bucket },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  redirect("/inventory?created=1");
}

const packagingSchema = z.object({
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.nativeEnum(PackagingTxnType),
  quantity: z.coerce.number().int().positive(),
  itemId: z.string().min(1),
  reference: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(300).optional(),
});

export async function createPackagingMovementAction(formData: FormData) {
  const user = await requireRole([Role.ADMIN, Role.WAREHOUSE]);
  const data = packagingSchema.parse({
    transactionDate: value(formData, "transactionDate"),
    type: value(formData, "type"),
    quantity: value(formData, "quantity"),
    itemId: value(formData, "itemId"),
    reference: value(formData, "reference") || undefined,
    notes: value(formData, "notes") || undefined,
  });
  const quantity = data.type === PackagingTxnType.ISSUE ? -data.quantity : data.quantity;

  await prisma.$transaction(async (tx) => {
    const balance = await tx.packagingTransaction.aggregate({
      where: { itemId: data.itemId },
      _sum: { quantity: true },
    });
    if (quantity < 0 && (balance._sum.quantity ?? 0) + quantity < 0) {
      throw new Error("Không đủ tồn vật tư bao bì để xuất.");
    }
    const movement = await tx.packagingTransaction.create({
      data: {
        ...data,
        transactionDate: localDateToUtc(data.transactionDate),
        reference: data.reference || null,
        notes: data.notes || null,
        quantity,
        userId: user.id,
      },
    });
    await tx.auditLog.create({
      data: {
        entityType: "PackagingTransaction",
        entityId: movement.id,
        action: "CREATE",
        userId: user.id,
        payload: { type: data.type, quantity },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidatePath("/packaging");
  redirect("/packaging?created=1");
}
