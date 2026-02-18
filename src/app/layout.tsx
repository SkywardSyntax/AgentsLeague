import type { Metadata, Viewport } from 'next';
import { Inter, Caveat } from 'next/font/google';
import '@/styles/globals.css';
import { Providers } from './providers';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const caveat = Caveat({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-caveat',
});

export const metadata: Metadata = {
  title: 'AI Whiteboard',
  description: 'AI-powered collaborative whiteboard for visual thinking with intelligent agents',
  openGraph: {
    title: 'AI Whiteboard',
    description: 'AI-powered collaborative whiteboard for visual thinking with intelligent agents',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${caveat.variable}`}>
      <body className="h-screen w-screen overflow-hidden m-0 p-0 bg-[var(--color-background)] text-[var(--color-text-primary)] font-[var(--font-inter)]">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <a href="#toolbar" className="skip-link" style={{ left: '180px' }}>
          Skip toolbar
        </a>
        <Providers>{children}</Providers>
        {/* Live regions for screen reader announcements */}
        <div
          aria-live="polite"
          aria-atomic="true"
          role="status"
          id="a11y-status"
          className="sr-only"
        />
        <div
          aria-live="assertive"
          aria-atomic="true"
          role="alert"
          id="a11y-alert"
          className="sr-only"
        />
      </body>
    </html>
  );
}
