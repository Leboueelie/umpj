"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { Zone } from "@/lib/types";
import { cumulMin, fmtDuree, parseDureeMinutes, fmtMinToHeure, formatDureeInput } from "@/lib/calc";
import { MOIS_FR, moisLabel } from "@/lib/mois";
import { exportFicheZones } from "@/lib/excel";
import { useFeedback } from "@/components/Feedback";
import { api } from "@/lib/api";

interface Val { p: string; t: string; }

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
  const [mode, setMode] = useState<"lecture" | "edition">("lecture");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [moveY, setMoveY] = useState(mois.slice(0, 4));
  const [moveM, setMoveM] = useState(mois.slice(5, 7));
  const [moving, setMoving] = useState(false);
  const baselineRef = useRef<Record<string, Val>>({});
  const { confirm, toast, node } = useFeedback();

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
      if (mode === "edition") {
        try {
          const raw = localStorage.getItem(draftKey(mois));
          if (raw) {
            const draft = JSON.parse(raw) as Record<string, Val>;
            for (const id of Object.keys(draft)) if (init[id]) init[id] = draft[id];
          }
        } catch {}
      }
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
      setMode("lecture");
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  function annuler() {
    try { localStorage.removeItem(draftKey(mois)); } catch {}
    setMode("lecture");
    load();
  }

  async function exportFiche() {
    try { await exportFicheZones(mois, zones, vals, recap); }
    catch (e) { setError("Échec export : " + (e as Error).message); }
  }

  function exporterPdf() {
    setExportingPdf(true);
    const titrePrecedent = document.title;
    document.title = `UMPJ-fiche-zones-${mois}`;
    try {
      window.print();
    } catch (e) {
      setError("Échec de l'export PDF : " + (e as Error).message);
      toast((e as Error).message, "error");
    } finally {
      document.title = titrePrecedent;
      setExportingPdf(false);
    }
  }

  async function supprimerZone(zoneId: string) {
    if (!(await confirm("Supprimer l'entrée de cette zone pour ce mois ?"))) return;
    try {
      await api(`/api/zones/entrees?mois=${mois}&zoneId=${zoneId}`, { method: "DELETE" });
      toast("Entrée supprimée.", "success");
      setVals((v) => ({ ...v, [zoneId]: { p: "", t: "" } }));
      baselineRef.current = { ...baselineRef.current, [zoneId]: { p: "", t: "" } };
      await load();
    } catch (e) {
      setError((e as Error).message);
      toast((e as Error).message, "error");
    }
  }

  async function supprimerFiche() {
    if (!(await confirm(`Supprimer la fiche de ${moisLabel(mois)} (toutes les zones) ?`)))
      return;
    try {
      await api(`/api/zones/entrees?mois=${mois}&all=true`, { method: "DELETE" });
      toast("Fiche supprimée.", "success");
      router.push("/zones/fiches");
    } catch (e) {
      setError((e as Error).message);
      toast((e as Error).message, "error");
    }
  }

  function changeMois(part: "m" | "y", value: string) {
    const [y, m] = mois.split("-");
    if (!y || !m) return;
    const ny = part === "y" ? value : y;
    const nm = part === "m" ? String(value).padStart(2, "0") : m;
    router.replace(`/zones/fiche/${ny}-${nm}`);
  }

  function openMove() {
    setMoveY(mois.slice(0, 4) || String(new Date().getFullYear()));
    setMoveM(mois.slice(5, 7) || "01");
    setShowMove(true);
  }

  async function doMove() {
    const toMois = `${moveY}-${moveM}`;
    if (toMois === mois) { setShowMove(false); return; }
    setMoving(true); setError("");
    try {
      if (editing && !saved) {
        // enregistrer d'abord les modifications en cours
        const entrees = zones.map((z) => ({
          zoneId: z.id,
          tempsMis: vals[z.id]?.t || "",
          participants: parseInt(vals[z.id]?.p || "0", 10),
        }));
        await api("/api/zones/entrees", { method: "POST", body: JSON.stringify({ mois, entrees }) });
        baselineRef.current = { ...vals };
        setSaved(true);
        setMode("lecture");
      }
      await api("/api/zones/entrees/move", {
        method: "POST",
        body: JSON.stringify({ fromMois: mois, toMois }),
      });
      setShowMove(false);
      router.replace(`/zones/fiche/${toMois}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMoving(false);
    }
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

  const editing = mode === "edition";

  return (
    <main className="wrap">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 14mm; }
          @page {
            @bottom-center {
              content: "Page " counter(page) " / " counter(pages);
              font-size: 8pt; color: #555;
            }
          }
          .site-header, .back-link, .month-nav, .move-box, .form-actions,
          .no-print { display: none !important; }
          .wrap { max-width: none; padding: 0; margin: 0; overflow: visible; }
          .card { border: none; box-shadow: none; padding: 0; }
          .accueil-identite { margin-bottom: 10px; }
          .accueil-logo { width: 40px; height: auto; }
          .table-scroll { overflow: visible; }
          table { width: 100%; border-collapse: collapse; font-size: 9pt; }
          th, td { border: 1px solid #999; padding: 4px 6px; }
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }
          tr { page-break-inside: avoid; }
          .manquant { background: #fff7ed !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .warn { color: #c0392b; }
          .note { font-size: 8.5pt; color: #555; }
          .fiche-print-pied { display: block; margin-top: 12px; font-size: 8.5pt; color: #555; text-align: center; }
        }
        .fiche-print-pied { display: none; }
      `}</style>
      <Link href="/zones/fiches" className="back-link">← Archives des fiches</Link>
      <header className="accueil-identite" style={{ marginBottom: 18 }}>
        <img src="/logo.png" alt="" className="accueil-logo" />
        <div>
          <p className="accueil-kicker">Zones</p>
          <h1 className="accueil-titre">Fiche — {moisLabel(mois)}</h1>
          <span className="accueil-filet" aria-hidden="true" />
          <p className="accueil-chapo">
            Saisie et consultation des heures de prière par zone.
          </p>
        </div>
      </header>

      {error && <div className="err" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="card">
        <div className="month-nav">
          <select
            value={Number(mois.slice(5, 7)) || 1}
            onChange={(e) => changeMois("m", e.target.value)}
            aria-label="Mois"
          >
            {MOIS_FR.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={mois.slice(0, 4) || String(new Date().getFullYear())}
            onChange={(e) => changeMois("y", e.target.value)}
            aria-label="Année"
          >
            {anneesDispo().map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <Link href={`/zones?mois=${mois}`} className="link-btn">Import / gestion →</Link>
          <button type="button" className="link-btn" onClick={openMove}>Changer la période</button>
        </div>

        {showMove && (
          <div className="move-box">
            <span>Déplacer cette fiche vers :</span>
            <select value={Number(moveM)} onChange={(e) => setMoveM(String(e.target.value).padStart(2, "0"))} aria-label="Mois cible">
              {MOIS_FR.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <select value={moveY} onChange={(e) => setMoveY(e.target.value)} aria-label="Année cible">
              {anneesDispo().map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <button className="btn" type="button" onClick={doMove} disabled={moving}>
              {moving ? "Déplacement…" : "Déplacer"}
            </button>
            <button className="btn secondary" type="button" onClick={() => setShowMove(false)} disabled={moving}>
              Annuler
            </button>
          </div>
        )}

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th className="ncol">N°</th>
                <th>Zone</th>
                <th>Temps mis</th>
                <th>Participant(s)</th>
                <th>Cumul</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={l.z.id} className={l.manquant ? "manquant" : undefined}>
                  <td className="ncol">{i + 1}</td>
                  <td>{l.z.nom}</td>
                  <td className={l.manquant ? "warn" : undefined}>
                    {editing ? (
                      <input type="text" inputMode="numeric" placeholder="02:00" value={l.v.t}
                        onChange={(e) => setVal(l.z.id, { t: formatDureeInput(e.target.value) })} />
                    ) : (
                      l.v.t || "—"
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <input type="number" min="1" value={l.v.p}
                        onChange={(e) => setVal(l.z.id, { p: e.target.value })} />
                    ) : (
                      (parseInt(l.v.p || "0", 10) || "—")
                    )}
                  </td>
                   <td className={l.manquant ? "warn" : undefined}>
                     {l.cu !== null ? fmtDuree(l.cu) : (l.manquant ? "à saisir" : "—")}
                   </td>
                   <td>
                     <button
                       className="btn secondary"
                       type="button"
                       onClick={() => supprimerZone(l.z.id)}
                       aria-label={`Supprimer ${l.z.nom}`}
                     >
                       ✕
                     </button>
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
          {editing ? (
            <>
              <button className="btn" onClick={save} disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button className="btn secondary" type="button" onClick={annuler} disabled={saving}>
                Annuler
              </button>
            </>
          ) : (
            <button className="btn" type="button" onClick={() => setMode("edition")}>
              Modifier
            </button>
          )}
          <button className="btn secondary" type="button" onClick={exportFiche}>Export Excel</button>
          <button className="btn secondary" type="button" onClick={exporterPdf} disabled={exportingPdf}>
            {exportingPdf ? "Impression…" : "Exporter PDF"}
          </button>
          <button className="btn danger" type="button" onClick={supprimerFiche}>Supprimer la fiche</button>
          {saved && <span className="note">Fiche enregistrée.</span>}
        </div>
      </div>
      <div className="fiche-print-pied">
        Document généré le {new Date().toLocaleDateString("fr-FR")} — UMPJ
      </div>
      {node}
    </main>
  );
}
