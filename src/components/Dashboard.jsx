import { useState, useEffect, useCallback, useRef } from 'react';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import TickerTable from './TickerTable';
import StockChart from './StockChart';
import NewsFeed from './NewsFeed';
import EconomicCalendar from './EconomicCalendar';
import Heatmap from './Heatmap';
import SectorPerformance from './SectorPerformance';
import MarketSentiment from './MarketSentiment';
import { fetchAllQuotes, TICKERS, CRYPTO_TICKERS, CRYPTO_MAP, SECTOR_ETF_SET } from '../services/finnhub';

const REFRESH_INTERVAL = 10_000; // 10 seconds
const STORAGE_KEY      = 'mkt-layout-v2';
const ROW_HEIGHT       = 60;
const MARGIN           = 4;

// Given an available pixel height and a desired number of stacked panels,
// return the h value (in row units) such that the panels fill the space exactly.
// Formula: totalPx = n * h * ROW_HEIGHT + (n*h - 1) * MARGIN
// Solving: h = floor((totalPx + MARGIN) / (n * (ROW_HEIGHT + MARGIN)))
function fitH(totalPx, n) {
  return Math.max(3, Math.floor((totalPx + MARGIN) / (n * (ROW_HEIGHT + MARGIN))));
}

function buildDefaultLayout(headerH) {
  const canvasPx = window.innerHeight - headerH;
  const halfH    = fitH(canvasPx, 2);
  // Sector panel: full width, sized to fit 13 rows (~30px each) + handle
  const sectorH  = Math.max(3, Math.round((13 * 34 + 40 + MARGIN) / (ROW_HEIGHT + MARGIN)));
  return [
    { i: 'ticker', x: 0, y: 0,           w: 6,  h: halfH,  minW: 2, minH: 3 },
    { i: 'news',   x: 6, y: 0,           w: 6,  h: halfH,  minW: 2, minH: 3 },
    { i: 'empty1', x: 0, y: halfH,       w: 6,  h: halfH,  minW: 2, minH: 3 },
    { i: 'empty2', x: 6, y: halfH,       w: 6,  h: halfH,  minW: 2, minH: 3 },
    { i: 'sector',    x: 0, y: halfH * 2,            w: 9, h: sectorH, minW: 4, minH: 3 },
    { i: 'sentiment', x: 9, y: halfH * 2,            w: 3, h: sectorH, minW: 2, minH: 3 },
  ];
}

const REQUIRED_PANELS = ['ticker', 'news', 'empty1', 'empty2', 'sector', 'sentiment'];

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const savedKeys = new Set(parsed.map((item) => item.i));
        if (REQUIRED_PANELS.every((key) => savedKeys.has(key))) return parsed;
      }
    }
  } catch { /* ignore */ }
  return null;
}

function Countdown({ seconds }) {
  return (
    <span className="countdown">
      REFRESH IN {String(seconds).padStart(2, '0')}s
    </span>
  );
}

