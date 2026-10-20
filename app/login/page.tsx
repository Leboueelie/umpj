"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function safeNext(raw: string | null): string {
  if (!raw) return "";
  // Destination interne uniquement : chemin relatif simple (pas //, pas http).
  if (!raw.startsWith("/") || raw.startsWith("//")) return "";
  if (raw.startsWith("/login")) return "";
  return raw;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    if (enCours) return;
    setEnCours(true);
    setErreur("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, motDePasse }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErreur(data.error || "Échec de la connexion.");
        return;
      }
      const cible = next || data.redirect || "/";
      router.push(cible);
      router.refresh();
    } catch {
      setErreur("Erreur de connexion au serveur.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="wrap" style={{ maxWidth: 420, marginTop: 60 }}>
      <header className="app-header" style={{ justifyContent: "center" }}>
        <img src="/logo.png" alt="Logo UMPJ" className="logo" />
      </header>
      <div className="card" style={{ padding: 24 }}>
        <h1 style={{ marginTop: 0, fontSize: 20 }}>
          Université Mondiale de la Prière et du Jeûne
        </h1>
        <p style={{ opacity: 0.8 }}>Connexion réservée aux responsables.</p>
        <form onSubmit={envoyer}>
          <div className="field">
            <label>Adresse email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
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
              autoComplete="current-password"
              required
              maxLength={200}
            />
          </div>
          {erreur && <p className="err">{erreur}</p>}
          <button className="btn" type="submit" disabled={enCours}>
            {enCours ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
