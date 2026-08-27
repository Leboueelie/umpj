"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { Zone } from "@/lib/types";
import { cumulMin, fmtDuree, parseDureeMinutes, fmtMinToHeure, formatDureeInput } from "@/lib/calc";
import { MOIS_FR, moisLabel } from "@/lib/mois";
import { exportFicheZones } from "@/lib/excel";

interface Val { p: string; t: string; }

async function api<T = any>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur serveur");
  return data as T;
}

function anneesDispo(): string[] {
  const y = new Date().getFullYear();
  const out: string[] = [];
  for (let a = y - 10; a <= y + 10; a++) out.push(String(a));
  return out;
}

export default function FicheMoisDetail() {
  const params = useParams();
  const router = useRouter();
  const mois = String(params.mois || "");
  const moisRef = useRef(mois);
  moisRef.current = mois;
  const draftKey = (m: string) => "umpj:fiche:" + m;

  const [zones, setZones] = useState<Zone[]>([]);
  const [vals, setVals] = useState<Record<string, Val>>({});
  const [recap, setRecap] = useState<{ mois: string; totP: number; totC: number; totT: number }[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const baselineRef = useRef<Record<string, Val>>({});

  function sameVal(a: Val, b?: Val) {
    return !!b && a.p === b.p && a.t === b.t;
  }

  async function load() {
    try {
      const z = await api<Zone[]>("/api/zones");
      setZones(z);
      const init: Record<string, Val> = {};
      for (const x of z) init[x.id] = { p: "", t: "" };
      const rows = await api<any[]>(`/api/zones/entrees?mois=${mois}`);
      for (const r of rows)
        init[r.zoneId] = { p: String(r.participants), t: fmtMinToHeure(r.tempsMis) };
      // restaure le brouillon non enregistre (survit a un F5 / changement de mois)
      try {
        const raw = localStorage.getItem(draftKey(mois));
        if (raw) {
          const draft = JSON.parse(raw) as Record<string, Val>;
          for (const id of Object.keys(draft)) if (init[id]) init[id] = draft[id];
        }
      } catch {}
      setVals(init);
      baselineRef.current = init;
      const rc = await api<{ mois: string; totP: number; totC: number; totT: number }[]>("/api/zones/recap");
      setRecap(rc);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function setVal(zoneId: string, patch: Partial<Val>) {
    setVals((v) => {
      const nv = { ...v, [zoneId]: { ...(v[zoneId] || { p: "", t: "" }), ...patch } };
      try { localStorage.setItem(draftKey(moisRef.current), JSON.stringify(nv)); } catch {}
      return nv;
    });
    setSaved(false);
  }

  // Rafraichissement automatique sans ecraser la saisie en cours
  async function pollSilent() {
    const m = moisRef.current;
    try {
      const rows = await api<any[]>(`/api/zones/entrees?mois=${m}`);
      const server: Record<string, Val> = {};
      for (const r of rows) server[r.zoneId] = { p: String(r.participants), t: fmtMinToHeure(r.tempsMis) };
      setVals((prev) => {
        const next: Record<string, Val> = {};
        const ids = new Set([...Object.keys(prev), ...Object.keys(server)]);
        for (const id of ids) {
          const cur = prev[id] || { p: "", t: "" };
          const base = baselineRef.current[id];
          const srv = server[id] || { p: "", t: "" };
          next[id] = sameVal(cur, base) ? srv : cur;
        }
        return next;
      });
      baselineRef.current = server;
      const rc = await api<{ mois: string; totP: number; totC: number; totT: number }[]>("/api/zones/recap");
      setRecap(rc);
    } catch {}
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [mois]);

  useEffect(() => {
    const id = setInterval(() => { pollSilent(); }, 20000);
    return () => clearInterval(id);
  }, []);

  async function save() {
    setSaving(true); setError(""); setSaved(false);
    try {
      const entrees = zones.map((z) => ({
        zoneId: z.id,
        tempsMis: vals[z.id]?.t || "",
        participants: parseInt(vals[z.id]?.p || "0", 10),
      }));
      await api("/api/zones/entrees", {
        method: "POST",
        body: JSON.stringify({ mois, entrees }),
      });
      try { localStorage.removeItem(draftKey(mois)); } catch {}
      baselineRef.current = { ...vals };
      setSaved(true);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function exportFiche() {
    try { await exportFicheZones(mois, zones, vals, recap); }
    catch (e) { setError("Échec export : " + (e as Error).message); }
  }

  function changeMois(part: "m" | "y", value: string) {
    const [y, m] = mois.split("-");
    const ny = part === "y" ? value : y;
    const nm = part === "m" ? String(value).padStart(2, "0") : m;
    router.replace(`/zones/fiche/${ny}-${nm}`);
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
        <div className="month-nav">
          <select
            value={Number(mois.slice(5, 7))}
            onChange={(e) => changeMois("m", e.target.value)}
            aria-label="Mois"
          >
            {MOIS_FR.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={mois.slice(0, 4)}
            onChange={(e) => changeMois("y", e.target.value)}
            aria-label="Année"
          >
            {anneesDispo().map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <Link href={`/zones?mois=${mois}`} className="link-btn">Import / gestion →</Link>
        </div>

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
                    <input type="text" inputMode="numeric" placeholder="02:00" value={l.v.t}
                      onChange={(e) => setVal(l.z.id, { t: formatDureeInput(e.target.value) })} />
                  </td>
                  <td>
                    <input type="number" min="1" value={l.v.p}
                      onChange={(e) => setVal(l.z.id, { p: e.target.value })} />
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
                <td>{fmtDuree(totT)}</td>
                <td>{totP} participants</td>
                <td style={{ color: "var(--muted)" }}>{fmtDuree(totC)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="form-actions" style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={save} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button className="btn secondary" type="button" onClick={exportFiche}>Export Excel</button>
          {saved && <span className="note">Fiche enregistrée.</span>}
        </div>
        {error && <div className="err">{error}</div>}
      </div>
    </main>
  );
}
