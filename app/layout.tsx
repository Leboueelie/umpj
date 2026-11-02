import type { Metadata } from "next";
import "./globals.css";
import { AppShell, type SessionShell } from "@/components/nav/AppShell";
import { getUtilisateurActuel } from "@/lib/auth";

export const metadata: Metadata = {
  title: "UMPJ",
  description: "Université Mondiale de la Prière et du Jeûne",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Session pour l'en-tête global (email + rôle). En cas d'indisponibilité
  // (secret ou base), on rend le site en mode anonyme : le proxy reste la
  // seule autorité d'accès.
  let session: SessionShell = null;
  try {
    const u = await getUtilisateurActuel();
    if (u) session = { email: u.email, nom: u.nom, role: u.role };
  } catch {
    session = null;
  }
  return (
    <html lang="fr">
      <body>
        <AppShell session={session}>{children}</AppShell>
      </body>
    </html>
  );
}
