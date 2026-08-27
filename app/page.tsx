import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "UMPJ",
};

const sections = [
  {
    href: "/maison-de-priere",
    title: "MAISON DE PRIERE D'ABIDJAN POUR TOUTES LES NATIONS",
    desc: "Registres de temps de prière par cahier / église.",
  },
  {
    href: "/zones",
    title: "Fiche mensuelle des heures de prière par zone",
    desc: "Saisie par zone / région spirituelle, cumul national automatique.",
  },
  {
    href: "/zones/fiches",
    title: "Liste des fiches mensuelles",
    desc: "Toutes les fiches enregistrées par mois, cliquables (vue complète).",
  },
];

export default function Home() {
  return (
    <main className="wrap">
      <header className="app-header">
        <img src="/logo.png" alt="Logo UMPJ" className="logo" />
        <div className="titles">
          <h1>Université Mondiale de la Prière et du Jeûne</h1>
          <div className="sub">UMPJ</div>
        </div>
      </header>

      <div className="cards-grid">
        {sections.map((s) => (
          <Link key={s.href} href={s.href} className="section-card">
            <div className="section-title">{s.title}</div>
            <div className="section-desc">{s.desc}</div>
            <span className="section-go">Ouvrir &rarr;</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
