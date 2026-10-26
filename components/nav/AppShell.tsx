"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

export type SessionShell = {
  email: string;
  role: "ADMIN" | "LECTEUR";
} | null;

/**
 * En-tête global de l'application : logo, navigation principale, état de
 * session. Fourni par `app/layout.tsx` pour toutes les pages.
 *
 * Chemins sans en-tête global (la page gère déjà son propre en-tête) :
 * - `/login` : présentation dédiée ;
 * - `/nuits-priere/nuit-de-priere` : page préexistante intouchable.
 */
const CHEMINS_SANS_HEADER = [
  "/login",
  "/nuits-priere/nuit-de-priere",
];

export function AppShell({
  session,
  children,
}: {
  session: SessionShell;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [deconnexionEnCours, setDeconnexionEnCours] = useState(false);

  const sansHeader = CHEMINS_SANS_HEADER.some(
    (c) => pathname === c || pathname.startsWith(c + "/")
  );

  async function deconnexion() {
    if (deconnexionEnCours) return;
    setDeconnexionEnCours(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      // Après révocation, l'accueil est protégé : destination directe sans
      // rebond /login?next=… inutile.
      router.push("/login");
      router.refresh();
    } finally {
      setDeconnexionEnCours(false);
    }
  }

  if (sansHeader) return <>{children}</>;

  const admin = session?.role === "ADMIN";

  return (
    <>
      <header className="site-header">
        <div className="site-header-in">
          <Link href="/" className="site-brand">
            <img src="/logo.png" alt="" className="site-logo" />
            <span>UMPJ</span>
          </Link>
          <nav className="site-nav" aria-label="Navigation principale">
            {admin ? (
              <Link href="/rapports">Rapports</Link>
            ) : (
              // Proxy inchangé : le LECTEUR n'a accès qu'à /banque — on
              // n'affiche donc pas un lien vers /rapports qu'il ne peut pas
              // ouvrir (redirigé vers /banque par la garde existante).
              <Link href="/banque">Banque des accomplissements</Link>
            )}
            {admin && <Link href="/">Modules</Link>}
            {admin && <Link href="/admin/utilisateurs">Administration</Link>}
          </nav>
          <div className="site-session">
            {session ? (
              <>
                <span className="site-user" title={session.email}>
                  {session.email}
                </span>
                <span className="site-role">{session.role}</span>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={deconnexion}
                  disabled={deconnexionEnCours}
                >
                  Déconnexion
                </button>
              </>
            ) : (
              <Link
                className="btn"
                href={`/login?next=${encodeURIComponent(pathname)}`}
              >
                Connexion
              </Link>
            )}
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
