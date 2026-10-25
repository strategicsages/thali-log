import { put, get, list } from "@vercel/blob";
import { isAuthed, KEY_RE, send } from "./_lib.js";

const path = (k) => `thali/${k}.json`;

async function readKey(k) {
  const r = await get(path(k), { access: "private", useCache: false });
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  return JSON.parse(await new Response(r.stream).text());
}

export default async function handler(req, res) {
  if (!isAuthed(req)) return send(res, 401, { error: "unauthorized" });
  try {
    if (req.method === "GET") {
      if (req.query.all) {
        const docs = {};
        let cursor;
        do {
          const page = await list({ prefix: "thali/", cursor, limit: 1000 });
          await Promise.all(page.blobs.map(async (b) => {
            const k = b.pathname.slice(6, -5);
            if (KEY_RE.test(k)) docs[k] = await readKey(k);
          }));
          cursor = page.hasMore ? page.cursor : undefined;
        } while (cursor);
        return send(res, 200, { docs });
      }
      if (req.query.keys) {
        const keys = String(req.query.keys).split(",").filter((k) => KEY_RE.test(k)).slice(0, 40);
        const docs = {};
        await Promise.all(keys.map(async (k) => { docs[k] = await readKey(k).catch(() => null); }));
        return send(res, 200, { docs });
      }
      const k = String(req.query.key || "");
      if (!KEY_RE.test(k)) return send(res, 400, { error: "bad_key" });
      return send(res, 200, { value: await readKey(k) });
    }
    if (req.method === "PUT") {
      const k = String(req.query.key || "");
      if (!KEY_RE.test(k)) return send(res, 400, { error: "bad_key" });
      const body = JSON.stringify(req.body ?? null);
      if (body.length > 3_000_000) return send(res, 413, { error: "too_large" });
      await put(path(k), body, {
        access: "private", allowOverwrite: true, addRandomSuffix: false,
        contentType: "application/json", cacheControlMaxAge: 60,
      });
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: "method" });
  } catch (e) {
    console.error("data error", e && e.message);
    return send(res, 500, { error: "storage_failed" });
  }
}
