import axios from 'axios';

const API_KEY = 'd6hl9ahr01qr5k4cdr80d6hl9ahr01qr5k4cdr8g';
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

export const TICKERS = [...CRYPTO_TICKERS, ...EQUITY_TICKERS];

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

export async function fetchAllQuotes() {
  const results = [];
  for (const symbol of TICKERS) {
    try {
      const quote = await fetchQuote(symbol);
      results.push(quote);
    } catch {
      // skip failed tickers silently
    }
    await delay(200);
  }
  return results;
}

// Yahoo Finance unofficial chart API — no key required
export async function fetchCandles(symbol, days = 30) {
  const yahooSymbol = CRYPTO_MAP[symbol]?.yahooSymbol ?? symbol;
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}` +
    `?range=1mo&interval=1d&includePrePost=false`;

  const { data } = await axios.get(url, {
    headers: { 'Accept': 'application/json' },
  });

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
