import { kv } from '@vercel/kv';

function slugify(s) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const SYSTEM_PROMPT = `You are a research assistant for a book review site called "Hype or Not". Given a book title (and possibly author), search the web for real reader and critic reviews, then assess two SEPARATE things:

1. HYPE LEVEL: how loud and aggressive the marketing/buzz was around this book - bestseller lists, celebrity book clubs, huge preorder numbers, viral social media moments, big ad spend. This is about volume of promotion, NOT quality. A quiet literary novel with no marketing push should score low here even if it's brilliant. A heavily marketed book scores high here even if readers end up disappointed.

2. READER SCORE: how much people who actually read the book genuinely rate and love it, based on real review sentiment. This is independent of how much marketing it got.

The relationship between these two numbers is the actual story: a book with LOW hype level and HIGH reader score is a genuine hidden gem that succeeded on merit alone with no manufactured buzz - that is a GOOD thing, not a bad one. A book with HIGH hype level and LOW reader score was oversold. A book with both high is a case where the hype was earned.

Respond with ONLY a raw JSON object, no markdown fences, no preamble, matching exactly this shape:
{
  "title": "string - the book's actual title",
  "author": "string - the author's name",
  "found": true or false,
  "hypeLevel": integer 0-100, how much marketing/buzz volume the book received, independent of quality,
  "readerScore": integer 0-100, how much actual readers genuinely rate and love it,
  "verdict": "short punchy verdict phrase, max 6 words, reflecting the gap between hype level and reader score",
  "verdictSub": "one sentence expanding on the verdict",
  "hype": ["3-4 short bullet strings describing how the book was marketed or hyped, in your own words"],
  "real": ["3-5 short bullet strings summarizing genuine reader/critic sentiment, paraphrased not quoted, include both praise and criticism if both exist"],
  "sources": "one sentence naming the types of sources used and roughly when this reflects, without fabricating specific URLs"
}
If you cannot find enough information to responsibly assess the book, set "found" to false. Never invent reviews or reviewers. Never quote more than a few words verbatim from any single source. No text outside the JSON object.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query } = req.body || {};
  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'Missing book title' });
  }

  const trimmed = query.trim();
  const cacheKey = `book:${slugify(trimmed)}`;

  // 1. Serve from the shared cache if we've already looked this book up before.
  try {
    const cached = await kv.get(cacheKey);
    if (cached) {
      return res.status(200).json({ ...cached, _cached: true });
    }
  } catch (e) {
    console.error('KV read failed', e);
    // Fall through to a live lookup rather than failing the request.
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' });
  }

  // 2. No cache hit — call the Anthropic API with the secret key (never sent to the browser).
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Book: ${trimmed}` }],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error', response.status, errText);
      return res.status(502).json({ error: 'Upstream API error' });
    }

    const data = await response.json();
    const textBlocks = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    const cleaned = textBlocks.replace(/```json|```/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Model did not return parseable JSON');

    const entry = JSON.parse(jsonMatch[0]);

    if (!entry.found) {
      return res.status(200).json({ found: false });
    }

    // 3. Cache the verdict so every future visitor (not just this one) gets an instant answer.
    try {
      await kv.set(cacheKey, entry);
    } catch (e) {
      console.error('KV write failed', e);
    }

    return res.status(200).json({ ...entry, _cached: false });
  } catch (err) {
    console.error('Hype or Not backend error:', err);
    return res.status(500).json({ error: 'Failed to fetch reviews' });
  }
}
