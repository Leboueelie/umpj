// Client HTTP partagé pour les pages (mission FRONT-01).
// Centralise fetch + parsing JSON + gestion d'erreur, pour éviter la duplication
// du helper `api()` dans chaque page.

export async function api<T = unknown>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur serveur");
  return data as T;
}
