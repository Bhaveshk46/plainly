import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Script from 'next/script';
import '../web/styles.css';

const siteUrl = process.env['SITE_URL'];
export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: { default: 'Plainly — Understand legal documents in plain language', template: '%s | Plainly' },
  description: 'Understand contracts, compare terms, ask document-based questions, and prepare a lawyer brief. Private on-device analysis with optional AI assistance.',
  applicationName: 'Plainly',
  icons: { icon: '/favicon.svg' },
  openGraph: { type: 'website', locale: 'en_US', siteName: 'Plainly', title: 'Fine print. Clear answers. — Plainly', description: 'Make sense of legal documents. Understand the terms, spot potential risks, and know what to ask next.' },
  twitter: { card: 'summary', title: 'Plainly — Fine print. Clear answers.', description: 'Accessible, privacy-first legal document explanations.' },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return <html lang="en" suppressHydrationWarning><body><Script src="/theme-init.js" strategy="beforeInteractive" nonce={nonce} />{children}</body></html>;
}
