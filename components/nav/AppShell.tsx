"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type SessionShell = {
  email: string;
  nom?: string | null;
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

// Préfixes de route rattachés à la rubrique « Modules » (pour l'état actif).
const PREFIXES_MODULES = [
  "/maison-de-priere",
  "/chambres",
  "/zones",
  "/equipes-priere",
  "/nuits-priere",
  "/sieges-de-priere",
  "/editions",
  "/jeune",
  "/proclamation",
  "/actions-de-grace",
];

type LienNav = {
  href: string;
  libelle: string;
  actif: (pathname: string) => boolean;
};

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
  const [menuOuvert, setMenuOuvert] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);

  const sansHeader = CHEMINS_SANS_HEADER.some(
    (c) => pathname === c || pathname.startsWith(c + "/")
  );

  // Fermeture du menu mobile sur changement de route.
  useEffect(() => {
    setMenuOuvert(false);
  }, [pathname]);

  // Fermeture avec Escape.
  useEffect(() => {
    if (!menuOuvert) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOuvert(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOuvert]);

  // Fermeture au clic extérieur.
  useEffect(() => {
    if (!menuOuvert) return;
    function onClick(e: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setMenuOuvert(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOuvert]);

  // Comportement cohérent au redimensionnement : fermeture en mode bureau.
  useEffect(() => {
    function onResize() {
      if (window.innerWidth > 700) setMenuOuvert(false);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  async function deconnexion() {
    if (deconnexionEnCours) return;
    setDeconnexionEnCours(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setMenuOuvert(false);
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
  const visiteur = !session;

  const liens: LienNav[] = visiteur
    ? [
        { href: "/", libelle: "Accueil", actif: (p) => p === "/" },
      ]
    : admin
      ? [
          { href: "/", libelle: "Accueil", actif: (p) => p === "/" },
          {
            href: "/",
            libelle: "Modules",
            actif: (p) => p !== "/" && PREFIXES_MODULES.some((pr) => p === pr || p.startsWith(pr + "/")),
          },
          { href: "/rapports", libelle: "Rapports", actif: (p) => p === "/rapports" || p.startsWith("/rapports/") },
          { href: "/banque", libelle: "Banque", actif: (p) => p === "/banque" || p.startsWith("/banque/") },
          { href: "/admin/utilisateurs", libelle: "Administration", actif: (p) => p.startsWith("/admin") },
        ]
      : [
          { href: "/banque", libelle: "Banque", actif: (p) => p === "/banque" || p.startsWith("/banque/") },
        ];

  return (
    <>
      <header className={"site-header" + (menuOuvert ? " site-header--menu-open" : "")} ref={headerRef}>
        <div className="site-header-in">
          <Link href="/" className="site-brand">
            <img src="/logo.png" alt="Logo UMPJ" className="site-logo" />
            <span>UMPJ</span>
          </Link>
          <button
            type="button"
            className="site-menu-toggle"
            aria-expanded={menuOuvert}
            aria-controls="site-nav"
            aria-label={menuOuvert ? "Fermer le menu" : "Ouvrir le menu"}
            onClick={() => setMenuOuvert((v) => !v)}
          >
            <span className="site-menu-bar" aria-hidden="true" />
            <span className="site-menu-bar" aria-hidden="true" />
            <span className="site-menu-bar" aria-hidden="true" />
          </button>
          <nav id="site-nav" className="site-nav" aria-label="Navigation principale">
            {liens.map((l) => {
              const actif = l.actif(pathname);
              return (
                <Link
                  key={l.href + l.libelle}
                  href={l.href}
                  aria-current={actif ? "page" : undefined}
                  className={actif ? "is-active" : undefined}
                  onClick={() => setMenuOuvert(false)}
                >
                  {l.libelle}
                </Link>
              );
            })}
          </nav>
          <div className="site-session">
            {session ? (
              <>
                <span className="site-user" title={session.nom || session.email}>
                  {session.nom || session.email}
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
