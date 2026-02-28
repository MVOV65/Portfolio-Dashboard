import { useState, useEffect, useCallback } from 'react';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import TickerTable from './TickerTable';
import StockChart from './StockChart';
import { fetchAllQuotes, TICKERS, CRYPTO_TICKERS, CRYPTO_MAP } from '../services/finnhub';

const REFRESH_INTERVAL = 5_000;

const DEFAULT_LAYOUT = [
  { i: 'ticker-table', x: 0, y: 0, w: 12, h: 22, minW: 6, minH: 10 },
];

function Countdown({ seconds }) {
  return (
    <span className="countdown">
      REFRESH IN {String(seconds).padStart(2, '0')}s
    </span>
  );
}

export default function Dashboard() {
  const [quotes, setQuotes] = useState(() =>
    TICKERS.map((sym) => ({
      symbol: sym,
      label: CRYPTO_MAP[sym]?.label ?? sym,
      isCrypto: !!CRYPTO_MAP[sym],
      c: null, d: null, dp: null, v: null,
    }))
  );
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);
  const [refreshKey, setRefreshKey] = useState(0);
  const [openCharts, setOpenCharts] = useState([]);
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth - 32);

  const loadQuotes = useCallback(async () => {
    try {
      const fresh = await fetchAllQuotes();
      if (fresh.length > 0) {
        setQuotes((prev) => {
          // Build a map of previous quotes so stale tickers are preserved
          const prevMap = Object.fromEntries(prev.map((q) => [q.symbol, q]));
          const freshMap = Object.fromEntries(fresh.map((q) => [q.symbol, q]));
          // Merge: fresh data wins; missing tickers fall back to last known value
          return TICKERS.map((sym) => freshMap[sym] ?? prevMap[sym]).filter(Boolean);
        });
        setLastUpdated(new Date());
        setRefreshKey((k) => k + 1);
      }
      setCountdown(REFRESH_INTERVAL / 1000);
    } catch (e) {
      console.error('Failed to fetch quotes', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQuotes();
    const interval = setInterval(loadQuotes, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadQuotes]);

  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth - 32);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const openChart = useCallback((symbol) => {
    setOpenCharts((prev) =>
      prev.includes(symbol) ? prev : [...prev, symbol]
    );
  }, []);

  const closeChart = useCallback((symbol) => {
    setOpenCharts((prev) => prev.filter((s) => s !== symbol));
  }, []);

  return (
    <div className="dashboard">
      <header className="dash-header">
        <div className="dash-title">
          <span className="title-bracket">[</span>
          <span className="title-text">MARKET TERMINAL</span>
          <span className="title-bracket">]</span>
        </div>
        <div className="dash-meta">
          {lastUpdated && (
            <span className="last-updated">
              UPDATED {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <Countdown seconds={countdown} />
          <button className="refresh-btn" onClick={loadQuotes}>⟳ REFRESH</button>
        </div>
      </header>

      <main className="dash-main">
        <GridLayout
          className="layout"
          layout={layout}
          cols={12}
          rowHeight={28}
          width={windowWidth}
          onLayoutChange={setLayout}
          draggableHandle=".module-drag-handle"
          margin={[12, 12]}
        >
          <div key="ticker-table" className="grid-module">
            <div className="module-drag-handle">
              <span>⠿ TICKER FEED</span>
              {loading && <span className="loading-badge">LOADING…</span>}
            </div>
            <div className="module-content">
              <TickerTable quotes={quotes} onTickerClick={openChart} refreshKey={refreshKey} cryptoTickers={CRYPTO_TICKERS} />
            </div>
          </div>
        </GridLayout>
      </main>

      {openCharts.map((symbol) => {
        const q = quotes.find((x) => x.symbol === symbol);
        return (
          <StockChart
            key={symbol}
            symbol={symbol}
            label={q?.label}
            onClose={() => closeChart(symbol)}
          />
        );
      })}
    </div>
  );
}
