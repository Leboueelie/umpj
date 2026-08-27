"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Zone } from "@/lib/types";
import { cumulMin, fmtDuree, parseDureeMinutes, fmtMinToHeure } from "@/lib/calc";
import { moisLabel } from "@/lib/mois";
import { exportFicheZones } from "@/lib/excel";

interface Val { p: string; t: string; }

async function api<T = any>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur serveur");
  return data as T;
}

export default function FicheMoisDetail() {
  const params = useParams();
  const mois = String(params.mois || "");
  const [zones, setZones] = useState<Zone[]>([]);
  const [vals, setVals] = useState<Record<string, Val>>({});
  const [recap, setRecap] = useState<{ mois: string; totP: number; totC: number; totT: number }[]>([]);
  const [error, setError] = useState("");

  async function load() {
    try {
      const z = await api<Zone[]>("/api/zones");
      setZones(z);
      const init: Record<string, Val> = {};
      for (const x of z) init[x.id] = { p: "", t: "" };
      const rows = await api<any[]>(`/api/zones/entrees?mois=${mois}`);
      for (const r of rows)
        init[r.zoneId] = {
          p: String(r.participants),
          t: fmtMinToHeure(r.tempsMis),
        };
      setVals(init);
      const rc = await api<{ mois: string; totP: number; totC: number; totT: number }[]>("/api/zones/recap");
      setRecap(rc);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [mois]);

  useEffect(() => {
    const id = setInterval(() => { load(); }, 20000);
    return () => clearInterval(id);
  }, [mois]);

  async function exportFiche() {
    try { await exportFicheZones(mois, zones, vals, recap); }
    catch (e) { setError("Échec export : " + (e as Error).message); }
  }

  let totP = 0;
  let totC = 0;
  let totT = 0;
  const lignes = zones.map((z) => {
    const v = vals[z.id] || { p: "", t: "" };
    const duree = parseDureeMinutes(v.t);
    const p = parseInt(v.p || "0", 10);
    const aP = p >= 1;
    const manquant = aP && duree === null;
    const cu = duree !== null && aP ? cumulMin(duree, p) : null;
    if (duree !== null) totT += duree;
    if (aP) totP += p;
    if (cu) totC += cu;
    return { z, v, duree, manquant, cu };
  });

  return (
    <main className="wrap">
      <Link href="/zones/fiches" className="back-link">← Toutes les fiches</Link>
      <header className="app-header">
        <img src="/logo.png" alt="Logo UMPJ" className="logo" />
        <div className="titles">
          <h1>Fiche complète — {moisLabel(mois)}</h1>
          <div className="sub">Par zone / région spirituelle</div>
        </div>
      </header>

      <div className="card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th className="ncol">N°</th>
                <th>Zone</th>
                <th>Temps mis</th>
                <th>Participant(s)</th>
                <th>Cumul</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={l.z.id} className={l.manquant ? "manquant" : undefined}>
                  <td className="ncol">{i + 1}</td>
                  <td>{l.z.nom}</td>
                  <td className={l.manquant ? "warn" : undefined}>
                    {l.duree !== null ? fmtDuree(l.duree) : (l.manquant ? "à saisir" : "—")}
                  </td>
                  <td>{l.v.p || "—"}</td>
                  <td className={l.manquant ? "warn" : undefined}>
                    {l.cu !== null ? fmtDuree(l.cu) : (l.manquant ? "à saisir" : "—")}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="total">
                <td></td>
                <td>Total national</td>
                <td>{fmtDuree(totT)}</td>
                <td>{totP} participants</td>
                <td style={{ color: "var(--muted)" }}>{fmtDuree(totC)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="form-actions" style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn secondary" type="button" onClick={exportFiche}>Export Excel</button>
        </div>
        {error && <div className="err">{error}</div>}
        <p className="note">
          Pour modifier cette fiche, ouvrez la <Link href={`/zones?mois=${mois}`}>page du mois</Link>.
        </p>
      </div>
    </main>
  );
}
