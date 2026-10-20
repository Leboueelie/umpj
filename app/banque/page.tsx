"use client";

import { useRouter } from "next/navigation";

// Page provisoire : la Banque d'accomplissements sera développée dans une
// mission ultérieure. Elle n'expose aucune donnée des modules existants.
export default function BanquePage() {
  const router = useRouter();

  async function deconnexion() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="wrap">
      <header className="app-header">
        <img src="/logo.png" alt="Logo UMPJ" className="logo" />
        <h1 style={{ margin: 0, fontSize: 22 }}>Banque d&apos;accomplissements</h1>
        <button className="btn" onClick={deconnexion} style={{ marginLeft: "auto" }}>
          Se déconnecter
        </button>
      </header>
      <div className="card" style={{ padding: 24 }}>
        <p style={{ fontSize: 16, margin: 0 }}>
          <strong>Banque d&apos;accomplissements en préparation.</strong>
        </p>
        <p style={{ opacity: 0.8 }}>
          La consultation des accomplissements, les recherches par période et
          la génération de comptes rendus seront disponibles dans une prochaine
          version de l&apos;application.
        </p>
      </div>
    </div>
  );
}
