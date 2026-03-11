// Read endpoint: /api/sentiment
// Returns cached CNN Fear & Greed data from Redis (key: fear_greed).
// If the cache is empty, triggers a one-time live fetch as a cold-start fallback.

import { redis } from './_redis.js';

const CNN_URL = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';

async function liveFetch() {
  const upstream = await fetch(CNN_URL, {
    headers: {
      Accept:         'application/json',
      'User-Agent':   'Mozilla/5.0 (compatible; MarketTerminal/1.0)',
      Referer:        'https://www.cnn.com/',
      Origin:         'https://www.cnn.com',
    },
  });

  if (!upstream.ok) {
    const body = await upstream.text().catch(() => '');
    throw new Error(`CNN API returned HTTP ${upstream.status}: ${body.slice(0, 120)}`);
  }

  const contentType = upstream.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const body = await upstream.text().catch(() => '');
    throw new Error(`CNN API returned non-JSON (${contentType}): ${body.slice(0, 120)}`);
  }

  return upstream.json();
}

export default async function handler(req, res) {
  // ── 1. Try Redis cache first ──────────────────────────────────────────────
  let cached = null;
  try {
    const raw = await redis.get('fear_greed');
    if (raw !== null) {
      // @upstash/redis auto-parses JSON; guard against both string and object
      cached = typeof raw === 'string' ? JSON.parse(raw) : raw;
    }
  } catch (redisErr) {
    console.error('Redis read error:', redisErr.message);
    // Continue — will attempt live fetch below
  }

  if (cached) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(cached);
  }

  // ── 2. Cold-start: cache empty → live fetch ───────────────────────────────
  try {
    const data    = await liveFetch();
    const payload = { ...data, cachedAt: new Date().toISOString() };

    // Write to cache best-effort — don't let a Redis write failure block the response
    try {
      await redis.set('fear_greed', JSON.stringify(payload));
    } catch (writeErr) {
      console.error('Redis write error:', writeErr.message);
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(payload);
  } catch (fetchErr) {
    console.error('CNN live fetch error:', fetchErr.message);
    return res.status(502).json({
      error:  'Fear & Greed data unavailable',
      detail: fetchErr.message,
    });
  }
}
