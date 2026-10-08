"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { SiegePriere } from "@/lib/types";
import { fmtDuree, fmtDate } from "@/lib/calc";
import { useFeedback } from "@/components/Feedback";
import { SiegeForm } from "@/components/SiegeForm";

function isoDay(raw: string): string {
  return raw.split("T")[0];
}

type EditionResume = {
  numeroEdition: number;
  nbSessions: number;
  jours: Set<number>;
  dateMin: string;
  dateMax: string;
  totalParticipants: number;
  totalTempsMis: number;
};

export default function SiegeDePrierePage() {
  const [sieges, setSieges] = useState<SiegePriere[]>([]);
  const [error, setError] = useState("");
  const { toast, node } = useFeedback();

  async function loadSieges() {
    try {
      const r = await fetch("/api/sieges-priere");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setSieges(Array.isArray(data) ? data : []);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    loadSieges();
  }, []);

  const byEdition = new Map<number, EditionResume>();
  for (const s of sieges) {
    const day = isoDay(s.date);
    let e = byEdition.get(s.numeroEdition);
    if (!e) {
      e = {
        numeroEdition: s.numeroEdition,
        nbSessions: 0,
        jours: new Set<number>(),
        dateMin: day,
        dateMax: day,
        totalParticipants: 0,
        totalTempsMis: 0,
      };
      byEdition.set(s.numeroEdition, e);
    }
    e.nbSessions += 1;
    e.jours.add(s.jour);
    e.totalParticipants += s.participants || 0;
    e.totalTempsMis += s.tempsMis || 0;
    if (day < e.dateMin) e.dateMin = day;
    if (day > e.dateMax) e.dateMax = day;
  }
  const editions = [...byEdition.values()].sort(
    (a, b) => b.numeroEdition - a.numeroEdition
  );

  const maxEdition = editions.reduce((m, e) => Math.max(m, e.numeroEdition), 0);
  const maxJour = sieges.reduce((m, s) => Math.max(m, s.jour || 0), 0);

  return (
    <main className="wrap">
      <Link href="/sieges-de-priere" className="back-link">
        ← Les Sièges de Prière
      </Link>
      <header className="app-header">
        <img src="/logo.png" alt="Logo" className="logo" />
        <div className="titles">
          <h1>Siège de Prière</h1>
          <div className="sub">
            {sieges.length} session(s) · {editions.length} édition(s)
          </div>
        </div>
      </header>

      {error && <div className="err">{error}</div>}

      <SiegeForm
        nextEdition={maxEdition || 1}
        nextJour={maxJour + 1}
        onSaved={loadSieges}
        notify={toast}
      />

      <div className="card">
        <div className="table-actions">
          <strong>Éditions</strong>
        </div>
        {editions.length === 0 ? (
          <div className="empty">Aucune édition pour l'instant.</div>
        ) : (
          <div className="cards-grid">
            {editions.map((e) => (
              <Link
                key={e.numeroEdition}
                href={`/sieges-de-priere/siege-de-priere/${e.numeroEdition}`}
                className="section-card"
              >
                <div className="section-title">ÉDITION {e.numeroEdition}</div>
                <div className="section-desc">
                  {e.nbSessions} session(s) · {e.jours.size} jour(s)
                </div>
                <div className="section-desc">
                  {e.dateMin === e.dateMax
                    ? `le ${fmtDate(e.dateMin)}`
                    : `du ${fmtDate(e.dateMin)} au ${fmtDate(e.dateMax)}`}
                </div>
                <div className="section-desc" style={{ fontSize: "0.8rem", marginTop: 4 }}>
                  {e.totalParticipants} participants · {fmtDuree(e.totalTempsMis)}
                </div>
                <span className="section-go">Ouvrir &rarr;</span>
              </Link>
            ))}
          </div>
        )}
      </div>
      {node}
    </main>
  );
}
