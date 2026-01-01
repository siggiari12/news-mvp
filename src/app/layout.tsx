import type { Metadata } from "next";
import { Inter } from "next/font/google"; // Sækjum Inter letrið
import "./globals.css";

// Stilla letrið
const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Fréttavaktin",
  description: "Nýjustu fréttirnar með gervigreind",
  manifest: "/manifest.json",
  themeColor: "#000000",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="is">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
