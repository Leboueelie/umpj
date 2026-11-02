"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { fmtDate, fmtDuree } from "@/lib/calc";
import { api } from "@/lib/api";

// Bilan général des éditions (mission FRONT-18).
// Données : GET /api/editions/stats (lecture seule).
// Les moyennes affichées sont toujours celles ENREGISTRÉES — jamais recalculées ;
// les valeurs calculées sont explicitement labellisées « calculée ».

type BilanEdition = {
  id: string;
  numero: number;
  reference: string;
  dateDebut: string;
  dateFin: string;
  libellePeriode: string;
  moyenneParticipation: number;
  participationsJournalieres: number;
  joursJournaliers: number;
  lignesSessions: number;
  sessionsPriere: number;
  tempsInvestiMinutes: number;
  dureeMoyenneSession: number | null;
  anomaliesSessions: number;
  heuresInvestiesStockees: number;
  heuresIncoherentes: boolean;
  doublonPotentiel: boolean;
};

const CLE_CONTEXTE = "umpj:bilan:vue";

function ordinale(n: number): string {
  return n === 1 ? "1re" : `${n}e`;
}

function periodeCourte(e: BilanEdition): string {
  if (e.libellePeriode) return e.libellePeriode;
  return `${fmtDate(e.dateDebut)} → ${fmtDate(e.dateFin)}`;
}

