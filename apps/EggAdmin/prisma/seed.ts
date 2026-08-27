import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const eggTypes = [
  ["BTP", "Bán thành phẩm"], ["SO", "Trứng sò"], ["14_5", "14.5"],
  ["16", "16"], ["17", "17"], ["18", "18"], ["19", "19"],
  ["20", "20"], ["21", "21"], ["22", "22"], ["23", "23"], ["24", "24"],
  ["2A", "2A"], ["2B", "2B"], ["L3", "Loại 3"], ["MOP", "Móp"],
  ["MOP_DO", "Móp đỏ"], ["NUONG", "Nướng"], ["DOI", "Đôi"],
  ["BICH_NMT", "Bịch NMT"], ["BICH_CN", "Bịch chăn nuôi"],
  ["BICH_QH", "Bịch quá hạn"], ["BE", "Bể"],
] as const;

const packagingItems = [
  ["THUNG_6", "Thùng 6 vỉ", "thùng"],
  ["THUNG_10", "Thùng 10 vỉ", "thùng"],
  ["KHAY_30", "Khay 30 trứng", "khay"],
  ["TEM_NHAN", "Tem nhãn", "cái"],
  ["TUI", "Túi đóng gói", "cái"],
] as const;

async function upsertUser(emailKey: string, passwordKey: string, name: string, role: Role) {
  const email = process.env[emailKey];
  const password = process.env[passwordKey];
  if (!email || !password || password.startsWith("replace-")) {
    throw new Error(`Hãy cấu hình ${emailKey} và ${passwordKey} trong .env trước khi seed.`);
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: { name, role, passwordHash, active: true },
    create: { email, name, role, passwordHash },
  });
}

async function main() {
  for (const [index, [code, name]] of eggTypes.entries()) {
    await prisma.eggType.upsert({
      where: { code },
      update: { name, sortOrder: index + 1, active: true },
      create: { code, name, sortOrder: index + 1 },
    });
  }

  for (const [code, name, unit] of packagingItems) {
    await prisma.packagingItem.upsert({
      where: { code },
      update: { name, unit, active: true },
      create: { code, name, unit },
    });
  }

  await upsertUser("SEED_ADMIN_EMAIL", "SEED_ADMIN_PASSWORD", "Quản trị", Role.ADMIN);
  await upsertUser("SEED_COUNTER_EMAIL", "SEED_COUNTER_PASSWORD", "Nhân viên đếm", Role.COUNTER);
  await upsertUser("SEED_QC_EMAIL", "SEED_QC_PASSWORD", "QC", Role.QC);
  await upsertUser("SEED_WAREHOUSE_EMAIL", "SEED_WAREHOUSE_PASSWORD", "Thủ kho", Role.WAREHOUSE);
}

main()
  .then(() => console.log("Đã khởi tạo dữ liệu Egg Admin."))
  .finally(async () => prisma.$disconnect());
