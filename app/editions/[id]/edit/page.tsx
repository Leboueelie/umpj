"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { Edition } from "@/lib/types";

export default function EditionEdit() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id || "");
  const isNew = id === "nouvelle";

  const [numero, setNumero] = useState("");
  const [reference, setReference] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [libellePeriode, setLibellePeriode] = useState("");

  const [delegationsPresentes, setDelegationsPresentes] = useState("0");
  const [regionsSpirituelles, setRegionsSpirituelles] = useState("0");
  const [missionnaires1, setMissionnaires1] = useState("0");
  const [missionnaires2, setMissionnaires2] = useState("0");
  const [anciensAbidjan, setAnciensAbidjan] = useState("0");
  const [epousesAnciensAbidjan, setEpousesAnciensAbidjan] = useState("0");
  const [moyenneParticipation, setMoyenneParticipation] = useState("0");

  const [exterieuresText, setExterieuresText] = useState("");
  const [abidjanText, setAbidjanText] = useState("");
  const [interieurText, setInterieurText] = useState("");

  const [participantsParJour, setParticipantsParJour] = useState<{ jour: string; date: string; participants: string }[]>([]);
  const [sessions, setSessions] = useState<{ date: string; nbSessions: string; periodes: string; dureeMinutes: string; participants: string }[]>([]);

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) return;
    fetch(`/api/editions/${id}`)
      .then((r) => r.json())
      .then((e: Edition) => {
        setNumero(String(e.numero));
        setReference(e.reference);
        setDateDebut(e.dateDebut);
        setDateFin(e.dateFin);
        setLibellePeriode(e.libellePeriode);
        setDelegationsPresentes(String(e.delegationsPresentes));
        setRegionsSpirituelles(String(e.regionsSpirituelles));
        setMissionnaires1(String(e.missionnaires1));
        setMissionnaires2(String(e.missionnaires2));
        setAnciensAbidjan(String(e.anciensAbidjan));
        setEpousesAnciensAbidjan(String(e.epousesAnciensAbidjan));
        setMoyenneParticipation(String(e.moyenneParticipation));
        setExterieuresText(e.delegationsExterieures.join("\n"));
        setAbidjanText(e.abidjanZones.join("\n"));
        setInterieurText(e.interieurLocalites.join("\n"));
        setParticipantsParJour(e.participantsParJour.map((p) => ({ jour: p.jour, date: p.date, participants: String(p.participants) })));
        setSessions(e.sessions.map((s) => ({ date: s.date, nbSessions: String(s.nbSessions), periodes: s.periodes, dureeMinutes: String(s.dureeMinutes), participants: String(s.participants) })));
      })
      .catch((err) => setError(err.message));
  }, [id, isNew]);

  function lines(t: string): string[] {
    return t.split("\n").map((s) => s.trim()).filter(Boolean);
  }
  function heuresInvesties(): number {
    return sessions.reduce((a, s) => a + (parseInt(s.dureeMinutes || "0", 10) || 0), 0);
  }

  async function save() {
    setSaving(true); setError("");
    const body = {
      numero: parseInt(numero || "0", 10),
      reference,
      dateDebut,
      dateFin,
      libellePeriode,
      delegationsPresentes: parseInt(delegationsPresentes || "0", 10),
      regionsSpirituelles: parseInt(regionsSpirituelles || "0", 10),
      missionnaires1: parseInt(missionnaires1 || "0", 10),
      missionnaires2: parseInt(missionnaires2 || "0", 10),
      anciensAbidjan: parseInt(anciensAbidjan || "0", 10),
      epousesAnciensAbidjan: parseInt(epousesAnciensAbidjan || "0", 10),
      moyenneParticipation: parseInt(moyenneParticipation || "0", 10),
      heuresInvesties: heuresInvesties(),
      delegationsExterieures: lines(exterieuresText),
      abidjanZones: lines(abidjanText),
      interieurLocalites: lines(interieurText),
      participantsParJour: participantsParJour.map((p) => ({ jour: p.jour, date: p.date, participants: parseInt(p.participants || "0", 10) })),
      sessions: sessions.map((s) => ({ date: s.date, nbSessions: parseInt(s.nbSessions || "0", 10), periodes: s.periodes, dureeMinutes: parseInt(s.dureeMinutes || "0", 10), participants: parseInt(s.participants || "0", 10) })),
    };
    try {
      const url = isNew ? "/api/editions" : `/api/editions/${id}`;
      const res = await fetch(url, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Échec enregistrement.");
      }
      const d = await res.json();
      router.push(isNew ? `/editions/${d.id}` : `/editions/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <main className="wrap">
      <Link href={isNew ? "/editions" : `/editions/${id}`} className="back-link">← Annuler</Link>
      <header className="app-header">
        <img src="/logo.png" alt="Logo UMPJ" className="logo" />
        <div className="titles">
          <h1>{isNew ? "Nouvelle édition" : `Édition ${numero}e`}</h1>
          <div className="sub">Editions de l'UMPJ</div>
        </div>
      </header>

      <div className="card">
        <h3 className="ed-section">Identification</h3>
        <div className="grid-2">
          <label>Numéro d'édition<input value={numero} onChange={(e) => setNumero(e.target.value)} type="number" /></label>
          <label>Référence (ex: RAPPORT UMPJ-CI 001/2026)<input value={reference} onChange={(e) => setReference(e.target.value)} /></label>
          <label>Date début<input value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} type="date" /></label>
          <label>Date fin<input value={dateFin} onChange={(e) => setDateFin(e.target.value)} type="date" /></label>
          <label style={{ gridColumn: "1 / -1" }}>Libellé période (ex: 17 au 22 Février 2026)<input value={libellePeriode} onChange={(e) => setLibellePeriode(e.target.value)} /></label>
        </div>

        <h3 className="ed-section">I. Pendant l'UMPJ</h3>
        <div className="grid-2">
          <label>Délégations présentes<input value={delegationsPresentes} onChange={(e) => setDelegationsPresentes(e.target.value)} type="number" /></label>
          <label>Régions spirituelles présentes<input value={regionsSpirituelles} onChange={(e) => setRegionsSpirituelles(e.target.value)} type="number" /></label>
          <label>Missionnaires n°1<input value={missionnaires1} onChange={(e) => setMissionnaires1(e.target.value)} type="number" /></label>
          <label>Missionnaires n°2<input value={missionnaires2} onChange={(e) => setMissionnaires2(e.target.value)} type="number" /></label>
          <label>Anciens d'Abidjan<input value={anciensAbidjan} onChange={(e) => setAnciensAbidjan(e.target.value)} type="number" /></label>
          <label>Epouses d'Anciens Abidjan<input value={epousesAnciensAbidjan} onChange={(e) => setEpousesAnciensAbidjan(e.target.value)} type="number" /></label>
        </div>

        <label>Délégations extérieures (une par ligne)
          <textarea value={exterieuresText} onChange={(e) => setExterieuresText(e.target.value)} rows={4} />
        </label>
        <label>Délégation d'ABIDJAN (une par ligne)
          <textarea value={abidjanText} onChange={(e) => setAbidjanText(e.target.value)} rows={4} />
        </label>
        <label>Délégation de l'INTERIEUR (une par ligne)
          <textarea value={interieurText} onChange={(e) => setInterieurText(e.target.value)} rows={8} />
        </label>

        <h3 className="ed-section">10. Les participants (par jour)</h3>
        {participantsParJour.map((p, i) => (
          <div className="row-flex" key={i}>
            <input placeholder="Jour (ex: 1er jour)" value={p.jour} onChange={(e) => setParticipantsParJour(participantsParJour.map((x, j) => j === i ? { ...x, jour: e.target.value } : x))} />
            <input placeholder="Date (ex: 17 02 2026)" value={p.date} onChange={(e) => setParticipantsParJour(participantsParJour.map((x, j) => j === i ? { ...x, date: e.target.value } : x))} />
            <input placeholder="Participants" type="number" value={p.participants} onChange={(e) => setParticipantsParJour(participantsParJour.map((x, j) => j === i ? { ...x, participants: e.target.value } : x))} />
            <button type="button" className="btn secondary" onClick={() => setParticipantsParJour(participantsParJour.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button type="button" className="btn secondary" onClick={() => setParticipantsParJour([...participantsParJour, { jour: "", date: "", participants: "" }])}>+ Ajouter un jour</button>
        <label style={{ marginTop: 8 }}>Moyenne générale de participation
          <input value={moyenneParticipation} onChange={(e) => setMoyenneParticipation(e.target.value)} type="number" />
        </label>

        <h3 className="ed-section">II. Investissement dans la prière — Sessions</h3>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Le nombre d'heures investies est calculé automatiquement (somme des durées).</p>
        {sessions.map((s, i) => (
          <div className="row-flex" key={i}>
            <input placeholder="Date" value={s.date} onChange={(e) => setSessions(sessions.map((x, j) => j === i ? { ...x, date: e.target.value } : x))} />
            <input placeholder="Nb sessions" type="number" value={s.nbSessions} onChange={(e) => setSessions(sessions.map((x, j) => j === i ? { ...x, nbSessions: e.target.value } : x))} />
            <input placeholder="Périodes (ex: 09:01 - 14:49 / 17:25 - 21:56)" value={s.periodes} onChange={(e) => setSessions(sessions.map((x, j) => j === i ? { ...x, periodes: e.target.value } : x))} style={{ flex: 2 }} />
            <input placeholder="Durée (min)" type="number" value={s.dureeMinutes} onChange={(e) => setSessions(sessions.map((x, j) => j === i ? { ...x, dureeMinutes: e.target.value } : x))} />
            <input placeholder="Participants" type="number" value={s.participants} onChange={(e) => setSessions(sessions.map((x, j) => j === i ? { ...x, participants: e.target.value } : x))} />
            <button type="button" className="btn secondary" onClick={() => setSessions(sessions.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button type="button" className="btn secondary" onClick={() => setSessions([...sessions, { date: "", nbSessions: "", periodes: "", dureeMinutes: "", participants: "" }])}>+ Ajouter une session</button>
        <div className="ed-moyenne" style={{ marginTop: 8 }}>TOTAL HEURES INVESTIES : <b>{Math.floor(heuresInvesties() / 60)} H {String(heuresInvesties() % 60).padStart(2, "0")} MN</b></div>
      </div>

      <div className="form-actions" style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn" type="button" onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
        <Link href={isNew ? "/editions" : `/editions/${id}`} className="btn secondary">Annuler</Link>
        {error && <span className="err">{error}</span>}
      </div>
    </main>
  );
}
