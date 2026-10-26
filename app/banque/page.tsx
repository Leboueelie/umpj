"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/nav/PageHeader";
import type { IndexBanque } from "@/lib/banque-api";
import type { RapportBanque } from "@/lib/banque";
import { fmtNombre } from "@/lib/banque";
import { isoToDisplay } from "@/lib/calc";
import { PeriodeBanque } from "@/components/banque/PeriodeBanque";
import { SectionSource, type EtatSection } from "@/components/banque/SectionSource";
import { AnomaliesBanque } from "@/components/banque/AnomaliesBanque";
import {
  LOGIN_BANQUE,
  appelerBanque,
  depasseDeuxAns,
  indicateursEditions,
  indicateursMaisons,
  indicateursZones,
  periodeInitiale,
  urlResume,
  validerPeriodeFr,
  type PeriodeFr,
} from "@/components/banque/logique-banque";

type Phase = "attente" | "chargement" | "pret" | "erreur";

/**
 * Page de consultation de la Banque des accomplissements (mission B4).
 * Lecture seule : GET /api/banque/index puis GET /api/banque/resume.
 * Les agrégats viennent exclusivement du moteur (lib/banque.ts) — aucun
 * recalcul ici, aucune dépendance aux routes réservées aux administrateurs.
 */
export default function BanquePage() {
  const router = useRouter();

  const [index, setIndex] = useState<IndexBanque | null>(null);
  const [errIndex, setErrIndex] = useState<string | null>(null);

  const [du, setDu] = useState("");
  const [au, setAu] = useState("");
  const [choixRequis, setChoixRequis] = useState(false);

  const [rapport, setRapport] = useState<RapportBanque | null>(null);
  const [phase, setPhase] = useState<Phase>("attente");
  const [errConsultation, setErrConsultation] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const initFaite = useRef(false);

  const consulter = useCallback(
    async (periode?: PeriodeFr) => {
      if (enCours) return;
      const candidat = periode ?? { du, au };
      const validation = validerPeriodeFr(candidat.du, candidat.au);
      if (!validation.ok) {
        setErrConsultation(validation.erreur);
        setPhase("erreur");
        return;
      }
      setEnCours(true);
      setErrConsultation(null);
      setPhase("chargement");
      try {
        const res = await appelerBanque<RapportBanque>(urlResume(validation.periode));
        if (!res.ok) {
          if (res.genre === "401") {
            router.push(LOGIN_BANQUE);
            return;
          }
          setErrConsultation(res.message);
          setPhase("erreur");
          return;
        }
        setRapport(res.donnees);
        setPhase("pret");
      } finally {
        setEnCours(false);
      }
    },
    [du, au, enCours, router]
  );

  const chargerIndex = useCallback(async () => {
    setErrIndex(null);
    const res = await appelerBanque<IndexBanque>("/api/banque/index");
    if (!res.ok) {
      if (res.genre === "401") {
        router.push(LOGIN_BANQUE);
        return;
      }
      setErrIndex(res.message);
      return;
    }
    setIndex(res.donnees);
  }, [router]);

  // Initialisation : année civile courante en priorité, repli sur l'index
  // seulement si elle est inexploitable (décision B4 §1.1).
  useEffect(() => {
    if (initFaite.current) return;
    initFaite.current = true;
    const courante = periodeInitiale(null, new Date());
    if (courante) {
      setDu(courante.du);
      setAu(courante.au);
      void consulter(courante);
    } else {
      setChoixRequis(true);
    }
    void chargerIndex();
  }, [consulter, chargerIndex]);

  // Repli sur les bornes de l'index quand aucune période n'est disponible.
  useEffect(() => {
    if (!choixRequis || !index) return;
    const repli = periodeInitiale(index, new Date());
    if (repli) {
      setChoixRequis(false);
      setDu(repli.du);
      setAu(repli.au);
      void consulter(repli);
    }
  }, [choixRequis, index, consulter]);

  function reinitialiser() {
    const parDefaut = periodeInitiale(index, new Date());
    if (parDefaut) {
      setChoixRequis(false);
      setDu(parDefaut.du);
      setAu(parDefaut.au);
      void consulter(parDefaut);
    } else {
      setChoixRequis(true);
      setDu("");
      setAu("");
      setErrConsultation(null);
      setPhase("attente");
      setRapport(null);
    }
  }

  const validationSaisie = validerPeriodeFr(du, au);
  const alerteLongue =
    validationSaisie.ok &&
    depasseDeuxAns(validationSaisie.periode.du, validationSaisie.periode.au);

  const etatSection: EtatSection = rapport
    ? "donnees"
    : phase === "erreur"
      ? "erreur"
      : phase === "chargement"
        ? "chargement"
        : "attente";

  return (
    <main className="wrap">
      <PageHeader
        titre="Banque des accomplissements"
        sousTitre="Consultation par période — lecture seule"
      />

      <div className="card">
        <p style={{ margin: 0, lineHeight: 1.5 }}>
          La Banque rassemble trois sources : <strong>maisons de prière</strong>,{" "}
          <strong>zones</strong> et <strong>éditions</strong>. Les résultats dépendent
          de la période consultée ; chaque source conserve ses propres indicateurs.
          Aucun total général n&apos;est calculé entre modules. Consultation en
          lecture seule.
        </p>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Période</h3>
        <PeriodeBanque
          du={du}
          au={au}
          onDu={setDu}
          onAu={setAu}
          onConsulter={() => void consulter()}
          onReinitialiser={reinitialiser}
          enCours={enCours}
        />
        {choixRequis && (
          <div className="empty" style={{ marginTop: 8 }}>
            Aucune période par défaut disponible : choisissez des dates puis
            cliquez sur Consulter.
          </div>
        )}
        {alerteLongue && (
          <div className="note" style={{ marginTop: 10 }}>
            Cette période dépasse deux ans. Les rapports portent sur les données
            chargées en mémoire : une période longue peut entraîner un chargement
            plus important.
          </div>
        )}
        {errConsultation && (
          <div className="err">
            {errConsultation}
            {rapport && " — le rapport affiché concerne la période précédente."}
            <button className="link-btn" type="button" onClick={() => void consulter()}>
              Réessayer
            </button>
          </div>
        )}
        {errIndex && (
          <div className="err">
            {errIndex} (volumes de la base indisponibles)
            <button className="link-btn" type="button" onClick={() => void chargerIndex()}>
              Réessayer
            </button>
          </div>
        )}
        {index && (
          <div className="periode-resume banque-volumes" style={{ marginTop: 12 }}>
            <span>
              En base : <strong>{fmtNombre(index.maisons.nbLignes)}</strong> lignes
              de maisons (volume global, toutes périodes)
            </span>
            <span>
              <strong>{fmtNombre(index.zones.nbEntrees)}</strong> entrées de zones
            </span>
            <span>
              <strong>{fmtNombre(index.editions.nbEditions)}</strong> éditions
            </span>
          </div>
        )}
        {rapport && (
          <div className="periode-resume banque-volumes">
            <span>
              Période consultée :{" "}
              <strong>{isoToDisplay(rapport.periode.du)}</strong> &rarr;{" "}
              <strong>{isoToDisplay(rapport.periode.au)}</strong>
            </span>
          </div>
        )}
      </div>

      <SectionSource
        titre="Maisons de prière"
        sousTitre="Sessions de prière par date, horaire et participants."
        etat={etatSection}
        nbTotal={rapport?.maisons.nbTotal}
        indicateurs={rapport ? indicateursMaisons(rapport.maisons.agregat) : []}
        retenues={rapport?.maisons.nbRetenues}
        texteVide="Aucune ligne de maison pour cette période."
        messageErreur={errConsultation}
        anomalies={
          rapport && (
            <AnomaliesBanque
              anomaliesA={rapport.maisons.anomaliesDisponibles}
              anomaliesB={rapport.maisons.anomaliesPeriode}
              nonEvaluables={rapport.maisons.nonEvaluables}
            />
          )
        }
      />

      <SectionSource
        titre="Zones"
        sousTitre="Entrées mensuelles de prière par zone, sans noms de zones (lecture restreinte aux agrégats)."
        etat={etatSection}
        nbTotal={rapport?.zones.nbTotal}
        indicateurs={rapport ? indicateursZones(rapport.zones.agregat) : []}
        retenues={rapport?.zones.nbRetenues}
        texteVide="Aucune entrée de zone pour cette période."
        messageErreur={errConsultation}
        anomalies={
          rapport && (
            <AnomaliesBanque
              anomaliesA={rapport.zones.anomaliesDisponibles}
              anomaliesB={rapport.zones.anomaliesPeriode}
              nonEvaluables={rapport.zones.nonEvaluables}
            />
          )
        }
      />

      <SectionSource
        titre="Éditions"
        sousTitre="Données enregistrées par édition (période de l'édition)."
        etat={etatSection}
        nbTotal={rapport?.editions.nbTotal}
        indicateurs={rapport ? indicateursEditions(rapport.editions.agregat) : []}
        retenues={rapport?.editions.nbRetenues}
        texteVide="Aucune édition pour cette période."
        messageErreur={errConsultation}
        anomalies={
          rapport && (
            <AnomaliesBanque
              anomaliesA={rapport.editions.anomaliesDisponibles}
              anomaliesB={rapport.editions.anomaliesPeriode}
              nonEvaluables={rapport.editions.nonEvaluables}
            />
          )
        }
      />
    </main>
  );
}
