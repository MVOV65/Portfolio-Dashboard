import axios from 'axios';

const API_KEY = import.meta.env.VITE_FINNHUB_API_KEY;
const BASE_URL = 'https://finnhub.io/api/v1';

const client = axios.create({
  baseURL: BASE_URL,
  params: { token: API_KEY },
});

// Crypto entries: key is the display ID used throughout the app,
// finnhubSymbol is what we send to Finnhub, yahooSymbol is for chart data.
export const CRYPTO_MAP = {
  BTCUSD: { finnhubSymbol: 'BINANCE:BTCUSDT', yahooSymbol: 'BTC-USD', label: 'BTC/USD' },
  ETHUSD: { finnhubSymbol: 'BINANCE:ETHUSDT', yahooSymbol: 'ETH-USD', label: 'ETH/USD' },
  SOLUSD: { finnhubSymbol: 'BINANCE:SOLUSDT', yahooSymbol: 'SOL-USD', label: 'SOL/USD' },
};

export const CRYPTO_TICKERS = Object.keys(CRYPTO_MAP);

export const EQUITY_TICKERS = [
  'NVDA', 'AMD', 'TSLA', 'AMZN', 'PLTR',
  'MSTR', 'DFDV', 'GLXY', 'COIN', 'HOOD',
  'HIMS', 'QQQ', 'TAN', 'VOO', 'GLD',
  'USAR', 'UUUU', 'ONDS', 'IBKR', 'BX',
];

// Sector ETFs fetched in the same loop as main tickers — not shown in TickerTable.
// CRYPTO_MAP entries double as Crypto Large/Mid/Small Cap proxies in SectorPerformance.
export const SECTOR_ETFS = [
  'XLK', 'XLF', 'XLE', 'XLV', 'XLI',
  'XLY', 'XLP', 'XLU', 'XLB', 'XLRE',
];

// Metadata consumed by SectorPerformance — no API calls needed there.
export const SECTOR_META = [
  { ticker: 'XLK',    label: 'Technology',            isCrypto: false },
  { ticker: 'XLF',    label: 'Financials',             isCrypto: false },
  { ticker: 'XLE',    label: 'Energy',                 isCrypto: false },
  { ticker: 'XLV',    label: 'Healthcare',             isCrypto: false },
  { ticker: 'XLI',    label: 'Industrials',            isCrypto: false },
  { ticker: 'XLY',    label: 'Consumer Discretionary', isCrypto: false },
  { ticker: 'XLP',    label: 'Consumer Staples',       isCrypto: false },
  { ticker: 'XLU',    label: 'Utilities',              isCrypto: false },
  { ticker: 'XLB',    label: 'Materials',              isCrypto: false },
  { ticker: 'XLRE',   label: 'Real Estate',            isCrypto: false },
  // Crypto proxies map to existing CRYPTO_MAP keys
  { ticker: 'BTCUSD', label: 'Crypto Large Cap', displayTicker: 'BTC', isCrypto: true },
  { ticker: 'ETHUSD', label: 'Crypto Mid Cap',   displayTicker: 'ETH', isCrypto: true },
  { ticker: 'SOLUSD', label: 'Crypto Small Cap', displayTicker: 'SOL', isCrypto: true },
];

// All tickers fetched in the single sequential loop.
// SECTOR_ETFS are appended at the end; crypto tickers already included via CRYPTO_TICKERS.
export const TICKERS = [...CRYPTO_TICKERS, ...EQUITY_TICKERS, ...SECTOR_ETFS];

// Set for O(1) lookup — used by Dashboard to filter sector ETFs out of TickerTable
export const SECTOR_ETF_SET = new Set(SECTOR_ETFS);

export async function fetchQuote(symbol) {
  const crypto = CRYPTO_MAP[symbol];
  const apiSymbol = crypto ? crypto.finnhubSymbol : symbol;
  const { data } = await client.get('/quote', { params: { symbol: apiSymbol } });
  return {
    symbol,
    label: crypto ? crypto.label : symbol,
    isCrypto: !!crypto,
    c: data.c,
    d: data.d,
    dp: data.dp,
    v: data.v,
  };
}

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// Fetch a single quote with exponential backoff on 429 rate-limit responses
async function fetchQuoteWithBackoff(symbol, maxRetries = 3) {
  let wait = 1000;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const crypto = CRYPTO_MAP[symbol];
      const apiSymbol = crypto ? crypto.finnhubSymbol : symbol;
      const { data, status } = await client.get('/quote', {
        params: { symbol: apiSymbol },
        validateStatus: (s) => s < 500, // don't throw on 4xx so we can inspect
      });

      if (status === 429) {
        if (attempt < maxRetries) {
          await delay(wait);
          wait *= 2; // exponential backoff: 1s, 2s, 4s
          continue;
        }
        return null; // give up after retries
      }

      return {
        symbol,
        label:    crypto ? crypto.label : symbol,
        isCrypto: !!crypto,
        c: data.c, d: data.d, dp: data.dp, v: data.v,
      };
    } catch {
      return null;
    }
  }
  return null;
}

export async function fetchAllQuotes() {
  const results = [];
  for (const symbol of TICKERS) {
    const quote = await fetchQuoteWithBackoff(symbol);
    if (quote) results.push(quote);
    // 400ms between requests = max 150 calls/min, well under Finnhub's 60/min
    // limit per burst window (calls are sequential so real rate is ~2.5/sec)
    await delay(400);
  }
  return results;
}

// Fetch general crypto news from Finnhub's market news endpoint
async function fetchCryptoNews() {
  try {
    const { data } = await client.get('/news', { params: { category: 'crypto' } });
    if (!Array.isArray(data)) return [];
    return data
      .filter((item) => item.headline && item.url)
      .map((item) => ({ ...item, ticker: 'CRYPTO' }));
  } catch {
    return [];
  }
}

// Fetch recent company news for all equity tickers plus general crypto news,
// deduplicated by article id and sorted newest first.
export async function fetchNews() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 7);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  const results = [];

  // Equity company news
  for (const symbol of EQUITY_TICKERS) {
    try {
      const { data } = await client.get('/company-news', {
        params: { symbol, from: fromStr, to: toStr },
      });
      if (Array.isArray(data)) {
        data.forEach((item) => {
          if (item.headline && item.url) {
            results.push({ ...item, ticker: symbol });
          }
        });
      }
    } catch {
      // skip silently
    }
    await delay(400);
  }

  // Crypto market news (single call, no ticker loop)
  const cryptoNews = await fetchCryptoNews();
  results.push(...cryptoNews);

  // Deduplicate by article id, sort newest first
  const seen = new Set();
  return results
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((a, b) => b.datetime - a.datetime);
}

// Yahoo Finance chart data — routed through /api/chart serverless function
// to avoid CORS. Works in both local dev (Vite) and production (Vercel).
export async function fetchCandles(symbol) {
  const yahooSymbol = CRYPTO_MAP[symbol]?.yahooSymbol ?? symbol;
  const url = `/api/chart?symbol=${encodeURIComponent(yahooSymbol)}`;

  const { data } = await axios.get(url);

  const result = data?.chart?.result?.[0];
  if (!result) return [];

  const timestamps = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];

  return timestamps
    .map((ts, i) => ({
      date: new Date(ts * 1000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      close: closes[i] != null ? Number(closes[i].toFixed(2)) : null,
    }))
    .filter((d) => d.close !== null);
}
