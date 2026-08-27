import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Egg Admin · Viet ERP",
  description: "Quản lý nhập trứng, duyệt phiếu, tồn kho và bao bì",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
