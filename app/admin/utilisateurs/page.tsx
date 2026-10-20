"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFeedback } from "@/components/Feedback";

type Compte = {
  id: string;
  email: string;
  role: "ADMIN" | "LECTEUR";
  actif: boolean;
  created_at: string;
  updated_at: string;
};

async function api<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data as T;
}

export default function AdminUtilisateursPage() {
  const { confirm, prompt, toast, node } = useFeedback();
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [erreur, setErreur] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [role, setRole] = useState<"ADMIN" | "LECTEUR">("LECTEUR");
  const [enCours, setEnCours] = useState(false);

  async function charger() {
    try {
      setComptes(await api<Compte[]>("/api/admin/utilisateurs"));
      setErreur("");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur de chargement.");
    }
  }

  useEffect(() => {
    charger();
  }, []);

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    if (enCours) return;
    setEnCours(true);
    try {
      await api("/api/admin/utilisateurs", {
        method: "POST",
        body: JSON.stringify({ email, motDePasse, role }),
      });
      setEmail("");
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
    <div className="wrap">
      <Link href="/" className="back-link">
        ← Accueil
      </Link>
      <header className="app-header">
        <img src="/logo.png" alt="Logo UMPJ" className="logo" />
        <h1 style={{ margin: 0, fontSize: 22 }}>Gestion des utilisateurs</h1>
      </header>
      {node}
      {erreur && <p className="err">{erreur}</p>}

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Créer un compte</h2>
        <form onSubmit={creer} className="filters" style={{ alignItems: "flex-end" }}>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={254}
            />
          </div>
          <div className="field">
            <label>Mot de passe</label>
            <input
              type="password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              required
              minLength={8}
              maxLength={200}
              autoComplete="new-password"
            />
          </div>
          <div className="field">
            <label>Rôle</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "ADMIN" | "LECTEUR")}
            >
              <option value="LECTEUR">Lecteur</option>
              <option value="ADMIN">Administrateur</option>
            </select>
          </div>
          <button className="btn" type="submit" disabled={enCours}>
            {enCours ? "Création…" : "Créer"}
          </button>
        </form>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Comptes existants</h2>
        {comptes.length === 0 ? (
          <p className="empty">Aucun compte.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,.2)" }}>
                <th style={{ padding: "6px 8px" }}>Email</th>
                <th style={{ padding: "6px 8px" }}>Rôle</th>
                <th style={{ padding: "6px 8px" }}>État</th>
                <th style={{ padding: "6px 8px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {comptes.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,.08)" }}>
                  <td style={{ padding: "8px" }}>{c.email}</td>
                  <td style={{ padding: "8px" }}>{c.role}</td>
                  <td style={{ padding: "8px" }}>
                    {c.actif ? "Actif" : "Désactivé"}
                  </td>
                  <td style={{ padding: "8px" }}>
                    <button
                      className="btn"
                      onClick={() => basculerActif(c)}
                      style={{ marginRight: 8 }}
                    >
                      {c.actif ? "Désactiver" : "Réactiver"}
                    </button>
                    <button
                      className="btn"
                      onClick={() => changerRole(c)}
                      style={{ marginRight: 8 }}
                    >
                      {c.role === "ADMIN" ? "Passer LECTEUR" : "Passer ADMIN"}
                    </button>
                    <button className="btn" onClick={() => reinitialiser(c)}>
                      Réinitialiser le mot de passe
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
