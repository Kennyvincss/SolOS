import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Card, Page, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Privacy policy · STRATA" };

const UPDATED = "October 2, 2026";

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-[16px] font-semibold tracking-[-0.01em]">{title}</h2>
      <div className="mt-2 space-y-2 text-[14px] leading-relaxed text-muted [&_b]:font-semibold [&_b]:text-fg [&_li]:ml-4 [&_li]:list-disc">{children}</div>
    </Card>
  );
}

export default function PrivacyPage() {
  return (
    <Page>
      <PageHeader eyebrow={`Last updated ${UPDATED}`} title="Privacy policy" subtitle="This covers the STRATA website and the STRATA apps for Windows, macOS, Linux and phones. The short version: your wallets, passwords and browsing stay on your device, and we never sell your data." />
      <div className="grid max-w-3xl gap-4">
        <Block title="What stays on your device">
          <ul>
            <li><b>Wallets and keys.</b> Wallets live in your wallet extensions (such as Phantom). STRATA never sees or stores your recovery phrase or private keys.</li>
            <li><b>Saved passwords.</b> Encrypted with your operating system&apos;s keychain and never synced or sent to us.</li>
            <li><b>Browsing history, open tabs, downloads, site permissions and profile pictures.</b> Stored only in your STRATA profile on this device.</li>
          </ul>
        </Block>
        <Block title="What reaches our servers">
          <ul>
            <li><b>Your wallet address</b>, when you sign in with your wallet. Signing in means signing a message; it never creates a transaction or costs fees.</li>
            <li><b>A sign-in cookie</b>, which keeps you signed in. Signing out removes it.</li>
            <li><b>Synced data</b>, only if you sign in: your watchlist, followed wallets, bookmarks, extension list and settings, so they appear on your other devices. Passwords are never synced.</li>
            <li><b>Pages you send to your devices</b> with &ldquo;Send to your devices&rdquo;, until the other device receives them.</li>
            <li><b>Searches.</b> Search terms are sent to our search service, which asks Bing, DuckDuckGo and Wikipedia for results. They are not stored with your identity.</li>
            <li><b>AI questions.</b> When you use STRATA AI, your question and, if you include it, the page you&apos;re on are sent to our AI provider (Groq) to write the answer.</li>
            <li><b>Blockchain lookups.</b> Token, wallet and transaction pages ask Solana data providers for public on-chain information.</li>
          </ul>
        </Block>
        <Block title="What we don't do">
          <ul>
            <li>No ads, and no selling or renting your data.</li>
            <li>No third-party analytics or tracking scripts.</li>
            <li>No access to your funds: every transaction is approved by you in your own wallet.</li>
          </ul>
        </Block>
        <Block title="Websites you visit">
          <p>STRATA is a browser. Websites and apps you open, and extensions you install, have their own privacy policies and may collect information under them.</p>
        </Block>
        <Block title="Your choices">
          <ul>
            <li>Use STRATA without signing in, and nothing is synced.</li>
            <li>Clear your history from the app&apos;s menu at any time.</li>
            <li>Ask us to delete your synced data, and we will remove it.</li>
          </ul>
        </Block>
        <Block title="Contact">
          <p>
            Questions or deletion requests:{" "}
            <a className="font-medium text-sol-green hover:underline" href="https://github.com/Kennyvincss/SolOS/issues" target="_blank" rel="noreferrer">
              open an issue on GitHub
            </a>
            . If this policy changes, we&apos;ll update the date at the top.
          </p>
        </Block>
      </div>
    </Page>
  );
}
