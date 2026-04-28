import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "美股分析",
  description: "個人美股分析系統",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant" className="dark">
      <body className="bg-[#060911] text-gray-100 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
