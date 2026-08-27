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
  const [recap, setRecap] = useState<Record<string, { totP: number; totC: number; totT: number }>>({});
  const [error, setError] = useState("");

  async function load() {
    try {
      const ms = await api<string[]>("/api/zones/mois");
      setMoisList(ms);
      const rc = await api<{ mois: string; totP: number; totC: number; totT: number }[]>("/api/zones/recap");
      const map: Record<string, { totP: number; totC: number; totT: number }> = {};
      for (const r of rc) map[r.mois] = { totP: r.totP, totC: r.totC, totT: r.totT || 0 };
      setRecap(map);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    const id = setInterval(() => { load(); }, 20000);
    return () => clearInterval(id);
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
                      ? `${recap[m].totP} participants · ${fmtDuree(recap[m].totT)}`
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

      <div className="card">
        <h3 style={{ margin: "0 0 8px", color: "var(--navy)" }}>Cumul national multi-mois</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Mois</th>
                <th>Total participants</th>
                <th>Total temps mis</th>
                <th>Total cumul</th>
              </tr>
            </thead>
            <tbody>
              {moisList
                .slice()
                .sort((a, b) => a.localeCompare(b))
                .map((m) => (
                  <tr key={m}>
                    <td>{moisLabel(m)}</td>
                    <td>{recap[m]?.totP ?? 0}</td>
                    <td>{fmtDuree(recap[m]?.totT || 0)}</td>
                    <td style={{ color: "var(--muted)" }}>{fmtDuree(recap[m]?.totC || 0)}</td>
                  </tr>
                ))}
              {moisList.length === 0 && (
                <tr><td colSpan={4} className="empty">Aucune donnée enregistrée.</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="total">
                <td>Total général</td>
                <td>{Object.values(recap).reduce((a, r) => a + r.totP, 0)}</td>
                <td>{fmtDuree(Object.values(recap).reduce((a, r) => a + (r.totT || 0), 0))}</td>
                <td style={{ color: "var(--muted)" }}>{fmtDuree(Object.values(recap).reduce((a, r) => a + r.totC, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </main>
  );
}
