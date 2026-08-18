import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'ZoneWifi — Accès Internet Haut Débit',
  description:
    'Achetez votre pass Wi-Fi en quelques secondes via Wave. Connexion automatique garantie.',
  robots: 'noindex, nofollow', // Portail captif : pas d'indexation
  openGraph: {
    title: 'ZoneWifi — Hotspot Wi-Fi',
    description: 'Accès internet rapide et sécurisé',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={inter.variable}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
      </head>
      <body>{children}</body>
    </html>
  );
}
