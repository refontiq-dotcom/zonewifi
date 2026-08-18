import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="fr">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
      </head>
      <body>{children}</body>
    </html>
  );
}
