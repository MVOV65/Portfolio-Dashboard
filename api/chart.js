// Vercel serverless function — proxies Yahoo Finance chart requests server-side
// to avoid CORS restrictions in the browser.
// Endpoint: /api/chart?symbol=TSLA

export default async function handler(req, res) {
  const { symbol } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'symbol query parameter is required' });
  }

  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=30d&interval=1d&includePrePost=false`;

  try {
    const upstream = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'Yahoo Finance request failed' });
    }

    const data = await upstream.json();
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch chart data', detail: err.message });
  }
}
