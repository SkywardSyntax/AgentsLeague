import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'AI Whiteboard',
  description: 'AI-powered collaborative whiteboard',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="h-screen w-screen overflow-hidden bg-[var(--color-background)] text-[var(--color-text-primary)]">
        {children}
      </body>
    </html>
  );
}
