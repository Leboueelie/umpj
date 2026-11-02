"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { VueRapport } from "@/components/rapports/VueRapport";
import type { RapportModule } from "@/lib/rapports";

type Item = {
  id: string;
  titre: string;
  modules: string[];
  periodeDu: string | null;
  periodeAu: string | null;
  format: string;
  dateGeneration: string;
  auteur: string;
  pdfTaille: number | null;
  xlsxTaille: number | null;
  statut: string;
};

type Detail = {
  id: string;
  titre: string;
  typeRapport: string;
  modules: string[];
  periodeDu: string | null;
  periodeAu: string | null;
  filtres: Record<string, unknown>;
  dateGeneration: string;
  auteur: string;
  snapshot: any;
  schemaVersion: string;
  format: string;
  pdfDisponible: boolean;
  pdfTaille: number | null;
  pdfSha256: string | null;
  xlsxDisponible: boolean;
  xlsxTaille: number | null;
  xlsxSha256: string | null;
  statut: string;
};

const MODULES_LABELS: Record<string, string> = {
  maisons: "Maisons de prière",
  zones: "Zones",
  editions: "Éditions",
  chambres: "Chambres de prière",
  equipes: "Équipes de prière",
  nuits: "Nuits de prière",
  croisades: "Croisades",
  sieges: "Sièges de prière",
  documents: "Documents",
};

