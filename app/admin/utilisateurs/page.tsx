"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFeedback } from "@/components/Feedback";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/calc";

type Compte = {
  id: string;
  email: string;
  nom: string | null;
  role: "ADMIN" | "LECTEUR";
  actif: boolean;
  created_at: string;
  updated_at: string;
};

export default function AdminUtilisateursPage() {
  const { confirm, prompt, toast, node } = useFeedback();
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [email, setEmail] = useState("");
  const [nom, setNom] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [role, setRole] = useState<"ADMIN" | "LECTEUR">("LECTEUR");
  const [enCours, setEnCours] = useState(false);

  // Filtres (côté client, aucune API supplémentaire)
  const [recherche, setRecherche] = useState("");
  const [filtreRole, setFiltreRole] = useState<"TOUS" | "ADMIN" | "LECTEUR">("TOUS");
  const [filtreEtat, setFiltreEtat] = useState<"TOUS" | "ACTIF" | "INACTIF">("TOUS");

  async function charger() {
    setChargement(true);
    try {
      setComptes(await api<Compte[]>("/api/admin/utilisateurs"));
      setErreur("");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur de chargement.");
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
  }, []);

  const comptesFiltres = comptes.filter((c) => {
    const q = recherche.trim().toLowerCase();
    if (q && !((c.nom || "").toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q)))
      return false;
    if (filtreRole !== "TOUS" && c.role !== filtreRole) return false;
    if (filtreEtat === "ACTIF" && !c.actif) return false;
    if (filtreEtat === "INACTIF" && c.actif) return false;
    return true;
  });

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    if (enCours) return;
    setEnCours(true);
    try {
      await api("/api/admin/utilisateurs", {
        method: "POST",
        body: JSON.stringify({ email, motDePasse, role, nom: nom.trim() || null }),
      });
      setEmail("");
      setNom("");
      setMotDePasse("");
      setRole("LECTEUR");
      toast("Compte créé.", "success");
      charger();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Échec.", "error");
    } finally {
      setEnCours(false);
    }
  }

  async function basculerActif(c: Compte) {
    const action = c.actif ? "désactiver" : "réactiver";
    if (!(await confirm(`Voulez-vous vraiment ${action} le compte ${c.email} ?`))) return;
    try {
      await api(`/api/admin/utilisateurs/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ actif: !c.actif }),
      });
      toast(`Compte ${c.actif ? "désactivé" : "réactivé"}.`, "success");
      charger();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Échec.", "error");
    }
  }

  async function changerRole(c: Compte) {
    const nouveau = c.role === "ADMIN" ? "LECTEUR" : "ADMIN";
    if (
      !(await confirm(
        `Attribuer le rôle ${nouveau} au compte ${c.email} ? La session sera révoquée.`
      ))
    )
      return;
    try {
      await api(`/api/admin/utilisateurs/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role: nouveau }),
      });
      toast("Rôle modifié.", "success");
      charger();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Échec.", "error");
    }
  }

  async function modifierNom(c: Compte) {
    const nouveau = await prompt(
      `Nouveau nom complet pour ${c.email} (laisser vide pour effacer) :`,
      "",
      c.nom || ""
    );
    if (nouveau === null) return;
    const valeur = nouveau.trim() === "" ? null : nouveau.trim();
    try {
      await api(`/api/admin/utilisateurs/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ nom: valeur }),
      });
      toast("Nom modifié.", "success");
      charger();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Échec.", "error");
    }
  }

  async function reinitialiser(c: Compte) {
    const nouveau = await prompt(
      `Nouveau mot de passe pour ${c.email} (8 caractères minimum) :`
    );
    if (!nouveau) return;
    try {
      await api(`/api/admin/utilisateurs/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ motDePasse: nouveau }),
      });
      toast("Mot de passe réinitialisé.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Échec.", "error");
    }
  }

  return (
    <main className="wrap admin-page">
      <style>{`
        .admin-page .btn {
          padding: 10px 18px;
          transition: background 0.15s ease, filter 0.15s ease, box-shadow 0.15s ease;
        }
        .admin-page .btn:hover { filter: brightness(0.96); }
        .admin-page .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .admin-page .btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .admin-page .btn.secondary { background: #e5e7eb; color: #1f2933; border: 1px solid #d1d5db; }
        .admin-page .btn.secondary:hover { background: #d1d5db; filter: none; }
        .admin-page .btn.danger { background: var(--danger); color: #fff; }
        .admin-page .btn.danger:hover { filter: brightness(0.9); }
        .admin-page input,
        .admin-page select,
        .admin-page textarea {
          border-radius: 10px;
          padding: 8px 12px;
          border: 1px solid var(--border);
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .admin-page input:focus,
        .admin-page select:focus,
        .admin-page textarea:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
        }
      `}</style>
      <Link href="/" className="back-link">← Accueil</Link>
      <header className="accueil-identite" style={{ marginBottom: 18 }}>
        <img src="/logo.png" alt="" className="accueil-logo" />
        <div>
          <p className="accueil-kicker">Administration</p>
          <h1 className="accueil-titre">Gestion des utilisateurs</h1>
          <span className="accueil-filet" aria-hidden="true" />
          <p className="accueil-chapo">
            Comptes et rôles — accès réservé aux administrateurs.
          </p>
        </div>
      </header>

      {erreur && <div className="err" style={{ marginBottom: 12 }}>{erreur}</div>}

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Créer un compte</h3>
        <form onSubmit={creer} className="filters">
          <div className="field">
            <label>Nom complet <span className="warn">*</span>
              <input
                type="text"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                required
                maxLength={120}
                placeholder="Ex: Yao Divine"
              />
            </label>
          </div>
          <div className="field">
            <label>Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={254}
              />
            </label>
          </div>
          <div className="field">
            <label>Mot de passe <span className="warn">*</span>
              <input
                type="password"
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                required
                minLength={8}
                maxLength={200}
                autoComplete="new-password"
              />
            </label>
          </div>
          <div className="field">
            <label>Rôle
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "ADMIN" | "LECTEUR")}
              >
                <option value="LECTEUR">Lecteur</option>
                <option value="ADMIN">Administrateur</option>
              </select>
            </label>
          </div>
          <button className="btn" type="submit" disabled={enCours}>
            {enCours ? "Création…" : "Créer"}
          </button>
        </form>
        <p style={{ color: "var(--muted)", fontSize: "0.82rem", margin: "8px 0 0" }}>
          Champs marqués <span className="warn">*</span> obligatoires · nom complet requis · mot de passe
          8 caractères minimum. L'adresse e-mail est facultative.
        </p>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Comptes existants</h3>
        <div className="filters" style={{ marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Rechercher un nom ou un email…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
          <select
            value={filtreRole}
            onChange={(e) => setFiltreRole(e.target.value as "TOUS" | "ADMIN" | "LECTEUR")}
          >
            <option value="TOUS">Tous les rôles</option>
            <option value="ADMIN">Administrateurs</option>
            <option value="LECTEUR">Lecteurs</option>
          </select>
          <select
            value={filtreEtat}
            onChange={(e) => setFiltreEtat(e.target.value as "TOUS" | "ACTIF" | "INACTIF")}
          >
            <option value="TOUS">Tous les états</option>
            <option value="ACTIF">Actifs</option>
            <option value="INACTIF">Désactivés</option>
          </select>
        </div>

        {chargement ? (
          <p style={{ color: "var(--muted)" }}>Chargement…</p>
        ) : comptesFiltres.length === 0 ? (
          <div className="empty">
            {comptes.length === 0
              ? "Aucun compte."
              : "Aucun compte ne correspond aux filtres."}
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Email</th>
                  <th>Rôle</th>
                  <th>État</th>
                  <th>Créé le</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {comptesFiltres.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nom || "—"}</td>
                    <td>{c.email || "—"}</td>
                    <td>{c.role === "ADMIN" ? "Administrateur" : "Lecteur"}</td>
                    <td className={c.actif ? undefined : "warn"}>
                      {c.actif ? "Actif" : "Désactivé"}
                    </td>
                    <td>{fmtDate(String(c.created_at || "").slice(0, 10))}</td>
                    <td>
                      <span className="td-btns">
                        <button
                          className={c.actif ? "btn danger" : "btn"}
                          type="button"
                          onClick={() => basculerActif(c)}
                        >
                          {c.actif ? "Désactiver" : "Réactiver"}
                        </button>
                        <button className="btn" type="button" onClick={() => changerRole(c)}>
                          {c.role === "ADMIN" ? "Passer LECTEUR" : "Passer ADMIN"}
                        </button>
                        <button className="btn secondary" type="button" onClick={() => modifierNom(c)}>
                          Modifier le nom
                        </button>
                        <button className="btn secondary" type="button" onClick={() => reinitialiser(c)}>
                          Réinitialiser le mot de passe
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {node}
    </main>
  );
}
