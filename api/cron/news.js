// Cron: every 30 minutes  (schedule: "*/30 * * * *")
// Fetches Finnhub company-news for all equity tickers + general crypto news,
// deduplicates, sorts newest-first, and stores the result in Redis under
// the key "news_feed" with a cachedAt timestamp.

import { redis } from '../_redis.js';

const FINNHUB_KEY = process.env.VITE_FINNHUB_API_KEY;
const BASE        = 'https://finnhub.io/api/v1';

const EQUITY_TICKERS = [
  'NVDA','AMD','TSLA','AMZN','PLTR',
  'MSTR','DFDV','GLXY','COIN','HOOD',
  'HIMS','QQQ','TAN','VOO','GLD',
  'USAR','UUUU','ONDS','IBKR','BX',
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  // Vercel cron requests include the Authorization header with CRON_SECRET
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const to   = new Date();
    const from = new Date(); from.setDate(from.getDate() - 7);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr   = to.toISOString().slice(0, 10);

    const articles = [];

    // Equity news — staggered 300ms to stay within Finnhub rate limit
    for (const symbol of EQUITY_TICKERS) {
      try {
        const data = await fetchJson(
          `${BASE}/company-news?symbol=${symbol}&from=${fromStr}&to=${toStr}&token=${FINNHUB_KEY}`
        );
        if (Array.isArray(data)) {
          data.forEach((item) => {
            if (item.headline && item.url) articles.push({ ...item, ticker: symbol });
          });
        }
      } catch { /* skip failed ticker */ }
      await delay(300);
    }

    // Crypto general news (single call)
    try {
      const cryptoData = await fetchJson(`${BASE}/news?category=crypto&token=${FINNHUB_KEY}`);
      if (Array.isArray(cryptoData)) {
        cryptoData
          .filter((item) => item.headline && item.url)
          .forEach((item) => articles.push({ ...item, ticker: 'CRYPTO' }));
      }
    } catch { /* skip */ }

    // Deduplicate + sort newest-first
    const seen = new Set();
    const deduped = articles
      .filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      })
      .sort((a, b) => b.datetime - a.datetime);

    const payload = { articles: deduped, cachedAt: new Date().toISOString() };
    await redis.set('news_feed', JSON.stringify(payload));

    return res.status(200).json({ ok: true, count: deduped.length });
  } catch (err) {
    console.error('news cron error:', err);
    return res.status(500).json({ error: err.message });
  }
}
