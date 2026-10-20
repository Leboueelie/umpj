import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pool } from "@/lib/db";
import { verifySession } from "@/lib/auth-core.mjs";
import { SESSION_COOKIE, journaliser } from "@/lib/auth";

// Déconnexion : révocation serveur (le jeton devient invalide pour TOUS les
// appareils car sessions_invalides_apres est mis à jour) + effacement du cookie.
export async function POST() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token && process.env.AUTH_SECRET) {
    const session = verifySession(token, process.env.AUTH_SECRET);
    if (session) {
      try {
        await pool.query(
          `UPDATE "Utilisateur"
           SET sessions_invalides_apres = now(), updated_at = now()
           WHERE id = $1`,
          [session.sub]
        );
        const u = await pool.query(
          `SELECT email FROM "Utilisateur" WHERE id = $1`,
          [session.sub]
        );
        if (u.rowCount) await journaliser(u.rows[0].email, "deconnexion", session.sub, {});
      } catch {
        // La déconnexion du client reste effective même si la base échoue.
      }
    }
  }
  store.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
