"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { MOIS_FR, moisLabel } from "@/lib/mois";
import { fmtDuree } from "@/lib/calc";
import { useFeedback } from "@/components/Feedback";
import { api } from "@/lib/api";
import type { Zone } from "@/lib/types";

type RecapMois = {
  mois: string;
  totP: number;
  totC: number;
  totT: number;
  nbEntrees: number;
};

type Entree = {
  id: string;
  zoneId: string;
  mois: string;
  tempsMis: number | null;
  participants: number;
  zoneNom: string;
};

const GROUPES = [
  { key: "abidjan" as const, label: "Chambre de prière d'Abidjan" },
  { key: "interieur" as const, label: "Chambres de prière intérieur" },
];

// Contexte de consultation conservé dans l'onglet (distinct des brouillons
// localStorage de saisie : ici, simple mémo de navigation, pas de données).
const CLE_CONTEXTE = "umpj:archives:vue";

type Mode = "annee" | "zone";

export default function ArchivesFiches() {
  const [recap, setRecap] = useState<RecapMois[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [groupes, setGroupes] = useState<Record<string, { totP: number; totT: number }>>({});
  const [config, setConfig] = useState<{ chambresAbidjan: number; chambresInterieur: number }>({
    chambresAbidjan: 0,
    chambresInterieur: 0,
  });
  const [error, setError] = useState("");
  const { confirm, toast, node } = useFeedback();

  // État de consultation (persisté dans l'onglet pour survivre aux allers-retours)
  const [mode, setMode] = useState<Mode>("annee");
  const [annee, setAnnee] = useState("");
  const [moisSel, setMoisSel] = useState("");
  const [zoneSel, setZoneSel] = useState("");
  const [rechercheZone, setRechercheZone] = useState("");
  const [restaure, setRestaure] = useState(false);

  const [entreesMois, setEntreesMois] = useState<Entree[] | null>(null);
  const [historique, setHistorique] = useState<Entree[] | null>(null);

  const moisSelRef = useRef(moisSel);
  moisSelRef.current = moisSel;
  const zoneSelRef = useRef(zoneSel);
  zoneSelRef.current = zoneSel;

  async function chargerRecap() {
    const rc = await api<RecapMois[]>("/api/zones/recap");
    setRecap(rc);
    return rc;
  }
  async function chargerZones() {
    const zs = await api<Zone[]>("/api/zones");
    setZones(zs);
    return zs;
  }
  async function chargerGroupes() {
    const g = await api<Record<string, { totP: number; totT: number }>>("/api/zones/groupes");
    setGroupes(g);
  }
  async function chargerConfig() {
    const c = await api<{ chambresAbidjan: number; chambresInterieur: number }>("/api/zones/config");
    setConfig(c);
  }

  async function chargerEntrees(m: string, silencieux = false) {
    if (!silencieux) setEntreesMois(null);
    try {
      const rows = await api<Entree[]>(`/api/zones/entrees?mois=${m}`);
      setEntreesMois(rows);
    } catch (e) {
      if (!silencieux) setError((e as Error).message);
    }
  }

  async function chargerHistorique(zoneId: string, silencieux = false) {
    if (!silencieux) setHistorique(null);
    try {
      const rows = await api<Entree[]>(`/api/zones/entrees?zoneId=${zoneId}`);
      setHistorique(rows);
    } catch (e) {
      if (!silencieux) setError((e as Error).message);
    }
  }

  async function load() {
    try {
      const [rc, zs] = await Promise.all([chargerRecap(), chargerZones()]);
      await Promise.all([chargerGroupes(), chargerConfig()]);
      restaurerContexte(rc, zs);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function restaurerContexte(rc: RecapMois[], zs: Zone[]) {
    const annees = Array.from(new Set(rc.map((r) => r.mois.slice(0, 4)))).sort().reverse();
    let ctx: { mode?: Mode; annee?: string; moisSel?: string; zoneId?: string } | null = null;
    try {
      const raw = sessionStorage.getItem(CLE_CONTEXTE);
      if (raw) ctx = JSON.parse(raw);
    } catch {}
    const a = ctx?.annee && annees.includes(ctx.annee) ? ctx.annee : (annees[0] || "");
    const moisDeA = rc.filter((r) => r.mois.startsWith(a)).map((r) => r.mois);
    const m =
      ctx?.moisSel && moisDeA.includes(ctx.moisSel)
        ? ctx.moisSel
        : moisDeA.sort().reverse()[0] || "";
    const z = ctx?.zoneId && zs.some((x) => x.id === ctx.zoneId) ? ctx.zoneId : "";
    setMode(ctx?.mode === "zone" || ctx?.mode === "annee" ? ctx.mode : "annee");
    setAnnee(a);
    setMoisSel(m);
    setZoneSel(z);
    setRestaure(true);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Rafraîchissement automatique (20 s), silencieux : récap, groupes et vue en cours
  useEffect(() => {
    const id = setInterval(() => {
      (async () => {
        try {
          await Promise.all([chargerRecap(), chargerGroupes()]);
        } catch {}
        if (moisSelRef.current) chargerEntrees(moisSelRef.current, true);
        if (zoneSelRef.current) chargerHistorique(zoneSelRef.current, true);
      })();
    }, 20000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persistance du contexte de consultation dans l'onglet
  useEffect(() => {
    if (!restaure) return;
    try {
      sessionStorage.setItem(
        CLE_CONTEXTE,
        JSON.stringify({ mode, annee, moisSel, zoneId: zoneSel })
      );
    } catch {}
  }, [mode, annee, moisSel, zoneSel, restaure]);

  // Chargement du détail quand la sélection change
  useEffect(() => {
    if (restaure && moisSel) chargerEntrees(moisSel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moisSel, restaure]);
  useEffect(() => {
    if (restaure && zoneSel) chargerHistorique(zoneSel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneSel, restaure]);

  // Réconciliation si le récap change (ex. fiche supprimée)
  useEffect(() => {
    if (!restaure) return;
    const annees = Array.from(new Set(recap.map((r) => r.mois.slice(0, 4)))).sort().reverse();
    if (annee && !annees.includes(annee)) setAnnee(annees[0] || "");
    if (moisSel && !recap.some((r) => r.mois === moisSel)) {
      const restants = recap
        .filter((r) => r.mois.startsWith(annee))
        .map((r) => r.mois)
        .sort()
        .reverse();
      setMoisSel(restants[0] || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recap, restaure]);

  async function supprimerMois(m: string) {
    if (!(await confirm(`Supprimer la fiche de ${moisLabel(m)} (toutes les zones) ?`)))
      return;
    try {
      await api(`/api/zones/entrees?mois=${m}&all=true`, { method: "DELETE" });
      toast("Fiche supprimée.", "success");
      await Promise.all([chargerRecap(), chargerGroupes()]);
    } catch (e) {
      setError((e as Error).message);
      toast((e as Error).message, "error");
    }
  }

  function onChangeChambres(key: "abidjan" | "interieur", val: string) {
    const n = parseInt(val || "0", 10) || 0;
    const patch = key === "abidjan" ? { chambresAbidjan: n } : { chambresInterieur: n };
    setConfig((c) => ({ ...c, ...patch }));
    api("/api/zones/config", { method: "PUT", body: JSON.stringify(patch) }).catch(() => {});
  }

  // ---------- Vues calculées ----------

  const resumeParAnnee = useMemo(() => {
    const map: Record<
      string,
      { nbMois: number; nbEntrees: number; totP: number; totT: number; totC: number }
    > = {};
    for (const r of recap) {
      const a = r.mois.slice(0, 4);
      if (!map[a]) map[a] = { nbMois: 0, nbEntrees: 0, totP: 0, totT: 0, totC: 0 };
      map[a].nbMois += 1;
      map[a].nbEntrees += r.nbEntrees || 0;
      map[a].totP += r.totP;
      map[a].totT += r.totT;
      map[a].totC += r.totC;
    }
    return map;
  }, [recap]);

  const anneesDispo = useMemo(() => Object.keys(resumeParAnnee).sort().reverse(), [resumeParAnnee]);

  const moisAnnee = useMemo(
    () => recap.filter((r) => r.mois.startsWith(annee)).sort((a, b) => a.mois.localeCompare(b.mois)),
    [recap, annee]
  );

  const lignesMois = useMemo(() => {
    let totP = 0, totT = 0, totC = 0, nbManquants = 0;
    const lignes = (entreesMois || []).map((e) => {
      const p = e.participants || 0;
      const manquant = p >= 1 && e.tempsMis == null;
      const cumul = e.tempsMis != null && p >= 1 ? e.tempsMis * p : null;
      totP += p;
      if (e.tempsMis != null) totT += e.tempsMis;
      if (cumul != null) totC += cumul;
      if (manquant) nbManquants += 1;
      return { e, manquant, cumul };
    });
    return { lignes, totP, totT, totC, nbManquants };
  }, [entreesMois]);

  const zonesFiltrees = useMemo(
    () =>
      zones.filter((z) =>
        z.nom.toLowerCase().includes(rechercheZone.trim().toLowerCase())
      ),
    [zones, rechercheZone]
  );

  const zoneChoisie = zones.find((z) => z.id === zoneSel) || null;

  const historiqueAvecAnnees = useMemo(() => {
    let totP = 0, totT = 0, totC = 0;
    const items: (
      | { type: "annee"; annee: string }
      | { type: "ligne"; e: Entree; manquant: boolean; cumul: number | null }
    )[] = [];
    let anneeCourante = "";
    for (const e of historique || []) {
      const a = e.mois.slice(0, 4);
      if (a !== anneeCourante) {
        items.push({ type: "annee", annee: a });
        anneeCourante = a;
      }
      const p = e.participants || 0;
      const manquant = p >= 1 && e.tempsMis == null;
      const cumul = e.tempsMis != null && p >= 1 ? e.tempsMis * p : null;
      totP += p;
      if (e.tempsMis != null) totT += e.tempsMis;
      if (cumul != null) totC += cumul;
      items.push({ type: "ligne", e, manquant, cumul });
    }
    return { items, totP, totT, totC };
  }, [historique]);

  // ---------- Rendu ----------

  return (
    <main className="wrap">
      <Link href="/zones" className="back-link">← Zones</Link>
      <header className="accueil-identite" style={{ marginBottom: 18 }}>
        <img src="/logo.png" alt="" className="accueil-logo" />
        <div>
          <p className="accueil-kicker">Zones</p>
          <h1 className="accueil-titre">Archives des fiches</h1>
          <span className="accueil-filet" aria-hidden="true" />
          <p className="accueil-chapo">
            Consultation par année, par mois ou par zone — historique complet.
          </p>
        </div>
      </header>

      {error && <div className="err">{error}</div>}

      {/* Sélecteur de mode */}
      <div className="card">
        <div className="cahiers">
          <div
            className={"cahier-btn" + (mode === "annee" ? " active" : "")}
            onClick={() => setMode("annee")}
          >
            <span className="nom">Par année</span>
            <span className="complet">Archives chronologiques</span>
          </div>
          <div
            className={"cahier-btn" + (mode === "zone" ? " active" : "")}
            onClick={() => setMode("zone")}
          >
            <span className="nom">Par zone</span>
            <span className="complet">Historique d'une zone</span>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <Link href="/zones" className="link-btn">Ouvrir la fiche du mois courant →</Link>
        </div>
      </div>

      {mode === "annee" && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Années</h3>
            {anneesDispo.length === 0 ? (
              <div className="empty">Aucune fiche enregistrée.</div>
            ) : (
              <div className="cahiers">
                {anneesDispo.map((a) => (
                  <div
                    key={a}
                    className={"cahier-btn" + (a === annee ? " active" : "")}
                    onClick={() => setAnnee(a)}
                  >
                    <span className="nom">{a}</span>
                    <span className="complet">
                      {resumeParAnnee[a].nbMois} mois · {resumeParAnnee[a].nbEntrees} enregistrement(s)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {annee && resumeParAnnee[annee] && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Année {annee}</h3>
              <div className="periode-resume">
                <span>{resumeParAnnee[annee].nbMois} mois saisis</span>
                <span>{resumeParAnnee[annee].nbEntrees} enregistrements</span>
                <span>Participants : <strong>{resumeParAnnee[annee].totP}</strong></span>
                <span>Temps de prière : <strong>{fmtDuree(resumeParAnnee[annee].totT)}</strong></span>
                <span>
                  Cumul (heures-personnes) : <strong>{fmtDuree(resumeParAnnee[annee].totC)}</strong>
                </span>
              </div>
              <div className="cahiers" style={{ marginTop: 10 }}>
                {moisAnnee.map((r) => (
                  <div
                    key={r.mois}
                    className={"cahier-btn" + (r.mois === moisSel ? " active" : "")}
                    onClick={() => setMoisSel(r.mois)}
                  >
                    <span className="nom">{MOIS_FR[Number(r.mois.slice(5, 7)) - 1]}</span>
                    <span className="complet">
                      {r.totP} participants · {fmtDuree(r.totT)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {moisSel && (
            <div className="card">
              <div className="table-actions">
                <strong>{moisLabel(moisSel)} — par zone</strong>
                <Link href={`/zones/fiche/${moisSel}`} className="link-btn">
                  Ouvrir la fiche complète →
                </Link>
              </div>
              {!entreesMois ? (
                <div className="empty">Chargement…</div>
              ) : entreesMois.length === 0 ? (
                <div className="empty">Aucune donnée pour ce mois.</div>
              ) : (
                <>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th className="ncol">N°</th>
                          <th>Zone</th>
                          <th>Participants</th>
                          <th>Temps mis (heures)</th>
                          <th>Cumul (heures-personnes)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lignesMois.lignes.map((l, i) => (
                          <tr key={l.e.id} className={l.manquant ? "manquant" : undefined}>
                            <td className="ncol">{i + 1}</td>
                            <td>{l.e.zoneNom}</td>
                            <td>{l.e.participants}</td>
                            <td className={l.manquant ? "warn" : undefined}>
                              {l.e.tempsMis != null ? fmtDuree(l.e.tempsMis) : "—"}
                            </td>
                            <td className={l.manquant ? "warn" : undefined}>
                              {l.cumul != null ? fmtDuree(l.cumul) : "—"}
                            </td>
                          </tr>
                        ))}
                        <tr className="total">
                          <td></td>
                          <td>Total ({entreesMois.length} zone(s))</td>
                          <td>{lignesMois.totP}</td>
                          <td>{fmtDuree(lignesMois.totT)}</td>
                          <td>{fmtDuree(lignesMois.totC)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {lignesMois.nbManquants > 0 && (
                    <div className="note">
                      {lignesMois.nbManquants} zone(s) avec participants mais temps mis à
                      saisir — exclues du total des heures.
                    </div>
                  )}
                </>
              )}
              <div className="form-actions" style={{ marginTop: 12 }}>
                <button className="btn danger" type="button" onClick={() => supprimerMois(moisSel)}>
                  Supprimer la fiche
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {mode === "zone" && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Choisir une zone</h3>
            <div className="filters">
              <input
                type="text"
                placeholder="Rechercher une zone…"
                value={rechercheZone}
                onChange={(e) => setRechercheZone(e.target.value)}
              />
            </div>
            <div className="cahiers" style={{ maxHeight: 260, overflowY: "auto" }}>
              {zonesFiltrees.length === 0 ? (
                <div className="empty">Aucune zone trouvée.</div>
              ) : (
                zonesFiltrees.map((z) => (
                  <div
                    key={z.id}
                    className={"cahier-btn" + (z.id === zoneSel ? " active" : "")}
                    onClick={() => setZoneSel(z.id)}
                  >
                    <span className="nom">{z.nom}</span>
                    <span className="complet">
                      {z.groupe === "abidjan" ? "Abidjan" : "Intérieur"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {zoneSel && zoneChoisie && (
            <div className="card">
              <div className="table-actions">
                <strong>
                  Historique — {zoneChoisie.nom} (
                  {zoneChoisie.groupe === "abidjan" ? "Abidjan" : "Intérieur"})
                </strong>
              </div>
              {!historique ? (
                <div className="empty">Chargement…</div>
              ) : historique.length === 0 ? (
                <div className="empty">Aucune donnée enregistrée pour cette zone.</div>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Mois</th>
                        <th>Participants</th>
                        <th>Temps mis (heures)</th>
                        <th>Cumul (heures-personnes)</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {historiqueAvecAnnees.items.map((item) =>
                        item.type === "annee" ? (
                          <tr key={"annee-" + item.annee}>
                            <td
                              colSpan={5}
                              style={{
                                fontWeight: 700,
                                color: "var(--navy)",
                                background: "var(--bg)",
                              }}
                            >
                              {item.annee}
                            </td>
                          </tr>
                        ) : (
                          <tr key={item.e.id} className={item.manquant ? "manquant" : undefined}>
                            <td>{moisLabel(item.e.mois)}</td>
                            <td>{item.e.participants}</td>
                            <td className={item.manquant ? "warn" : undefined}>
                              {item.e.tempsMis != null ? fmtDuree(item.e.tempsMis) : "—"}
                            </td>
                            <td className={item.manquant ? "warn" : undefined}>
                              {item.cumul != null ? fmtDuree(item.cumul) : "—"}
                            </td>
                            <td>
                              <Link href={`/zones/fiche/${item.e.mois}`} className="link-btn">
                                Fiche →
                              </Link>
                            </td>
                          </tr>
                        )
                      )}
                      <tr className="total">
                        <td>Total ({(historique || []).length} mois)</td>
                        <td>{historiqueAvecAnnees.totP}</td>
                        <td>{fmtDuree(historiqueAvecAnnees.totT)}</td>
                        <td>{fmtDuree(historiqueAvecAnnees.totC)}</td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Groupes de prière (configuration des chambres) — conservé */}
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
      {node}
    </main>
  );
}
