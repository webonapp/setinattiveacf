import type { Metadata } from 'next';
import './globals.css';
import './tactics.css';

export const metadata: Metadata = {
  title: 'Tactics Lab — Editor tattico',
  description: 'Componi e salva immagini tattiche di calcio viste dall’alto.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
