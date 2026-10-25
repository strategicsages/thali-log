import { put, get } from "@vercel/blob";
import { isAuthed, send } from "./_lib.js";

const OK_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

async function logUsage(day, usage) {
  try {
    let doc = { days: {} };
    const r = await get("thali/usage.json", { access: "private", useCache: false });
    if (r && r.statusCode === 200 && r.stream) doc = JSON.parse(await new Response(r.stream).text());
    const d = (doc.days[day] ||= { calls: 0, in: 0, out: 0 });
    d.calls += 1; d.in += usage?.input_tokens || 0; d.out += usage?.output_tokens || 0;
    await put("thali/usage.json", JSON.stringify(doc), {
      access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json",
    });
  } catch (e) { console.error("usage log failed", e && e.message); }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  if (!isAuthed(req)) return send(res, 401, { error: "unauthorized" });
  if (!process.env.ANTHROPIC_API_KEY) return send(res, 500, { error: "no_key" });

  const { prompt, images = [], tier = "default", day } = req.body || {};
  if (typeof prompt !== "string" || !prompt || prompt.length > 40000) return send(res, 400, { error: "bad_prompt" });
  if (!Array.isArray(images) || images.length > 5) return send(res, 400, { error: "too_many_images" });
  for (const im of images) {
    if (!im || !OK_TYPES.has(im.media_type) || typeof im.data !== "string") return send(res, 400, { error: "image_rejected" });
  }

  const model = tier === "quick"
    ? process.env.ANTHROPIC_MODEL_QUICK || "claude-haiku-5-5"
    : process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
  const content = [
    ...images.map((im) => ({ type: "image", source: { type: "base64", media_type: im.media_type, data: im.data } })),
    { type: "text", text: prompt },
  ];

  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens: 2000, messages: [{ role: "user", content }] }),
    });
  } catch (e) {
    return send(res, 502, { error: "network" });
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("anthropic error", r.status, JSON.stringify(j).slice(0, 300));
    if (r.status === 429) return send(res, 429, { error: "rate_limited" });
    if (r.status === 401) return send(res, 500, { error: "bad_key" });
    if (r.status === 400 && images.length) return send(res, 400, { error: "image_rejected" });
    return send(res, 502, { error: "upstream" });
  }
  const text = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  await logUsage(/^\d{4}-\d{2}-\d{2}$/.test(day || "") ? day : new Date().toISOString().slice(0, 10), j.usage);
  return send(res, 200, { text, truncated: j.stop_reason === "max_tokens", model });
}
