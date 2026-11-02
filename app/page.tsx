import Link from "next/link";
import type { Metadata } from "next";
import { getUtilisateurActuel } from "@/lib/auth";

export const metadata: Metadata = {
  title: "UMPJ",
};

const CONSULTATION = [
  {
    href: "/rapports",
    titre: "Rapports",
    desc: "Espace central des rapports : maisons de prière, zones, éditions et autres modules.",
  },
  {
    href: "/banque",
    titre: "Banque des accomplissements",
    desc: "Consultation par période : trois sources indépendantes (maisons de prière, zones, éditions), lecture seule.",
  },
];

const GROUPES_MODULES: {
  titre: string;
  items: { href: string; titre: string; desc: string }[];
}[] = [
  {
    titre: "Saisies récurrentes",
    items: [
      {
        href: "/maison-de-priere",
        titre: "Maisons de prière",
        desc: "Cahiers de temps de prière par église.",
      },
      {
        href: "/chambres",
        titre: "Chambres de prière",
        desc: "Liste des chambres par zone.",
      },
      {
        href: "/zones",
        titre: "Zones",
        desc: "Fiche mensuelle des heures de prière par zone.",
      },
      {
        href: "/zones/fiches",
        titre: "Fiches mensuelles",
        desc: "Toutes les fiches enregistrées par mois.",
      },
      {
        href: "/equipes-priere",
        titre: "Équipes de prière",
        desc: "Sujets de prière et équipes par zone.",
      },
    ],
  },
  {
    titre: "Éditions & événements",
    items: [
      {
        href: "/editions",
        titre: "Éditions",
        desc: "Rapports par édition de l'UMPJ.",
      },
      {
        href: "/sieges-de-priere",
        titre: "Sièges de prière",
        desc: "Sessions par édition, actions de grâce et documents.",
      },
      {
        href: "/nuits-priere",
        titre: "Nuits de prière",
        desc: "Nuits de prière et croisades de jeûne.",
      },
    ],
  },
  {
    titre: "Documents & publications",
    items: [
      {
        href: "/jeune",
        titre: "Jeûne",
        desc: "Documents de jeûne par catégorie.",
      },
      {
        href: "/proclamation",
        titre: "Proclamation",
        desc: "Proclamations par comité et région.",
      },
    ],
  },
];

const ADMINISTRATION = [
  {
    href: "/admin/utilisateurs",
    titre: "Utilisateurs",
    desc: "Comptes, rôles et activation des accès.",
  },
];

function numero(indice: number) {
  return String(indice + 1).padStart(2, "0");
}

function debutGroupe(indice: number) {
  return GROUPES_MODULES.slice(0, indice).reduce(
    (total, g) => total + g.items.length,
    0
  );
}

export default async function Home() {
  let admin = false;
  let connecte = false;
  try {
    const u = await getUtilisateurActuel();
    connecte = !!u;
    admin = u?.role === "ADMIN";
  } catch {
    connecte = false;
    admin = false;
  }

  const groupes = GROUPES_MODULES.map((g, i) => ({
    ...g,
    items: g.items.map((item, j) => ({
      ...item,
      num: numero(debutGroupe(i) + j),
    })),
  }));

  return (
    <main className="accueil-page">
      <header className="accueil-masthead">
        <div className="accueil-identite">
          <img
            src="/logo.png"
            alt="Logo de l'UMPJ"
            width={378}
            height={373}
            className="accueil-logo"
          />
          <div>
            <p className="accueil-kicker">UMPJ</p>
            <h1 className="accueil-titre">
              Université Mondiale de la Prière et du Jeûne
            </h1>
            <span className="accueil-filet" aria-hidden="true" />
            <p className="accueil-chapo">
              {connecte
                ? "Modules de gestion"
                : "Consultation — connectez-vous pour gérer"}
            </p>
          </div>
        </div>

        <section className="accueil-panel" aria-label="Consultation">
          <h2 className="accueil-panel-titre">Consulter</h2>
          <div>
            {CONSULTATION.map((a) => (
              <Link key={a.href} href={a.href} className="accueil-acces">
                <span className="accueil-acces-txt">
                  <strong>{a.titre}</strong>
                  <span className="accueil-acces-desc">{a.desc}</span>
                </span>
                <span className="accueil-chevron" aria-hidden="true">
                  ›
                </span>
              </Link>
            ))}
          </div>
        </section>
      </header>

      <section className="accueil-zone accueil-zone--gerer">
        <h2 className="accueil-rubrique">Gérer</h2>
        <div className="accueil-colonnes">
          {groupes.map((g) => (
            <div className="accueil-col" key={g.titre}>
              <h3 className="accueil-col-titre">{g.titre}</h3>
              <ol className="accueil-liste">
                {g.items.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="accueil-rang">
                      <span className="accueil-num">{item.num}</span>
                      <span className="accueil-rang-txt">
                        <span className="accueil-rang-titre">{item.titre}</span>
                        <span className="accueil-rang-desc">{item.desc}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      {admin ? (
        <section className="accueil-zone">
          <h2 className="accueil-rubrique">Administration</h2>
          <ol className="accueil-liste accueil-liste-admin">
            {ADMINISTRATION.map((a, i) => (
              <li key={a.href}>
                <Link href={a.href} className="accueil-rang">
                  <span className="accueil-num">
                    {numero(GROUPES_MODULES.reduce((n, g) => n + g.items.length, 0) + i)}
                  </span>
                  <span className="accueil-rang-txt">
                    <strong>{a.titre}</strong> — {a.desc}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <p className="accueil-note">
          {connecte
            ? "Votre compte dispose d'un accès en consultation. Utilisez la navigation « Banque des accomplissements »."
            : "Connectez-vous pour accéder aux modules de gestion."}
        </p>
      )}
    </main>
  );
}
