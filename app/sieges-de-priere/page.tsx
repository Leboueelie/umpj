import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Les Sièges de Prière - UMPJ",
};

const features = [
  {
    href: "/sieges-de-priere/actions-de-grace",
    title: "ACTIONS DE GRÂCE",
    desc: "Upload, téléchargement et impression de fichiers PDF par comité et région.",
  },
  {
    href: "/sieges-de-priere/siege-de-priere",
    title: "SIÈGE DE PRIÈRE",
    desc: "Enregistrement et consultation par édition des sessions de siège de prière : jour, orateur, date, horaires et participants.",
  },
];

export default function SiegesDePrierePage() {
  return (
    <main className="wrap">
      <Link href="/" className="back-link">← Accueil</Link>
      <header className="accueil-identite" style={{ marginBottom: 18 }}>
        <img src="/logo.png" alt="" className="accueil-logo" />
        <div>
          <p className="accueil-kicker">Sièges de Prière</p>
          <h1 className="accueil-titre">Les Sièges de Prière</h1>
          <span className="accueil-filet" aria-hidden="true" />
          <p className="accueil-chapo">Gestion des sièges de prière</p>
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
