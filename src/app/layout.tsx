import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: "NAMMAN",
  description: "Browse, sync and manage Neural Amp Modeler (NAM) profiles seamlessly.",
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
