import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "美股分析",
  description: "個人美股分析系統",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
