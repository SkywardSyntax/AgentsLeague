import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AgentsLeague',
  description: 'Interleaved AI chat and animated whiteboard',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
