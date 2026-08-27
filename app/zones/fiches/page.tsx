"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { moisLabel } from "@/lib/mois";
import { fmtDuree } from "@/lib/calc";

async function api<T = any>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur serveur");
  return data as T;
}

export default function ListeFiches() {
  const [moisList, setMoisList] = useState<string[]>([]);
  const [recap, setRecap] = useState<Record<string, { totP: number; totC: number }>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const ms = await api<string[]>("/api/zones/mois");
        setMoisList(ms);
        const rc = await api<{ mois: string; totP: number; totC: number }[]>("/api/zones/recap");
        const map: Record<string, { totP: number; totC: number }> = {};
        for (const r of rc) map[r.mois] = { totP: r.totP, totC: r.totC };
        setRecap(map);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  return (
    <main className="wrap">
      <Link href="/" className="back-link">← Accueil</Link>
      <header className="app-header">
        <img src="/logo.png" alt="Logo UMPJ" className="logo" />
        <div className="titles">
          <h1>Fiches mensuelles</h1>
          <div className="sub">Par zone / région spirituelle</div>
        </div>
      </header>

      <div className="card">
        {moisList.length === 0 ? (
          <div className="empty">Aucune fiche enregistrée.</div>
        ) : (
          <ul className="fiches-list">
            {moisList.map((m) => (
              <li key={m}>
                <Link href={`/zones/fiche/${m}`} className="fiche-lien">
                  <span className="mois">{moisLabel(m)}</span>
                  <span className="tot">
                    {recap[m]
                      ? `${recap[m].totP} participants · ${fmtDuree(recap[m].totC)}`
                      : "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {error && <div className="err">{error}</div>}
        <div style={{ marginTop: 12 }}>
          <Link href="/zones" className="link-btn">Ouvrir la fiche du mois courant →</Link>
        </div>
      </div>
    </main>
  );
}
