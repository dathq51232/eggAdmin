import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { loginAction } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams?: { error?: string } }) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="login-page">
      <section className="login-hero">
        <div className="brand-mark">◉</div>
        <h1>Trứng vào đúng số. Kho ra đúng tồn.</h1>
        <p>
          Lõi MRP rút gọn cho nhà máy trứng: nhập liệu nhanh, duyệt ba bước,
          theo dõi tồn nguyên liệu – thành phẩm và truy vết từng phiếu.
        </p>
      </section>
      <section className="login-panel">
        <div className="login-box">
          <h2>Đăng nhập Egg Admin</h2>
          <p>Dùng tài khoản được quản trị viên cấp.</p>
          <form action={loginAction} className="login-form">
            {searchParams?.error && <div className="login-error">Email hoặc mật khẩu chưa đúng.</div>}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" autoComplete="username" required autoFocus />
            </div>
            <div className="field">
              <label htmlFor="password">Mật khẩu</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <button className="btn" type="submit">Đăng nhập</button>
          </form>
        </div>
      </section>
    </main>
  );
}
