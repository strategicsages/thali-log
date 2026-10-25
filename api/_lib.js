import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "thali_s";
const MAX_AGE = 60 * 24 * 3600;

const sign = (payload) =>
  createHmac("sha256", process.env.SESSION_SECRET || "").update(payload).digest("base64url");

export function makeCookie() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + MAX_AGE * 1000 })).toString("base64url");
  const value = payload + "." + sign(payload);
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export function isAuthed(req) {
  if (!process.env.SESSION_SECRET) return false;
  const m = /(?:^|;\s*)thali_s=([^;]+)/.exec(req.headers.cookie || "");
  if (!m) return false;
  const [payload, mac] = m[1].split(".");
  if (!payload || !mac) return false;
  const want = Buffer.from(sign(payload));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > Date.now(); }
  catch { return false; }
}

export function safeEqual(a, b) {
  const x = createHmac("sha256", "k").update(String(a)).digest();
  const y = createHmac("sha256", "k").update(String(b)).digest();
  return timingSafeEqual(x, y);
}

export const KEY_RE = /^(profile|usage|d\d{4}-\d{2}-\d{2})$/;
export const send = (res, code, body) => res.status(code).json(body);
