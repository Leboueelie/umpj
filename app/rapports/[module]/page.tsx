"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/nav/PageHeader";
import { VueRapport } from "@/components/rapports/VueRapport";
import { MODULES_RAPPORT, type RapportModule } from "@/lib/rapports";

type Phase = "attente" | "chargement" | "pret" | "erreur";

/**
 * Page de consultation d'un rapport de module (API /api/rapports/[module]).
 * Lecture seule. La période est optionnelle sauf si le module l'exige
 * (tous sauf « chambres »).
 */
export default function RapportModulePage() {
  const { module } = useParams<{ module: string }>();
  const router = useRouter();

  const [du, setDu] = useState("");
  const [au, setAu] = useState("");
  const [rapport, setRapport] = useState<RapportModule | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("attente");

  const intitule = MODULES_RAPPORT[module] ?? module;
  const sansPeriode = module === "chambres";

  const charger = useCallback(
    async (pDu: string, pAu: string) => {
      if (!sansPeriode) {
        if ((pDu && !pAu) || (!pDu && pAu)) {
          setErreur("Indiquez les deux bornes (Du et Au) ou aucune.");
          setPhase("erreur");
          return;
        }
        if (pDu && pAu && pDu > pAu) {
          setErreur("La date « Du » doit précéder la date « Au ».");
          setPhase("erreur");
          return;
        }
      }
      setPhase("chargement");
      setErreur(null);
      const params = new URLSearchParams();
      if (pDu) params.set("du", pDu);
      if (pAu) params.set("au", pAu);
      const qs = params.toString();
      try {
        const res = await fetch(
          `/api/rapports/${encodeURIComponent(module)}${qs ? `?${qs}` : ""}`
        );
        if (res.status === 401) {
          router.push(`/login?next=${encodeURIComponent(`/rapports/${module}`)}`);
          return;
        }
        if (!res.ok) {
          const corps = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          setErreur(corps?.error || "Impossible de calculer le rapport.");
          setPhase("erreur");
          return;
        }
        setRapport((await res.json()) as RapportModule);
        setPhase("pret");
      } catch {
        setErreur("Serveur injoignable.");
        setPhase("erreur");
      }
    },
    [module, router, sansPeriode]
  );

  useEffect(() => {
    void charger("", "");
  }, [module, charger]);

  if (!MODULES_RAPPORT[module]) {
    return (
      <main className="wrap">
        <PageHeader titre="Rapport introuvable" />
        <div className="err">
          Aucun rapport nommé « {module} ».{" "}
          <Link href="/rapports">Retour aux rapports</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap">
      <PageHeader
        titre={`Rapport — ${intitule}`}
        sousTitre="Lecture seule — calculé à partir des données de la base"
        actions={
          <Link href="/rapports" className="link-btn">
            &larr; Tous les rapports
          </Link>
        }
      />

      {!sansPeriode && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Période (optionnelle)</h3>
          <div className="filters">
            <label className="field">
              Du
              <input
                type="date"
                value={du}
                onChange={(e) => setDu(e.target.value)}
              />
            </label>
            <label className="field">
              Au
              <input
                type="date"
                value={au}
                onChange={(e) => setAu(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn"
              onClick={() => void charger(du, au)}
              disabled={phase === "chargement"}
            >
              Consulter
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setDu("");
                setAu("");
                void charger("", "");
              }}
              disabled={phase === "chargement"}
            >
              Réinitialiser
            </button>
          </div>
        </div>
      )}

      {phase === "chargement" && <div className="card">Chargement…</div>}
      {phase === "erreur" && erreur && <div className="err">{erreur}</div>}
      {phase === "attente" && !rapport && (
        <div className="card">Sélectionnez une période et cliquez sur Consulter.</div>
      )}
      {rapport && phase === "pret" && <VueRapport rapport={rapport} />}
    </main>
  );
}
