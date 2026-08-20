import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Marina AI — Command Hub & Autonomous Workspace",
  description:
    "Autonomous agents orchestrating deployment, multi-model AI, and strategy streams.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.className} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#0d0f12] text-white">
        {children}
      </body>
    </html>
  );
}
