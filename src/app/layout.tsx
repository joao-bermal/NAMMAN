import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tone Manager - NAM',
  description: 'Download and organize Tone3000 models',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <div className="container">
          {children}
        </div>
      </body>
    </html>
  );
}
