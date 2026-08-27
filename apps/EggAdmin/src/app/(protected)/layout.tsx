import { Role } from "@prisma/client";
import Link from "next/link";
import { signOut } from "@/auth";
import { requireUser } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

const roleLabels: Record<Role, string> = {
  ADMIN: "Quản trị",
  COUNTER: "Nhân viên đếm",
  QC: "Kiểm soát QC",
  WAREHOUSE: "Thủ kho",
  VIEWER: "Chỉ xem",
};

const navItems = [
  ["/dashboard", "Tổng quan"],
  ["/receipts", "Phiếu trứng"],
  ["/approvals", "Phê duyệt"],
  ["/inventory", "Tồn kho trứng"],
  ["/packaging", "Bao bì"],
  ["/reports", "Báo cáo"],
] as const;

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/dashboard" className="brand">
          <span className="brand-mark">◉</span>
          <span><strong>Egg Admin</strong><small>MRP tinh gọn</small></span>
        </Link>
        <nav className="nav">
          {navItems.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
        <div className="sidebar-user">
          <strong>{user.name}</strong>
          <small>{roleLabels[user.role]} · {user.email}</small>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button className="signout" type="submit">Đăng xuất</button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
