"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/fiches", label: "Tableau de bord", num: "01" },
  { href: "/fiches/produits", label: "Produits", num: "02" },
  { href: "/fiches/productions", label: "Productions", num: "03" },
  { href: "/fiches/ventes", label: "Ventes", num: "04" },
  { href: "/fiches/statistiques", label: "Statistiques", num: "05" },
];

export function FichesHeader({
  titre,
  chapo,
}: {
  titre: string;
  chapo: string;
}) {
  const pathname = usePathname();

  return (
    <>
      <Link href="/" className="back-link">← Accueil</Link>
      <header className="accueil-identite fiches-masthead" style={{ marginBottom: 0 }}>
        <img src="/logo.png" alt="" className="accueil-logo" />
        <div>
          <p className="accueil-kicker">Productions & Ventes</p>
          <h1 className="accueil-titre">{titre}</h1>
          <span className="accueil-filet" aria-hidden="true" />
          <p className="accueil-chapo">{chapo}</p>
        </div>
      </header>

      <nav className="fiches-tabs" aria-label="Navigation du module fiches">
        {TABS.map((t) => {
          const actif = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`fiches-tab${actif ? " actif" : ""}`}
              aria-current={actif ? "page" : undefined}
            >
              <span className="fiches-tab-num">{t.num}</span>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
