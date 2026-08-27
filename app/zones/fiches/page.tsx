"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { moisLabel } from "@/lib/mois";
import { fmtDuree } from "@/lib/calc";

async function api<T = any>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur serveur");
  return data as T;
}

const GROUPES = [
  { key: "abidjan" as const, label: "Chambre de prière d'Abidjan" },
  { key: "interieur" as const, label: "Chambres de prière intérieur" },
];

export default function ListeFiches() {
  const [moisList, setMoisList] = useState<string[]>([]);
  const [recap, setRecap] = useState<Record<string, { totP: number; totC: number; totT: number }>>({});
  const [groupes, setGroupes] = useState<Record<string, { totP: number; totT: number }>>({});
  const [config, setConfig] = useState<{ chambresAbidjan: number; chambresInterieur: number }>({
    chambresAbidjan: 0,
    chambresInterieur: 0,
  });
  const [error, setError] = useState("");

  async function chargerMoisRecaps() {
    const ms = await api<string[]>("/api/zones/mois");
    setMoisList(ms);
    const rc = await api<{ mois: string; totP: number; totC: number; totT: number }[]>("/api/zones/recap");
    const map: Record<string, { totP: number; totC: number; totT: number }> = {};
    for (const r of rc) map[r.mois] = { totP: r.totP, totC: r.totC, totT: r.totT || 0 };
    setRecap(map);
  }
  async function chargerGroupes() {
    const g = await api<Record<string, { totP: number; totT: number }>>("/api/zones/groupes");
    setGroupes(g);
  }
  async function chargerConfig() {
    const c = await api<{ chambresAbidjan: number; chambresInterieur: number }>("/api/zones/config");
    setConfig(c);
  }

  async function load() {
    try {
      await Promise.all([chargerMoisRecaps(), chargerGroupes(), chargerConfig()]);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function poll() {
    try {
      await Promise.all([chargerMoisRecaps(), chargerGroupes()]);
    } catch {}
  }

  async function supprimerMois(m: string) {
    if (!confirm(`Supprimer la fiche de ${moisLabel(m)} (toutes les zones) ?`))
      return;
    try {
      await api(`/api/zones/entrees?mois=${m}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    const id = setInterval(() => { poll(); }, 20000);
    return () => clearInterval(id);
  }, []);

  function onChangeChambres(key: "abidjan" | "interieur", val: string) {
    const n = parseInt(val || "0", 10) || 0;
    const patch = key === "abidjan" ? { chambresAbidjan: n } : { chambresInterieur: n };
    setConfig((c) => ({ ...c, ...patch }));
    api("/api/zones/config", { method: "PUT", body: JSON.stringify(patch) }).catch(() => {});
  }

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
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Link href={`/zones/fiche/${m}`} className="fiche-lien" style={{ flex: 1 }}>
                    <span className="mois">{moisLabel(m)}</span>
                    <span className="tot">
                      {recap[m]
                        ? `${recap[m].totP} participants · ${fmtDuree(recap[m].totT)}`
                        : "—"}
                    </span>
                  </Link>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => supprimerMois(m)}
                  >
                    Supprimer
                  </button>
                </div>
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
        <h3 style={{ margin: "0 0 12px", color: "var(--navy)" }}>Groupes de prière</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {GROUPES.map((g) => {
            const grp = groupes[g.key] || { totP: 0, totT: 0 };
            const chambres = g.key === "abidjan" ? config.chambresAbidjan : config.chambresInterieur;
            return (
              <div key={g.key} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{g.label}</div>
                <div style={{ marginBottom: 4 }}>Total participants : <b>{grp.totP}</b></div>
                <div style={{ marginBottom: 10 }}>
                  Prière investie (temps mis) : <b>{fmtDuree(grp.totT)}</b>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem" }}>
                  Chambres :
                  <input
                    type="number"
                    min="0"
                    value={chambres}
                    onChange={(e) => onChangeChambres(g.key, e.target.value)}
                    style={{ width: 90, padding: "4px 6px" }}
                  />
                </label>
              </div>
            );
          })}
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
