import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { SessionProvider } from "@/lib/client/session";
import { DesktopHeader, LiteTopBar, MobileNav, Sidebar, TopBar } from "@/components/shell/nav";
import { CommandBar } from "@/components/shell/command-bar";
import { WalletModal } from "@/components/shell/wallet-modal";
import { ThemeSync, Watchers } from "@/components/shell/watchers";
import { AiSidePanel } from "@/components/ai/side-panel";
import { AiBubble } from "@/components/ai/ai-bubble";
import { ModeTransition } from "@/components/mode-transition";
import { HistoryRecorder } from "@/components/shell/history-recorder";
import { DeviceSync } from "@/components/shell/device-sync";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: { default: "STRATA — The browser for the onchain world.", template: "%s · STRATA" },
  description: "Search, discover, use and understand the entire Solana ecosystem. Apps, tokens, wallets, transactions, DeFi and STRATA AI in one place.",
  applicationName: "STRATA",
  icons: { icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/brand/icon-192.png", type: "image/png", sizes: "192x192" }], apple: "/apple-touch-icon.png" },
  manifest: "/manifest.webmanifest",
  openGraph: { title: "STRATA", description: "The browser for the onchain world.", type: "website" },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0b0b0e" }, { color: "#ffffff" }],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Apply the saved theme before paint to avoid a flash.
const themeScript = `try{var k=Object.keys(localStorage).find(function(x){return x.indexOf('sos:v1:')===0});var s=k&&JSON.parse(localStorage.getItem(k));var t=s&&s.themeChosen?s.theme:'light';if(t==='system'){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.dataset.theme=t||'light';if(localStorage.getItem('strata:sidebar')==='collapsed')document.documentElement.classList.add('sb-collapsed');var tm=null;try{tm=sessionStorage.getItem('strata:mode')}catch(e){}var md=tm||(window.solanaOSDesktop?'lite':localStorage.getItem('strata:mode'));if(md==='pro'){document.documentElement.classList.remove('mode-lite');document.documentElement.classList.add('mode-pro')}}catch(e){document.documentElement.dataset.theme='light'}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" className={`mode-lite ${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <SessionProvider>
          <ThemeSync />
          <Watchers />
          <Suspense>
            <Sidebar />
          </Suspense>
          <div id="app-root" className="transition-[padding] duration-200 md:pl-[var(--sb-w)]">
            <TopBar />
            <DesktopHeader />
            <LiteTopBar />
            <main className="min-h-[calc(100dvh-3.5rem)] md:min-h-[calc(100dvh-60px)]">{children}</main>
          </div>
          <MobileNav />
          <AiSidePanel />
          <AiBubble />
          <DeviceSync />
          <Suspense>
            <HistoryRecorder />
          </Suspense>
          <CommandBar />
          <WalletModal />
          <ModeTransition />
        </SessionProvider>
      </body>
    </html>
  );
}
