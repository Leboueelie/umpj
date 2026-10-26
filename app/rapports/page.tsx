import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/nav/PageHeader";
import { getUtilisateurActuel } from "@/lib/auth";
import { MODULES_RAPPORT } from "@/lib/rapports";

export const metadata: Metadata = {
  title: "Rapports - UMPJ",
};

const BANQUE = {
  href: "/banque",
  titre: "Banque des accomplissements",
  desc: "Maisons de prière, zones et éditions — consultation par période explicite, trois sources indépendantes, anomalies signalées. Accès ADMIN et LECTEUR.",
};

const MODULES: { id: string; desc: string }[] = [
  {
    id: "equipes",
    desc: "Équipes de prière : sessions, participants cumulés, durée cumulée. Période = recouvrement des plages dateDebut/dateFin.",
  },
  {
    id: "nuits",
    desc: "Nuits de prière : sessions, participants, durée et volume en heure-personnes (champ enregistré). Découpage par catégorie.",
  },
  {
    id: "croisades",
    desc: "Croisades de jeûne et prière : sessions, effectif cumulé, durée cumulée. Contrôle de cohérence des rôles.",
  },
  {
    id: "sieges",
    desc: "Sièges de prière : sessions, éditions distinctes, participants et durée. Détail par numéro d'édition.",
  },
  {
    id: "documents",
    desc: "Documents (jeûne, proclamations, actions de grâce) : fichiers et taille par catégorie. Période = date d'import.",
  },
  {
    id: "chambres",
    desc: "Chambres de prière : total, actives et inactives par zone. Sans période (aucune date par chambre).",
  },
];

export default async function RapportsHubPage() {
  let admin = false;
  try {
    const u = await getUtilisateurActuel();
    admin = u?.role === "ADMIN";
  } catch {
    admin = false;
  }

  return (
    <main className="wrap">
      <PageHeader
        titre="Rapports"
        sousTitre="Choisissez un module — chaque rapport indique sa source, sa période et ses limites"
      />

      <section className="home-section">
        <h3>Consultation agrégée</h3>
        <div className="home-list">
          <Link href={BANQUE.href} className="home-item">
            <strong>{BANQUE.titre}</strong>
            <span>{BANQUE.desc}</span>
          </Link>
        </div>
      </section>

      {admin ? (
        <section className="home-section">
          <h3>Rapports par module</h3>
          <div className="home-list">
            {MODULES.map((m) => (
              <Link key={m.id} href={`/rapports/${m.id}`} className="home-item">
                <strong>{MODULES_RAPPORT[m.id]}</strong>
                <span>{m.desc}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <div className="note">
          Votre compte dispose d&apos;un accès en consultation : utilisez la Banque
          des accomplissements. Les rapports de gestion sont réservés aux
          administrateurs.
        </div>
      )}
    </main>
  );
}
