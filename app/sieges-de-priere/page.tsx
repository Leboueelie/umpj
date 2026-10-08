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
      <Link href="/" className="back-link">
        ← Accueil
      </Link>
      <header className="app-header">
        <img src="/logo.png" alt="Logo UMPJ" className="logo" />
        <div className="titles">
          <h1>Les Sièges de Prière</h1>
          <div className="sub">Gestion des sièges de prière</div>
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
