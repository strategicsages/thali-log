# Thali Log

A phone-first calorie and protein tracker for Indian vegetarian food. Log by voice, photo or text. Claude estimates calories and protein per item. You can edit the numbers before adding.

Built for a one-month personal test. Single user, passcode login.

## What it does

- Today: calorie ring, protein bar, sev tracker, "What should I eat next?"
- Week: 7-day calorie chart, weight log (luteal-phase weigh-ins show as hollow dots)
- Me: targets, cycle, blood report reading, background notes, JSON backup and restore, test-month stats

Calorie target: Mifflin-St Jeor times an activity factor, minus 750 kcal, floor 1200 (women) or 1500 (men), plus 100 kcal in the luteal phase. Protein: 1.2 g per kg.

## Stack

- `public/index.html`: the whole app (one file, no build step), installable as a home-screen app
- `api/auth.js`: passcode login, signed HttpOnly cookie
- `api/data.js`: reads and writes JSON documents in a private Vercel Blob store
- `api/estimate.js`: calls the Anthropic Messages API from the server and logs token usage per day

## Environment variables

See `.env.example`.

| Name | Purpose |
| --- | --- |
| `APP_PASSCODE` | Passcode for the login screen |
| `SESSION_SECRET` | Random string that signs the login cookie |
| `ANTHROPIC_API_KEY` | Key from console.anthropic.com |
| `BLOB_READ_WRITE_TOKEN` | Added when a Blob store is connected to the project |
| `ANTHROPIC_MODEL`, `ANTHROPIC_MODEL_QUICK` | Optional model overrides |

## Deploy

1. Push this repo to GitHub and import it in Vercel.
2. Storage tab: create a **private** Blob store and connect it to the project.
3. Add the environment variables above, then redeploy.
4. On iPhone: open the URL in Safari, Share, Add to Home Screen.

## Run locally

```
npm i -g vercel
vercel link
vercel env pull
vercel dev
```

## Before charging anyone

This version is for one person. To sell it you need real accounts (email or phone login), a database with per-user rows, payments (Razorpay or Stripe), rate limits and cost caps per user, and health-data compliance (India DPDP, GDPR if you serve the EU). Keep the Anthropic key on the server only.
