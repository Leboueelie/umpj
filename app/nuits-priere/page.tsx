import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nuits de Prière - UMPJ",
};

const features = [
  {
    href: "/nuits-priere/nuit-de-priere",
    title: "NUIT DE PRIÈRE",
    desc: "Sessions de nuit de prière par catégorie (vendredi, mardi, autre) : date, horaires, participants, durée et volume.",
  },
  {
    href: "/nuits-priere/croisade",
    title: "CROISADE DE JEÛNE ET PRIÈRE POUR LE MINISTÈRE",
    desc: "Sessions de croisade : date, horaires, orateur, coordinateur et effectifs par service (Frère/Sœur, Accueil, Semeurs, Secrétariat, Sono, Âmes, RTVC).",
  },
];

export default function NuitsDePrierePage() {
  return (
    <main className="wrap">
      <Link href="/" className="back-link">← Accueil</Link>
      <header className="accueil-identite" style={{ marginBottom: 18 }}>
        <img src="/logo.png" alt="" className="accueil-logo" />
        <div>
          <p className="accueil-kicker">Nuits de Prière</p>
          <h1 className="accueil-titre">Les Nuits de Prière</h1>
          <span className="accueil-filet" aria-hidden="true" />
          <p className="accueil-chapo">Gestion des nuits de prière</p>
        </div>
      </header>

      <div className="cards-grid">
        {features.map((f) => (
          <Link key={f.href} href={f.href} className="section-card">
            <div className="section-title">{f.title}</div>
            <div className="section-desc">{f.desc}</div>
            <span className="section-go">Ouvrir &rarr;</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
