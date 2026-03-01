// Vercel serverless function — proxies CNN Fear & Greed API to avoid CORS.
// Endpoint: /api/feargreed

export default async function handler(req, res) {
  try {
    const upstream = await fetch(
      'https://production.dataviz.cnn.io/index/fearandgreed/graphdata',
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0',
          'Referer': 'https://www.cnn.com/',
        },
      }
    );

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'CNN API request failed' });
    }

    const data = await upstream.json();
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch Fear & Greed data', detail: err.message });
  }
}
