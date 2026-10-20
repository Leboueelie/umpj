export interface SessionPayload {
  sub: string;
  role: "ADMIN" | "LECTEUR";
  iat: number;
  exp: number;
}

export function hashPassword(password: string): string;
export function verifyPassword(password: string, stored: string): boolean;
export function signSession(payload: SessionPayload, secret: string): string;
export function verifySession(
  token: string,
  secret: string,
  nowSec?: number
): SessionPayload | null;
export function hashIp(ip: string, secret: string): string;
export function premiereIp(request: Request): string | null;
