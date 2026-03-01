// Cron: daily at 06:00 ET = 11:00 UTC  (schedule: "0 11 * * *")
// Fetches CNN Fear & Greed Index and stores under "fear_greed" in Redis.

import { redis } from '../_redis.js';

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const upstream = await fetch(
      'https://production.dataviz.cnn.io/index/fearandgreed/graphdata',
      {
        headers: {
          Accept:     'application/json',
          'User-Agent': 'Mozilla/5.0',
          Referer:    'https://www.cnn.com/',
        },
      }
    );

    if (!upstream.ok) {
      throw new Error(`CNN API returned HTTP ${upstream.status}`);
    }

    const data = await upstream.json();
    const payload = { ...data, cachedAt: new Date().toISOString() };
    await redis.set('fear_greed', JSON.stringify(payload));

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('sentiment cron error:', err);
    return res.status(500).json({ error: err.message });
  }
}
