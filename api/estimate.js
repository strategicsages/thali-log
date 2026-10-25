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

const PROVIDERS = {
  gemini: { key: "GEMINI_API_KEY", model: "gemini-2.5-flash", quick: "gemini-2.5-flash-lite" },
  groq: { key: "GROQ_API_KEY", model: "meta-llama/llama-4-scout-17b-16e-instruct", quick: "meta-llama/llama-4-scout-17b-16e-instruct", base: "https://api.groq.com/openai/v1" },
  openrouter: { key: "OPENROUTER_API_KEY", model: "meta-llama/llama-4-scout:free", quick: "meta-llama/llama-4-scout:free", base: "https://openrouter.ai/api/v1" },
  anthropic: { key: "ANTHROPIC_API_KEY", model: "claude-sonnet-5-5", quick: "claude-haiku-5-5" },
};

async function callModel(provider, model, prompt, images) {
  const cfg = PROVIDERS[provider];
  const key = process.env[cfg.key];
  if (provider === "gemini") {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [...images.map((im) => ({ inline_data: { mime_type: im.media_type, data: im.data } })), { text: prompt }] }],
        generationConfig: { maxOutputTokens: 4000, temperature: 0.3 },
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { status: r.status, body: j };
    const c = j.candidates?.[0];
    return {
      text: (c?.content?.parts || []).map((x) => x.text || "").join(""),
      truncated: c?.finishReason === "MAX_TOKENS",
      usage: { in: j.usageMetadata?.promptTokenCount || 0, out: j.usageMetadata?.candidatesTokenCount || 0 },
    };
  }
  if (provider === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model, max_tokens: 2000,
        messages: [{ role: "user", content: [...images.map((im) => ({ type: "image", source: { type: "base64", media_type: im.media_type, data: im.data } })), { type: "text", text: prompt }] }],
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { status: r.status, body: j };
    return {
      text: (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join(""),
      truncated: j.stop_reason === "max_tokens",
      usage: { in: j.usage?.input_tokens || 0, out: j.usage?.output_tokens || 0 },
    };
  }
  const r = await fetch(cfg.base + "/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + key },
    body: JSON.stringify({
      model, max_tokens: 2000, temperature: 0.3,
      messages: [{ role: "user", content: [...images.map((im) => ({ type: "image_url", image_url: { url: `data:${im.media_type};base64,${im.data}` } })), { type: "text", text: prompt }] }],
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { status: r.status, body: j };
  return {
    text: j.choices?.[0]?.message?.content || "",
    truncated: j.choices?.[0]?.finish_reason === "length",
    usage: { in: j.usage?.prompt_tokens || 0, out: j.usage?.completion_tokens || 0 },
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  if (!isAuthed(req)) return send(res, 401, { error: "unauthorized" });
  const provider = (process.env.LLM_PROVIDER || "gemini").toLowerCase();
  const cfg = PROVIDERS[provider];
  if (!cfg) return send(res, 500, { error: "bad_provider" });
  if (!process.env[cfg.key]) return send(res, 500, { error: "no_key" });

  const { prompt, images = [], tier = "default", day } = req.body || {};
  if (typeof prompt !== "string" || !prompt || prompt.length > 40000) return send(res, 400, { error: "bad_prompt" });
  if (!Array.isArray(images) || images.length > 5) return send(res, 400, { error: "too_many_images" });
  for (const im of images) {
    if (!im || !OK_TYPES.has(im.media_type) || typeof im.data !== "string") return send(res, 400, { error: "image_rejected" });
  }

  const model = tier === "quick"
    ? process.env.LLM_MODEL_QUICK || process.env.LLM_MODEL || cfg.quick
    : process.env.LLM_MODEL || cfg.model;

  let out;
  try { out = await callModel(provider, model, prompt, images); }
  catch (e) { return send(res, 502, { error: "network" }); }
  if (out.status) {
    console.error("llm error", provider, out.status, JSON.stringify(out.body).slice(0, 300));
    if (out.status === 429) return send(res, 429, { error: "rate_limited" });
    if (out.status === 401 || out.status === 403) return send(res, 500, { error: "bad_key" });
    if (out.status === 400 && images.length) return send(res, 400, { error: "image_rejected" });
    return send(res, 502, { error: "upstream" });
  }
  await logUsage(/^\d{4}-\d{2}-\d{2}$/.test(day || "") ? day : new Date().toISOString().slice(0, 10), { input_tokens: out.usage.in, output_tokens: out.usage.out });
  return send(res, 200, { text: out.text, truncated: out.truncated, model, provider });
}
