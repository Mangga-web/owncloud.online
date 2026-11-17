import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OwnCloud 文件助手",
  description: "通过 ownCloud MCP 安全访问文件的 Copilot 助手",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
