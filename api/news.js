// Read endpoint: /api/news
// Returns cached news from Redis (key: news_feed).
// If the cache is empty, triggers a one-time live fetch as a cold-start fallback
// and stores the result before returning it.

import { redis } from './_redis.js';

const FINNHUB_KEY = process.env.VITE_FINNHUB_API_KEY;
const BASE        = 'https://finnhub.io/api/v1';

const EQUITY_TICKERS = [
  'NVDA','AMD','TSLA','AMZN','PLTR',
  'MSTR','DFDV','GLXY','COIN','HOOD',
  'HIMS','QQQ','TAN','VOO','GLD',
  'USAR','UUUU','ONDS','IBKR','BX',
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function liveFetch() {
  const to   = new Date();
  const from = new Date(); from.setDate(from.getDate() - 7);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr   = to.toISOString().slice(0, 10);
  const articles = [];

  for (const symbol of EQUITY_TICKERS) {
    try {
      const res = await fetch(
        `${BASE}/company-news?symbol=${symbol}&from=${fromStr}&to=${toStr}&token=${FINNHUB_KEY}`
      );
      const data = await res.json();
      if (Array.isArray(data)) {
        data.forEach((item) => {
          if (item.headline && item.url) articles.push({ ...item, ticker: symbol });
        });
      }
    } catch { /* skip */ }
    await delay(300);
  }

  try {
    const res = await fetch(`${BASE}/news?category=crypto&token=${FINNHUB_KEY}`);
    const cryptoData = await res.json();
    if (Array.isArray(cryptoData)) {
      cryptoData.filter((i) => i.headline && i.url)
        .forEach((item) => articles.push({ ...item, ticker: 'CRYPTO' }));
    }
  } catch { /* skip */ }

  const seen = new Set();
  return articles
    .filter((item) => { if (seen.has(item.id)) return false; seen.add(item.id); return true; })
    .sort((a, b) => b.datetime - a.datetime);
}

export default async function handler(req, res) {
  try {
    let raw = await redis.get('news_feed');

    // Cold-start fallback: cache is empty, do a live fetch and prime the cache
    if (!raw) {
      const articles = await liveFetch();
      const payload  = { articles, cachedAt: new Date().toISOString() };
      await redis.set('news_feed', JSON.stringify(payload));
      raw = JSON.stringify(payload);
    }

    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read news cache', detail: err.message });
  }
}
