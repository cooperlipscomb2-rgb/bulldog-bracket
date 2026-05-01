# 🐾 Bulldog Bracket — Deploy Guide

Get `bulldogbracket.vercel.app` live in under 30 minutes.

---

## Step 1 — Supabase Setup (5 min)

1. Go to [supabase.com](https://supabase.com) → your project
2. Click **SQL Editor** in the left sidebar
3. Paste the entire contents of `supabase-schema.sql` and click **Run**
4. Go to **Project Settings → API**
5. Copy these two values — you'll need them soon:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **service_role key** (under "Project API keys" — use the `service_role` one, NOT `anon`)

---

## Step 2 — Push to GitHub (5 min)

```bash
cd bulldog-bracket
git init
git add .
git commit -m "Initial Bulldog Bracket"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/bulldog-bracket.git
git push -u origin main
```

---

## Step 3 — Deploy on Vercel (5 min)

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your `bulldog-bracket` GitHub repo
3. Leave all build settings as default (Vercel auto-detects)
4. Before deploying, click **Environment Variables** and add:

| Name | Value |
|------|-------|
| `SUPABASE_URL` | Your Supabase Project URL |
| `SUPABASE_SERVICE_KEY` | Your Supabase service_role key |

5. Click **Deploy** — done!

Your site will be live at `bulldog-bracket.vercel.app` (or set a custom domain).

---

## Step 4 — Custom Domain (optional, 5 min)

In Vercel → your project → **Settings → Domains**
- Add `bulldogbracket.com` or similar
- Update DNS at your registrar

---

## How It Works

- **Frontend**: Pure HTML/CSS/JS in `/public` — no build step needed
- **Backend**: Vercel serverless functions in `/api`
- **Database**: Supabase Postgres — stores brackets and votes
- **Live Counter**: Server-Sent Events stream from `/api/live`

---

## Costs

| Service | Cost |
|---------|------|
| Vercel | Free (Hobby plan) |
| Supabase | Free (up to 50,000 DB rows) |
| Claude API | ~$0.001 per bracket generation |
| **Total** | **$0/month** |

---

## To add Claude AI autofill later

Add your Claude API key as a Vercel env var: `ANTHROPIC_API_KEY`

Then add `/api/generate.js`:
```js
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic();

export default async function handler(req, res) {
  const { category } = req.body;
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [{ role: 'user', content: `Give me 8 contenders for: ${category}. JSON array only.` }]
  });
  const text = msg.content[0].text.trim();
  return res.json({ contenders: JSON.parse(text) });
}
```

Then call `/api/generate` from the frontend — no API key exposure!
