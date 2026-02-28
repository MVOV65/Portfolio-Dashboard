import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { fetchCandles } from '../services/finnhub';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="tooltip-date">{label}</p>
      <p className="tooltip-close">
        CLOSE: <span>${Number(payload[0].value).toFixed(2)}</span>
      </p>
    </div>
  );
};

export default function StockChart({ symbol, label, onClose }) {
  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [pos, setPos] = useState({ x: 120, y: 80 });
  const [size, setSize] = useState({ w: 620, h: 380 });
  const dragging = useRef(false);
  const resizing = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const resizeStart = useRef({ mx: 0, my: 0, w: 0, h: 0 });
  const panelRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCandles(symbol)
      .then((data) => { if (!cancelled) { setCandles(data); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError('Failed to load chart data.'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [symbol]);

  const onMouseDownDrag = useCallback((e) => {
    if (e.target.closest('.chart-resize-handle')) return;
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    e.preventDefault();
  }, [pos]);

  const onMouseDownResize = useCallback((e) => {
    resizing.current = true;
    resizeStart.current = { mx: e.clientX, my: e.clientY, w: size.w, h: size.h };
    e.preventDefault();
    e.stopPropagation();
  }, [size]);

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
          w: Math.max(360, resizeStart.current.w + (e.clientX - resizeStart.current.mx)),
          h: Math.max(240, resizeStart.current.h + (e.clientY - resizeStart.current.my)),
        });
      }
    };
    const onUp = () => { dragging.current = false; resizing.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const priceMin = candles.length
    ? Math.min(...candles.map((c) => c.close)) * 0.995
    : 'auto';
  const priceMax = candles.length
    ? Math.max(...candles.map((c) => c.close)) * 1.005
    : 'auto';

  const firstClose = candles[0]?.close;
  const lastClose = candles[candles.length - 1]?.close;
  const isUp = lastClose >= firstClose;
  const lineColor = isUp ? '#00ffcc' : '#ff3366';

  return (
    <div
      ref={panelRef}
      className="chart-popup"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
    >
      <div className="chart-header" onMouseDown={onMouseDownDrag}>
        <span className="chart-title">{label ?? symbol} — 30D PRICE</span>
        <button className="chart-close-btn" onClick={onClose}>✕</button>
      </div>

      <div className="chart-body">
        {loading && <p className="chart-status">LOADING…</p>}
        {error && <p className="chart-status error">{error}</p>}
        {!loading && !error && candles.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={candles} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,255,204,0.07)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#4a6272', fontSize: 10, fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={{ stroke: 'rgba(0,255,204,0.12)' }}
                interval={Math.floor(candles.length / 5)}
              />
              <YAxis
                domain={[priceMin, priceMax]}
                tick={{ fill: '#4a6272', fontSize: 10, fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                width={58}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(0,255,204,0.2)', strokeWidth: 1 }} />
              <Line
                type="monotone"
                dataKey="close"
                stroke={lineColor}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: lineColor, stroke: '#080c12', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
        {!loading && !error && candles.length === 0 && (
          <p className="chart-status">NO DATA AVAILABLE</p>
        )}
      </div>

      <div className="chart-resize-handle" onMouseDown={onMouseDownResize} />
    </div>
  );
}
