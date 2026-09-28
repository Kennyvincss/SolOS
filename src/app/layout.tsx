import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { SessionProvider } from "@/lib/client/session";
import { MobileNav, Sidebar, TopBar } from "@/components/shell/nav";
import { CommandBar } from "@/components/shell/command-bar";
import { WalletModal } from "@/components/shell/wallet-modal";
import { ThemeSync, Watchers } from "@/components/shell/watchers";

export const metadata: Metadata = {
  title: { default: "STRATA — The browser for the onchain world.", template: "%s · STRATA" },
  description: "Search, discover, use and understand the entire Solana ecosystem. Apps, tokens, wallets, transactions, DeFi and STRATA AI in one place.",
  applicationName: "STRATA",
  icons: { icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/brand/icon-192.png", type: "image/png", sizes: "192x192" }], apple: "/apple-touch-icon.png" },
  manifest: "/manifest.webmanifest",
  openGraph: { title: "STRATA", description: "The browser for the onchain world.", type: "website" },
};

export const viewport: Viewport = {
  themeColor: "#07070b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Apply the saved theme before paint to avoid a flash.
const themeScript = `try{var k=Object.keys(localStorage).find(function(x){return x.indexOf('sos:v1:')===0});var t=k&&JSON.parse(localStorage.getItem(k)).theme;if(t==='system'){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.dataset.theme=t||'dark'}catch(e){document.documentElement.dataset.theme='dark'}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <SessionProvider>
          <ThemeSync />
          <Watchers />
          <Sidebar />
          <div className="md:pl-[240px]">
            <TopBar />
            <main className="min-h-[calc(100dvh-3.5rem)] md:min-h-dvh">{children}</main>
          </div>
          <MobileNav />
          <CommandBar />
          <WalletModal />
        </SessionProvider>
      </body>
    </html>
  );
}
