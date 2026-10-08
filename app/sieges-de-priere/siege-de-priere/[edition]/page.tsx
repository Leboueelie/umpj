"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { SiegePriere } from "@/lib/types";
import { fmtDuree, fmtDate } from "@/lib/calc";
import { useFeedback } from "@/components/Feedback";
import { SiegeForm } from "@/components/SiegeForm";

function isoDay(raw: string): string {
  return raw.split("T")[0];
}

type EditionItem = { numeroEdition: number; nbSessions: number };

export default function SiegeEditionPage() {
  const params = useParams();
  const router = useRouter();
  const rawEdition = String(
    (Array.isArray(params.edition) ? params.edition[0] : params.edition) ?? ""
  );
  const edition = /^\d+$/.test(rawEdition) ? parseInt(rawEdition, 10) : 0;

  const [sieges, setSieges] = useState<SiegePriere[]>([]);
  const [editions, setEditions] = useState<EditionItem[]>([]);
  const [error, setError] = useState("");
  const { confirm, toast, node } = useFeedback();

  async function loadSieges() {
    if (!edition) return;
    try {
      const r = await fetch(`/api/sieges-priere?edition=${edition}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setSieges(Array.isArray(data) ? data : []);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function loadEditions() {
    try {
      const r = await fetch("/api/sieges-priere/editions");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setEditions(Array.isArray(data) ? data : []);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function reload() {
    await Promise.all([loadSieges(), loadEditions()]);
  }

  useEffect(() => {
    reload();
  }, [edition]);

  function goToEdition(n: number) {
    router.push(`/sieges-de-priere/siege-de-priere/${n}`);
  }

  async function deleteSiege(id: string, jour: number) {
    if (!(await confirm(`Supprimer la session du jour ${jour} ?`))) return;
    try {
      const r = await fetch(`/api/sieges-priere/${id}`, { method: "DELETE" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      toast("Session supprimée.", "success");
      await reload();
    } catch (e) {
      setError((e as Error).message);
      toast((e as Error).message, "error");
    }
  }

  const nbJours = new Set(sieges.map((s) => s.jour)).size;
  const totalParticipants = sieges.reduce((m, s) => m + (s.participants || 0), 0);
  const totalTempsMis = sieges.reduce((m, s) => m + (s.tempsMis || 0), 0);
  const maxJour = sieges.reduce((m, s) => Math.max(m, s.jour || 0), 0);

  const asc = [...editions].sort((a, b) => a.numeroEdition - b.numeroEdition);
  const idx = asc.findIndex((e) => e.numeroEdition === edition);
  const prevEdition = idx > 0 ? asc[idx - 1].numeroEdition : 0;
  const nextEdition =
    idx >= 0 && idx < asc.length - 1 ? asc[idx + 1].numeroEdition : 0;
  const selectEditions =
    idx === -1
      ? [{ numeroEdition: edition, nbSessions: sieges.length }, ...editions]
      : editions;

  if (!edition) {
    return (
      <main className="wrap">
        <Link href="/sieges-de-priere/siege-de-priere" className="back-link">
          ← Toutes les éditions
        </Link>
        <div className="err">Numéro d&apos;édition invalide.</div>
      </main>
    );
  }

  return (
    <main className="wrap">
      <Link href="/sieges-de-priere/siege-de-priere" className="back-link">
        ← Toutes les éditions
      </Link>
      <header className="app-header">
        <img src="/logo.png" alt="Logo" className="logo" />
        <div className="titles">
          <h1>Siège de Prière — Édition {edition}</h1>
          <div className="sub">
            {sieges.length} session(s) · {nbJours} jour(s) · {totalParticipants}{" "}
            participants · {fmtDuree(totalTempsMis)}
          </div>
        </div>
      </header>

      <div className="month-nav">
        <button
          type="button"
          className="step-btn"
          disabled={!prevEdition}
          style={!prevEdition ? { opacity: 0.4, cursor: "default" } : undefined}
          onClick={() => prevEdition && goToEdition(prevEdition)}
          aria-label="Édition précédente"
        >
          ‹
        </button>
        <select
          value={edition}
          onChange={(e) => goToEdition(parseInt(e.target.value, 10))}
          aria-label="Changer d'édition"
        >
          {selectEditions.map((e) => (
            <option key={e.numeroEdition} value={e.numeroEdition}>
              Édition {e.numeroEdition} ({e.nbSessions} session(s))
            </option>
          ))}
        </select>
        <button
          type="button"
          className="step-btn"
          disabled={!nextEdition}
          style={!nextEdition ? { opacity: 0.4, cursor: "default" } : undefined}
          onClick={() => nextEdition && goToEdition(nextEdition)}
          aria-label="Édition suivante"
        >
          ›
        </button>
        <Link href="/sieges-de-priere/siege-de-priere" className="link-btn">
          Toutes les éditions →
        </Link>
      </div>

      {error && <div className="err">{error}</div>}

      <SiegeForm
        numeroEditionFixe={edition}
        nextJour={maxJour + 1}
        onSaved={reload}
        notify={toast}
        titre={`Ajouter à l'édition ${edition}`}
      />

      <div className="card">
        <div className="table-actions">
          <strong>Contenu de l&apos;édition {edition}</strong>
        </div>
        {sieges.length === 0 ? (
          <div className="empty">Aucune session dans cette édition.</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Jour n°</th>
                  <th>Nom</th>
                  <th>Orateur</th>
                  <th>Date</th>
                  <th>Période</th>
                  <th>Participants</th>
                  <th>Temps Mis</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sieges.map((s, i) => (
                  <tr key={s.id}>
                    <td>{i + 1}</td>
                    <td>{s.jour}</td>
                    <td>{s.nom}</td>
                    <td>{s.orateur}</td>
                    <td>{fmtDate(isoDay(s.date))}</td>
                    <td>{`${s.heureDebut} - ${s.heureFin}`}</td>
                    <td>{s.participants}</td>
                    <td>{fmtDuree(s.tempsMis)}</td>
                    <td>
                      <button
                        className="del-line"
                        onClick={() => deleteSiege(s.id, s.jour)}
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="total">
                  <td colSpan={6}>Total : {sieges.length} session(s)</td>
                  <td>{totalParticipants}</td>
                  <td>{fmtDuree(totalTempsMis)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
      {node}
    </main>
  );
}
