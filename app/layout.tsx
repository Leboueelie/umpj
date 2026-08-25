import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MAISON DE PRIERE D'ABIDJAN POUR TOUTES LES NATIONS",
  description: "Registres de temps de prière",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