export default function HistoriqueRapportsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(20);
  const [phase, setPhase] = useState<"chargement" | "pret" | "erreur">("chargement");
  const [erreur, setErreur] = useState<string | null>(null);

  // Filtres
  const [q, setQ] = useState("");
  const [moduleFiltre, setModuleFiltre] = useState("");
  const [formatFiltre, setFormatFiltre] = useState("");
  const [du, setDu] = useState("");
  const [au, setAu] = useState("");

  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailPhase, setDetailPhase] = useState<"idle" | "chargement" | "pret" | "erreur">("idle");
  const [detailErreur, setDetailErreur] = useState<string | null>(null);

  const charger = useCallback(async (off: number) => {
    setPhase("chargement");
    setErreur(null);
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String(off));
    if (q.trim()) params.set("q", q.trim());
    if (moduleFiltre) params.set("module", moduleFiltre);
    if (formatFiltre) params.set("format", formatFiltre);
    if (du) params.set("du", du);
    if (au) params.set("au", au);
    try {
      const res = await fetch(`/api/rapports/historique?${params.toString()}`);
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent("/rapports/historique")}`;
        return;
      }
      if (!res.ok) {
        const corps = (await res.json().catch(() => null)) as { error?: string } | null;
        setErreur(corps?.error || "Impossible de charger l'historique.");
        setPhase("erreur");
        return;
      }
      const data = (await res.json()) as { total: number; items: Item[] };
      setTotal(data.total);
      setItems(data.items);
      setOffset(off);
      setPhase("pret");
    } catch {
      setErreur("Serveur injoignable.");
      setPhase("erreur");
    }
  }, [limit, q, moduleFiltre, formatFiltre, du, au]);

  useEffect(() => {
    void charger(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ouvrirDetail(id: string) {
    setDetail(null);
    setDetailErreur(null);
    setDetailPhase("chargement");
    try {
      const res = await fetch(`/api/rapports/historique/${id}`);
      if (!res.ok) {
        const corps = (await res.json().catch(() => null)) as { error?: string } | null;
        setDetailErreur(corps?.error || "Impossible de charger le détail.");
        setDetailPhase("erreur");
        return;
      }
      setDetail((await res.json()) as Detail);
      setDetailPhase("pret");
    } catch {
      setDetailErreur("Serveur injoignable.");
      setDetailPhase("erreur");
    }
  }

  const hasPrev = offset > 0;
  const hasNext = offset + items.length < total;

  return (
    <main className="wrap">
      <Link href="/rapports" className="back-link">← Rapports</Link>
      <header className="accueil-identite" style={{ marginBottom: 18 }}>
        <img src="/logo.png" alt="" className="accueil-logo" />
        <div>
          <p className="accueil-kicker">Rapports</p>
          <h1 className="accueil-titre">Historique des rapports</h1>
          <span className="accueil-filet" aria-hidden="true" />
          <p className="accueil-chapo">
            Rapports consolidés archivés — consultation et téléchargement.
          </p>
        </div>
      </header>

      <div className="card">
        <div className="filters">
          <input
            type="text"
            placeholder="Rechercher un titre…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select value={moduleFiltre} onChange={(e) => setModuleFiltre(e.target.value)}>
            <option value="">Tous les modules</option>
            {Object.entries(MODULES_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select value={formatFiltre} onChange={(e) => setFormatFiltre(e.target.value)}>
            <option value="">Tous les formats</option>
            <option value="pdf">PDF</option>
            <option value="xlsx">Excel</option>
            <option value="both">PDF + Excel</option>
          </select>
          <label className="field">
            Du
            <input type="date" value={du} onChange={(e) => setDu(e.target.value)} />
          </label>
          <label className="field">
            Au
            <input type="date" value={au} onChange={(e) => setAu(e.target.value)} />
          </label>
          <button type="button" className="btn" onClick={() => void charger(0)} disabled={phase === "chargement"}>
            {phase === "chargement" ? "Chargement…" : "Filtrer"}
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() => { setQ(""); setModuleFiltre(""); setFormatFiltre(""); setDu(""); setAu(""); void charger(0); }}
            disabled={phase === "chargement"}
          >
            Réinitialiser
          </button>
        </div>
      </div>

      {phase === "chargement" && <div className="card">Chargement…</div>}
      {phase === "erreur" && erreur && <div className="err">{erreur}</div>}

      {phase === "pret" && (
        <>
          {items.length === 0 ? (
            <div className="empty">Aucun rapport archivé.</div>
          ) : (
            <div className="card">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Titre</th>
                      <th>Modules</th>
                      <th>Période</th>
                      <th>Date de génération</th>
                      <th>Auteur</th>
                      <th>Format</th>
                      <th>Tailles</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id}>
                        <td>{it.titre}</td>
                        <td style={{ fontSize: "0.85rem" }}>{it.modules.map((m) => MODULES_LABELS[m] || m).join(", ")}</td>
                        <td>
                          {it.periodeDu && it.periodeAu
                            ? `${it.periodeDu} → ${it.periodeAu}`
                            : "Inventaire"}
                        </td>
                        <td>{new Date(it.dateGeneration).toLocaleString("fr-FR")}</td>
                        <td>{it.auteur}</td>
                        <td>{it.format}</td>
                        <td style={{ fontSize: "0.82rem" }}>
                          {it.pdfTaille ? `PDF ${Math.round(it.pdfTaille / 1024)} Ko` : ""}
                          {it.pdfTaille && it.xlsxTaille ? " · " : ""}
                          {it.xlsxTaille ? `XLSX ${Math.round(it.xlsxTaille / 1024)} Ko` : ""}
                        </td>
                        <td>
                          <span className="td-btns">
                            <button type="button" className="btn secondary" onClick={() => void ouvrirDetail(it.id)}>
                              Consulter
                            </button>
                            {it.pdfTaille !== null && (
                              <a className="btn secondary" href={`/api/rapports/historique/${it.id}/pdf`} target="_blank" rel="noopener noreferrer">
                                PDF
                              </a>
                            )}
                            {it.xlsxTaille !== null && (
                              <a className="btn secondary" href={`/api/rapports/historique/${it.id}/xlsx`} target="_blank" rel="noopener noreferrer">
                                Excel
                              </a>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="form-actions" style={{ marginTop: 12, justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                  {total} rapport(s) — affichage {offset + 1} à {Math.min(offset + items.length, total)}
                </span>
                <span className="td-btns">
                  <button type="button" className="btn secondary" disabled={!hasPrev} onClick={() => void charger(offset - limit)}>
                    Précédent
                  </button>
                  <button type="button" className="btn secondary" disabled={!hasNext} onClick={() => void charger(offset + limit)}>
                    Suivant
                  </button>
                </span>
              </div>
            </div>
          )}

          {detailPhase !== "idle" && (
            <div className="modal-backdrop" onClick={() => { setDetail(null); setDetailPhase("idle"); }}>
              <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720, maxHeight: "80vh", overflow: "auto" }}>
                {detailPhase === "chargement" && <p style={{ color: "var(--muted)" }}>Chargement…</p>}
                {detailPhase === "erreur" && detailErreur && <div className="err">{detailErreur}</div>}
                {detailPhase === "pret" && detail && (
                  <>
                    <h3 style={{ marginTop: 0 }}>{detail.titre}</h3>
                    <dl className="rapport-meta">
                      <div><dt>Module(s)</dt><dd>{detail.modules.map((m) => MODULES_LABELS[m] || m).join(", ")}</dd></div>
                      <div><dt>Période couverte</dt><dd>{detail.periodeDu && detail.periodeAu ? `${detail.periodeDu} → ${detail.periodeAu}` : "Inventaire sans période"}</dd></div>
                      <div><dt>Date de génération</dt><dd>{new Date(detail.dateGeneration).toLocaleString("fr-FR")}</dd></div>
                      <div><dt>Auteur</dt><dd>{detail.auteur}</dd></div>
                      <div><dt>Format</dt><dd>{detail.format}</dd></div>
                      <div><dt>Version du schéma</dt><dd>{detail.schemaVersion}</dd></div>
                      <div><dt>Statut</dt><dd>{detail.statut}</dd></div>
                      <div><dt>Filtres</dt><dd>{JSON.stringify(detail.filtres)}</dd></div>
                    </dl>
                    {detail.snapshot?.synthese && (
                      <div className="card" style={{ marginTop: 12 }}>
                        <h3 style={{ marginTop: 0 }}>Synthèse</h3>
                        <div className="table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>Module</th>
                                <th>Volume</th>
                                <th>Indicateurs clés</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.snapshot.synthese.map((s: any, i: number) => (
                                <tr key={i}>
                                  <td>{s.intitule}</td>
                                  <td>{s.volume}</td>
                                  <td style={{ fontSize: "0.85rem" }}>{s.resume}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    {Array.isArray(detail.snapshot?.sections) && detail.snapshot.sections.map((s: any, i: number) => (
                      <VueRapport key={i} rapport={s as unknown as RapportModule} />
                    ))}
                    <div className="form-actions" style={{ marginTop: 12 }}>
                      {detail.pdfDisponible && (
                        <a className="btn secondary" href={`/api/rapports/historique/${detail.id}/pdf`} target="_blank" rel="noopener noreferrer">
                          Télécharger PDF
                        </a>
                      )}
                      {detail.xlsxDisponible && (
                        <a className="btn secondary" href={`/api/rapports/historique/${detail.id}/xlsx`} target="_blank" rel="noopener noreferrer">
                          Télécharger Excel
                        </a>
                      )}
                      <button type="button" className="btn secondary" onClick={() => { setDetail(null); setDetailPhase("idle"); }}>
                        Fermer
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
