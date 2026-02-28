import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchNews } from '../services/finnhub';

const NEWS_REFRESH_INTERVAL = 5 * 60 * 1000;

function timeAgo(unixSeconds) {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/* ─── Resizable Article Modal ─────────────────────────────────────────── */
function NewsModal({ article, onClose }) {
  const [pos, setPos]   = useState({ x: 80, y: 60 });
  const [size, setSize] = useState({ w: 640, h: 480 });
  const dragging  = useRef(false);
  const resizing  = useRef(false);
  const dragStart = useRef({});
  const resizeStart = useRef({});

  // Drag header to move
  const onHeaderMouseDown = (e) => {
    if (e.target.closest('.news-modal-close')) return;
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    e.preventDefault();
  };

  // Drag corner to resize
  const onResizeMouseDown = (e) => {
    resizing.current = true;
    resizeStart.current = { mx: e.clientX, my: e.clientY, w: size.w, h: size.h };
    e.preventDefault();
    e.stopPropagation();
  };

  useEffect(() => {
    const onMove = (e) => {
      if (dragging.current) {
        setPos({
          x: dragStart.current.px + (e.clientX - dragStart.current.mx),
          y: dragStart.current.py + (e.clientY - dragStart.current.my),
        });
      }
      if (resizing.current) {
        setSize({
          w: Math.max(400, resizeStart.current.w + (e.clientX - resizeStart.current.mx)),
          h: Math.max(280, resizeStart.current.h + (e.clientY - resizeStart.current.my)),
        });
      }
    };
    const onUp = () => { dragging.current = false; resizing.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const hasSummary = article.summary && article.summary !== article.headline;

  return (
    <div
      className="news-modal"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
    >
      {/* Draggable header */}
      <div className="news-modal-header" onMouseDown={onHeaderMouseDown}>
        <div className="news-modal-header-left">
          <span className={`news-modal-ticker${article.ticker === 'CRYPTO' ? ' crypto-badge' : ''}`}>
            [{article.ticker}]
          </span>
          <span className="news-modal-source">{article.source}</span>
          <span className="news-modal-ts">
            {new Date(article.datetime * 1000).toLocaleString()} · {timeAgo(article.datetime)}
          </span>
        </div>
        <button className="chart-close-btn news-modal-close" onClick={onClose}>✕</button>
      </div>

      {/* Scrollable body */}
      <div className="news-modal-body">
        <p className="news-modal-headline">{article.headline}</p>

        {hasSummary && (
          <p className="news-modal-summary">{article.summary}</p>
        )}

        {!hasSummary && (
          <p className="news-modal-summary" style={{ opacity: 0.4, fontStyle: 'italic' }}>
            No extended summary available from this source.
          </p>
        )}

        <a
          className="news-modal-link"
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          READ FULL ARTICLE ↗
        </a>
      </div>

      {/* Resize handle */}
      <div className="news-modal-resize" onMouseDown={onResizeMouseDown} />
    </div>
  );
}

/* ─── Inline accordion row ────────────────────────────────────────────── */
function NewsItem({ article, onOpenModal }) {
  const [expanded, setExpanded] = useState(false);
  const hasSummary = article.summary && article.summary !== article.headline;

  return (
    <div className={`news-item${expanded ? ' news-item-expanded' : ''}`}>
      <button className="news-item-header" onClick={() => setExpanded((v) => !v)}>
        <div className="news-item-top">
          <span className={`news-ticker-badge${article.ticker === 'CRYPTO' ? ' crypto-badge' : ''}`}>
            {article.ticker}
          </span>
          <div className="news-item-meta">
            <span className="news-source">{article.source}</span>
            <span className="news-time">{timeAgo(article.datetime)}</span>
          </div>
        </div>
        <p className="news-headline">{article.headline}</p>
        <span className="news-expand-icon">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="news-item-body">
          <p className="news-item-timestamp">
            {new Date(article.datetime * 1000).toLocaleString()}
          </p>
          {hasSummary ? (
            <p className="news-item-summary">{article.summary}</p>
          ) : (
            <p className="news-item-summary news-item-summary-empty">
              No summary available.
            </p>
          )}
          <div className="news-item-actions">
            <button
              className="news-popup-btn"
              onClick={(e) => { e.stopPropagation(); onOpenModal(article); }}
            >
              ⤢ EXPAND
            </button>
            <a
              className="news-modal-link"
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              READ FULL ARTICLE ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── NewsFeed container ──────────────────────────────────────────────── */
export default function NewsFeed() {
  const [articles, setArticles]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [modalArticle, setModalArticle] = useState(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const data = await fetchNews();
      if (mountedRef.current) { setArticles(data); setLastUpdated(new Date()); }
    } catch { /* keep stale */ } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    const interval = setInterval(load, NEWS_REFRESH_INTERVAL);
    return () => { mountedRef.current = false; clearInterval(interval); };
  }, [load]);

  return (
    <>
      <div className="news-feed-wrapper">
        {loading && articles.length === 0 && (
          <div className="news-loading">FETCHING NEWS…</div>
        )}
        {!loading && articles.length === 0 && (
          <div className="news-loading">NO ARTICLES FOUND</div>
        )}
        {articles.map((article) => (
          <NewsItem
            key={`${article.id}-${article.ticker}`}
            article={article}
            onOpenModal={setModalArticle}
          />
        ))}
        {lastUpdated && articles.length > 0 && (
          <div className="news-footer">
            {articles.length} ARTICLES · UPDATED {lastUpdated.toLocaleTimeString()}
          </div>
        )}
      </div>

      {modalArticle && (
        <NewsModal article={modalArticle} onClose={() => setModalArticle(null)} />
      )}
    </>
  );
}
