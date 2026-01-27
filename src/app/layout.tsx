import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Font with swap to prevent blocking render
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "VIZKA",
  description: "Nýjustu fréttirnar",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "VIZKA",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#000000",
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="is">
      <head>
        {/* Preconnect to critical origins for faster resource loading */}
        <link rel="preconnect" href="https://xbxeuuuuwayjtrszqgiv.supabase.co" />
        <link rel="preconnect" href="https://images.mbl.is" />
        <link rel="dns-prefetch" href="https://xbxeuuuuwayjtrszqgiv.supabase.co" />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
