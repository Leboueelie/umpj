"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Zone } from "@/lib/types";
import { tempsMisMin, cumulMin, fmtDuree, parseDureeMinutes, fmtMinToHeure } from "@/lib/calc";
import { moisLabel } from "@/lib/mois";
import { exportFicheZones } from "@/lib/excel";

interface Val { d: string; f: string; p: string; t: string; }

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
  const [recap, setRecap] = useState<{ mois: string; totP: number; totC: number }[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const z = await api<Zone[]>("/api/zones");
        setZones(z);
        const init: Record<string, Val> = {};
        for (const x of z) init[x.id] = { d: "", f: "", p: "", t: "" };
        const rows = await api<any[]>(`/api/zones/entrees?mois=${mois}`);
        for (const r of rows)
          init[r.zoneId] = {
            d: r.heureDebut,
            f: r.heureFin,
            p: String(r.participants),
            t: fmtMinToHeure(r.tempsMis),
          };
        setVals(init);
        const rc = await api<{ mois: string; totP: number; totC: number }[]>("/api/zones/recap");
        setRecap(rc);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [mois]);

  async function exportFiche() {
    try { await exportFicheZones(mois, zones, vals, recap); }
    catch (e) { setError("Échec export : " + (e as Error).message); }
  }

  let totP = 0;
  let totC = 0;
  const lignes = zones.map((z) => {
    const v = vals[z.id] || { d: "", f: "", p: "", t: "" };
    const tm = tempsMisMin(v.d, v.f);
    const direct = parseDureeMinutes(v.t);
    const duree = tm ?? direct;
    const p = parseInt(v.p || "0", 10);
    const aP = p >= 1;
    const manquant = aP && duree === null;
    const cu = duree !== null && aP ? cumulMin(duree, p) : null;
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
                <th>Début</th>
                <th>Fin</th>
                <th>Participant(s)</th>
                <th>Temps mis</th>
                <th>Cumul</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={l.z.id} className={l.manquant ? "manquant" : undefined}>
                  <td className="ncol">{i + 1}</td>
                  <td>{l.z.nom}</td>
                  <td>{l.v.d || "—"}</td>
                  <td>{l.v.f || "—"}</td>
                  <td>{l.v.p || "—"}</td>
                  <td className={l.manquant ? "warn" : undefined}>
                    {l.duree !== null ? fmtDuree(l.duree) : (l.manquant ? "à saisir" : "—")}
                  </td>
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
                <td></td>
                <td></td>
                <td>{totP} participants</td>
                <td></td>
                <td>{fmtDuree(totC)}</td>
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