export default function Dashboard() {
  const headerRef    = useRef(null);
  const userActedRef = useRef(false);

  // TICKERS includes crypto, equity watchlist, AND sector ETFs.
  // Sector ETFs are filtered out before rendering TickerTable / Heatmap.
  const [quotes, setQuotes] = useState(() =>
    TICKERS.map((sym) => ({
      symbol: sym, label: CRYPTO_MAP[sym]?.label ?? sym,
      isCrypto: !!CRYPTO_MAP[sym], c: null, d: null, dp: null, v: null,
    }))
  );
  const [loading, setLoading]         = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [countdown, setCountdown]     = useState(REFRESH_INTERVAL / 1000);
  const [refreshKey, setRefreshKey]   = useState(0);
  const [openCharts, setOpenCharts]   = useState([]);
  const [layout, setLayout]           = useState(() => loadSaved() ?? buildDefaultLayout(60));
  const [gridWidth, setGridWidth]     = useState(window.innerWidth);

  // After first paint we know the real header height — rebuild if no saved layout
  useEffect(() => {
    if (!loadSaved()) {
      setLayout(buildDefaultLayout(headerRef.current?.offsetHeight ??60));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onResize = () => setGridWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleLayoutChange = useCallback((next) => {
    setLayout(next);
    if (userActedRef.current) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    }
  }, []);

  const markActed = useCallback(() => { userActedRef.current = true; }, []);

  const loadQuotes = useCallback(async () => {
    try {
      const fresh = await fetchAllQuotes();
      if (fresh.length > 0) {
        setQuotes((prev) => {
          const prevMap  = Object.fromEntries(prev.map((q) => [q.symbol, q]));
          const freshMap = Object.fromEntries(fresh.map((q) => [q.symbol, q]));
          // TICKERS now includes sector ETFs — merge all of them
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
    const iv = setInterval(loadQuotes, REFRESH_INTERVAL);
    return () => clearInterval(iv);
  }, [loadQuotes]);

  useEffect(() => {
    const tick = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(tick);
  }, []);

  const openChart  = useCallback((sym) => setOpenCharts((p) => p.includes(sym) ? p : [...p, sym]), []);
  const closeChart = useCallback((sym) => setOpenCharts((p) => p.filter((s) => s !== sym)), []);

  // Sector ETFs are fetched in the shared loop but should NOT appear in the
  // TickerTable or Heatmap — those panels show only watchlist tickers.
  const watchlistQuotes = quotes.filter((q) => !SECTOR_ETF_SET.has(q.symbol));

  return (
    <div className="dashboard">
      <header ref={headerRef} className="dash-header">
        <div className="dash-title">
          <span className="title-bracket">[</span>
          <span className="title-text">MARKET TERMINAL</span>
          <span className="title-bracket">]</span>
        </div>
        <div className="dash-meta">
          {lastUpdated && (
            <span className="last-updated">UPDATED {lastUpdated.toLocaleTimeString()}</span>
          )}
          <Countdown seconds={countdown} />
          <button className="refresh-btn" onClick={loadQuotes}>⟳ REFRESH</button>
        </div>
      </header>

      <main className="dash-main">
        <GridLayout
          layout={layout}
          cols={12}
          rowHeight={ROW_HEIGHT}
          width={gridWidth}
          onLayoutChange={handleLayoutChange}
          onDragStart={markActed}
          onResizeStart={markActed}
          draggableHandle=".module-drag-handle"
          margin={[MARGIN, MARGIN]}
          containerPadding={[MARGIN, MARGIN]}
          isDraggable
          isResizable
          resizeHandles={['se']}
        >
          <div key="ticker" className="grid-module">
            <div className="module-drag-handle">
              <span>⠿ TICKER FEED</span>
              {loading && <span className="loading-badge">LOADING…</span>}
            </div>
            <div className="module-content">
              <TickerTable
                quotes={watchlistQuotes}
                onTickerClick={openChart}
                refreshKey={refreshKey}
                cryptoTickers={CRYPTO_TICKERS}
              />
            </div>
          </div>

          <div key="news" className="grid-module">
            <div className="module-drag-handle">
              <span>⠿ NEWS FEED</span>
            </div>
            <div className="module-content">
              <NewsFeed />
            </div>
          </div>
          <div key="empty1" className="grid-module">
            <div className="module-drag-handle">
              <span>⠿ ECONOMIC CALENDAR</span>
            </div>
            <div className="module-content">
              <EconomicCalendar />
            </div>
          </div>

          <div key="empty2" className="grid-module">
            <div className="module-drag-handle">
              <span>⠿ HEATMAP</span>
            </div>
            <div className="module-content">
              <Heatmap quotes={watchlistQuotes} onClickTicker={openChart} />
            </div>
          </div>

          <div key="sector" className="grid-module">
            <div className="module-drag-handle">
              <span>⠿ SECTOR PERFORMANCE</span>
            </div>
            <div className="module-content">
              <SectorPerformance quotes={quotes} />
            </div>
          </div>

          <div key="sentiment" className="grid-module">
            <div className="module-drag-handle">
              <span>⠿ MARKET SENTIMENT</span>
            </div>
            <div className="module-content">
              <MarketSentiment />
            </div>
          </div>
        </GridLayout>
      </main>

      {openCharts.map((symbol) => {
        const q = quotes.find((x) => x.symbol === symbol);
        return (
          <StockChart key={symbol} symbol={symbol} label={q?.label} onClose={() => closeChart(symbol)} />
        );
      })}
    </div>
  );
}