export default function BilanEditions() {
  const [editions, setEditions] = useState<BilanEdition[] | null>(null);
  const [error, setError] = useState("");
  const [restaure, setRestaure] = useState(false);

  // Filtres (contexte conservé dans l'onglet)
  const [annee, setAnnee] = useState(""); // "" = toutes
  const [debutPeriode, setDebutPeriode] = useState("");
  const [finPeriode, setFinPeriode] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await api<BilanEdition[]>("/api/editions/stats");
        setEditions(
          data.map((e) => ({
            ...e,
            dateDebut: String(e.dateDebut || "").slice(0, 10),
            dateFin: String(e.dateFin || "").slice(0, 10),
          }))
        );
        try {
          const raw = sessionStorage.getItem(CLE_CONTEXTE);
          if (raw) {
            const ctx = JSON.parse(raw) as { annee?: string; debut?: string; fin?: string };
            if (typeof ctx.annee === "string") setAnnee(ctx.annee);
            if (typeof ctx.debut === "string") setDebutPeriode(ctx.debut);
            if (typeof ctx.fin === "string") setFinPeriode(ctx.fin);
          }
        } catch {}
        setRestaure(true);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  useEffect(() => {
    if (!restaure) return;
    try {
      sessionStorage.setItem(CLE_CONTEXTE, JSON.stringify({ annee, debut: debutPeriode, fin: finPeriode }));
    } catch {}
  }, [annee, debutPeriode, finPeriode, restaure]);

  const annees = useMemo(() => {
    const set = new Set<string>();
    for (const e of editions || []) {
      if (/^\d{4}/.test(e.dateDebut)) set.add(e.dateDebut.slice(0, 4));
    }
    return Array.from(set).sort().reverse();
  }, [editions]);

  const filtrees = useMemo(() => {
    const toutes = editions || [];
    return toutes.filter((e) => {
      if (annee && !e.dateDebut.startsWith(annee)) return false;
      // chevauchement de la période saisie avec [dateDebut, dateFin]
      if (debutPeriode && e.dateFin && e.dateFin < debutPeriode) return false;
      if (finPeriode && e.dateDebut && e.dateDebut > finPeriode) return false;
      return true;
    });
  }, [editions, annee, debutPeriode, finPeriode]);

  const resume = useMemo(() => {
    let sessionsPriere = 0;
    let particips = 0;
    let temps = 0;
    let lignesSessions = 0;
    for (const e of filtrees) {
      sessionsPriere += e.sessionsPriere;
      particips += e.participationsJournalieres;
      temps += e.tempsInvestiMinutes;
      lignesSessions += e.lignesSessions;
    }
    const premiere =
      filtrees.length > 0
        ? filtrees.reduce((a, b) => (b.dateDebut < a.dateDebut ? b : a))
        : null;
    const derniere =
      filtrees.length > 0
        ? filtrees.reduce((a, b) => (b.dateFin > a.dateFin ? b : a))
        : null;
    return { sessionsPriere, particips, temps, lignesSessions, premiere, derniere };
  }, [filtrees]);

  const anomalies = useMemo(
    () => filtrees.filter((e) => e.anomaliesSessions > 0 || e.heuresIncoherentes),
    [filtrees]
  );

  const parParticipation = useMemo(
    () =>
      [...filtrees].sort(
        (a, b) =>
          b.moyenneParticipation - a.moyenneParticipation ||
          b.numero - a.numero ||
          a.id.localeCompare(b.id)
      ),
    [filtrees]
  );

  function reinitialiser() {
    setAnnee("");
    setDebutPeriode("");
    setFinPeriode("");
  }

  if (error) {
    return (
      <main className="wrap">
        <Link href="/editions" className="back-link">← Éditions</Link>
        <div className="err" style={{ marginTop: 12 }}>{error}</div>
      </main>
    );
  }

  if (!editions) {
    return (
      <main className="wrap">
        <Link href="/editions" className="back-link">← Éditions</Link>
        <p style={{ color: "var(--muted)" }}>Chargement…</p>
      </main>
    );
  }

  const totalEnregistrees = editions.length;
  const periodeCouverte =
    totalEnregistrees > 0 && resume.premiere && resume.derniere
      ? ` — de ${fmtDate(
          editions.reduce((a, b) => (b.dateDebut < a.dateDebut ? b : a)).dateDebut
        )} à ${fmtDate(editions.reduce((a, b) => (b.dateFin > a.dateFin ? b : a)).dateFin)}`
      : "";

  return (
    <main className="wrap">
      <Link href="/editions" className="back-link">← Éditions</Link>
      <header className="accueil-identite" style={{ marginBottom: 18 }}>
        <img src="/logo.png" alt="" className="accueil-logo" />
        <div>
          <p className="accueil-kicker">Éditions</p>
          <h1 className="accueil-titre">Bilan des éditions</h1>
          <span className="accueil-filet" aria-hidden="true" />
          <p className="accueil-chapo">
            {totalEnregistrees} édition(s) enregistrée(s){periodeCouverte}.
          </p>
        </div>
      </header>

      {/* Filtres */}
      <div className="card">
        <div className="cahiers">
          <div
            className={"cahier-btn" + (annee === "" ? " active" : "")}
            onClick={reinitialiser}
          >
            <span className="nom">Toutes</span>
            <span className="complet">{totalEnregistrees} édition(s)</span>
          </div>
          {annees.map((a) => (
            <div
              key={a}
              className={"cahier-btn" + (a === annee ? " active" : "")}
              onClick={() => setAnnee(a)}
            >
              <span className="nom">{a}</span>
              <span className="complet">
                {(editions || []).filter((e) => e.dateDebut.startsWith(a)).length} édition(s)
              </span>
            </div>
          ))}
        </div>
        <div className="filters" style={{ marginTop: 10 }}>
          <label>
            Du{" "}
            <input
              type="date"
              value={debutPeriode}
              onChange={(e) => setDebutPeriode(e.target.value)}
            />
          </label>
          <label>
            au{" "}
            <input
              type="date"
              value={finPeriode}
              onChange={(e) => setFinPeriode(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="link-btn"
            style={{ width: "auto" }}
            onClick={reinitialiser}
          >
            Réinitialiser
          </button>
        </div>
      </div>

      {/* Vue générale */}
      {filtrees.length === 0 ? (
        <div className="empty">
          {totalEnregistrees === 0
            ? "Aucune édition enregistrée."
            : "Aucune édition pour ces filtres."}
        </div>
      ) : (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Vue générale</h3>
            <div className="periode-resume">
              <span>
                {filtrees.length} édition(s) (sur {totalEnregistrees})
              </span>
              <span>
                Participations journalières :{" "}
                <strong>{resume.particips}</strong>
              </span>
              <span>
                Sessions de prière : <strong>{resume.sessionsPriere}</strong>
              </span>
              <span>
                Temps total investi : <strong>{fmtDuree(resume.temps)}</strong>
              </span>
              <span>
                Première période :{" "}
                <strong>
                  {resume.premiere
                    ? `${ordinale(resume.premiere.numero)} — ${periodeCourte(resume.premiere)}`
                    : "—"}
                </strong>
              </span>
              <span>
                Dernière période :{" "}
                <strong>
                  {resume.derniere
                    ? `${ordinale(resume.derniere.numero)} — ${periodeCourte(resume.derniere)}`
                    : "—"}
                </strong>
              </span>
            </div>
            {anomalies.length > 0 && (
              <div className="note">
                {anomalies.length} édition(s) avec des données à vérifier
                (durées de session manquantes ou heures investies incohérentes) —
                détail dans les tableaux ci-dessous.
              </div>
            )}
          </div>

          {/* Participation */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Participation</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Édition</th>
                    <th>Moyenne générale (enregistrée)</th>
                    <th>Somme journalière</th>
                    <th>Jours de fiche</th>
                  </tr>
                </thead>
                <tbody>
                  {parParticipation.map((e) => (
                    <tr key={e.id}>
                      <td>
                        {ordinale(e.numero)} — {periodeCourte(e)}
                      </td>
                      <td>{e.moyenneParticipation}</td>
                      <td>{e.participationsJournalieres}</td>
                      <td>{e.joursJournaliers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="note">
              Moyennes = valeurs enregistrées à la saisie (jamais recalculées) ;
              « 0 » peut signifier « non renseignée ». Les sommes journalières
              dépendent du nombre de jours de chaque édition : elles ne sont pas
              comparables entre éditions de durées différentes (le total n'est
              pas un nombre de personnes uniques).
            </div>
          </div>

          {/* Investissement dans la prière */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Investissement dans la prière</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Édition</th>
                    <th>Sessions de prière</th>
                    <th>Lignes de session</th>
                    <th>Temps investi</th>
                    <th>Durée moyenne par session (calculée)</th>
                    <th>À vérifier</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrees.map((e) => (
                    <tr key={e.id}>
                      <td>
                        {ordinale(e.numero)} — {periodeCourte(e)}
                      </td>
                      <td>{e.sessionsPriere}</td>
                      <td>{e.lignesSessions}</td>
                      <td>{fmtDuree(e.tempsInvestiMinutes)}</td>
                      <td>
                        {e.dureeMoyenneSession != null
                          ? `${fmtDuree(Math.round(e.dureeMoyenneSession))} (${e.dureeMoyenneSession} min)`
                          : "—"}
                      </td>
                      <td className={e.anomaliesSessions > 0 ? "warn" : undefined}>
                        {e.anomaliesSessions > 0 ? `${e.anomaliesSessions} ligne(s)` : "—"}
                      </td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td>Total</td>
                    <td>{resume.sessionsPriere}</td>
                    <td>{resume.lignesSessions}</td>
                    <td>{fmtDuree(resume.temps)}</td>
                    <td></td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="note">
              « À vérifier » = lignes de session avec durée ou nombre de sessions
              manquants (durées nulles exclues des temps investi et moyennes).
            </div>
          </div>

          {/* Historique comparatif */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Historique comparatif</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Tiers</th>
                    <th>Édition</th>
                    <th>Période</th>
                    <th>Moyenne (enregistrée)</th>
                    <th>Sessions</th>
                    <th>Temps investi</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {[...filtrees]
                    .sort(
                      (a, b) =>
                        b.dateDebut.localeCompare(a.dateDebut) ||
                        b.numero - a.numero ||
                        a.id.localeCompare(b.id)
                    )
                    .map((e, i) => (
                      <tr key={e.id}>
                        <td>{i + 1}</td>
                        <td>
                          {ordinale(e.numero)}
                          {e.doublonPotentiel && (
                            <span className="warn"> — doublon possible</span>
                          )}
                        </td>
                        <td>
                          {e.libellePeriode ? `${e.libellePeriode} (` : ""}
                          {fmtDate(e.dateDebut)} → {fmtDate(e.dateFin)}
                          {e.libellePeriode ? ")" : ""}
                        </td>
                        <td>{e.moyenneParticipation}</td>
                        <td>{e.sessionsPriere}</td>
                        <td>{fmtDuree(e.tempsInvestiMinutes)}</td>
                        <td>
                          <Link href={`/editions/${e.id}`} className="link-btn">
                            Détail →
                          </Link>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
