import { makeCookie, clearCookie, isAuthed, safeEqual, send } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method === "GET") return send(res, 200, { ok: isAuthed(req) });
  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", clearCookie());
    return send(res, 200, { ok: false });
  }
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  if (!process.env.APP_PASSCODE || !process.env.SESSION_SECRET) return send(res, 500, { error: "not_configured" });
  const pass = req.body && req.body.passcode;
  if (typeof pass !== "string" || !safeEqual(pass, process.env.APP_PASSCODE)) {
    await new Promise((r) => setTimeout(r, 1200));
    return send(res, 401, { error: "wrong_passcode" });
  }
  res.setHeader("Set-Cookie", makeCookie());
  return send(res, 200, { ok: true });
}
