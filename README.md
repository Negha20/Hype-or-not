# Hype or Not

A reality check before you buy the book everyone's talking about.

## What changed from the prototype

- **`/api/check-book.js`** is a Vercel serverless function. Your Anthropic API key
  lives only in an environment variable on the server — it is never sent to the
  browser or visible in any client-side code.
- **Vercel KV** (a free Redis-compatible database) replaces `window.storage` for
  the review cache. It's a real database that persists across visitors, not just
  one browser tab — so once one person looks up a book, everyone gets the
  instant cached result.
- The **"recently checked" list** stays in the browser's own `localStorage`,
  since that's inherently per-visitor and doesn't need a server round trip.
- No framework is needed — Vercel serves `/public` as static files and
  auto-detects anything in `/api` as a serverless function.

## Deploy it (about 10 minutes)

### 1. Get the code into a GitHub repo
```bash
cd hype-or-not
git init
git add .
git commit -m "Hype or Not"
```
Create an empty repo on GitHub, then:
```bash
git remote add origin <your-repo-url>
git push -u origin main
```

### 2. Import into Vercel
- Go to vercel.com → **Add New → Project** → import that GitHub repo.
- Framework preset: leave it as "Other" (no build step needed).
- Don't deploy yet — add the environment variable and database first (steps 3–4),
  or just deploy and add them after; either order works, Vercel will redeploy
  automatically when you add env vars.

### 3. Add your Anthropic API key
In the project's **Settings → Environment Variables**:
- Name: `ANTHROPIC_API_KEY`
- Value: your key from the Anthropic Console
- Add it for Production (and Preview/Development if you want those to work too)

### 4. Add a free Vercel KV database
In the project's **Storage** tab:
- Click **Create Database → KV**
- Name it anything (e.g. `hype-or-not-cache`)
- Click **Connect to Project** — this automatically adds the `KV_REST_API_URL`
  and `KV_REST_API_TOKEN` environment variables for you. No manual setup needed.
- Vercel KV's free ("Hobby") tier includes a generous monthly request allowance —
  check the current limits on Vercel's pricing page before high-traffic use.

### 5. Deploy
- Trigger a redeploy (Vercel does this automatically after you add env vars, or
  click **Deploy** / **Redeploy** manually).
- Visit the `.vercel.app` URL Vercel gives you — that's your live site.

## Local development
```bash
npm install -g vercel   # one-time
cd hype-or-not
vercel dev
```
`vercel dev` reads `.env` (copy `.env.example` to `.env` and fill in your key)
and emulates both the static file serving and the `/api` functions locally,
including a connection to your Vercel KV database if you've linked the project
with `vercel link`.

## Notes / things you might want to add later
- **Rate limiting**: right now anyone can hit `/api/check-book` with a new,
  never-cached title and trigger a paid Anthropic API call. If this gets shared
  widely, consider adding basic rate limiting (e.g. by IP, using `@vercel/kv` to
  track request counts) so a burst of traffic can't run up your API bill.
- **Custom domain**: Vercel projects support adding your own domain for free
  under **Settings → Domains**.
- **Model name**: the code currently calls `claude-sonnet-4-6`. Swap this in
  `api/check-book.js` for whichever current model string you want to use.
