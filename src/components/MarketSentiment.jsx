import { useState, useEffect, useRef } from 'react';

// ─── Segment definitions ──────────────────────────────────────────────────────
// Each zone: score range, dim color (inactive), bright color (active)
const SEGMENTS = [
  {
    id: 'extreme_fear',
    label: 'EXTREME FEAR',
    short: 'EXT FEAR',
    min: 0,
    max: 25,
    dim: '#4a0a2e',
    bright: '#ff00aa',
  },
  {
    id: 'fear',
    label: 'FEAR',
    short: 'FEAR',
    min: 25,
    max: 45,
    dim: '#2a0a1e',
    bright: '#cc3377',
  },
  {
    id: 'neutral',
    label: 'NEUTRAL',
    short: 'NEUTRAL',
    min: 45,
    max: 55,
    dim: '#081a14',
    bright: '#1a6650',
  },
  {
    id: 'greed',
    label: 'GREED',
    short: 'GREED',
    min: 55,
    max: 75,
    dim: '#041a20',
    bright: '#009977',
  },
  {
    id: 'extreme_greed',
    label: 'EXTREME GREED',
    short: 'EXT GREED',
    min: 75,
    max: 100,
    dim: '#002a30',
    bright: '#00ffcc',
  },
];

function getSegment(score) {
  return SEGMENTS.find((s) => score >= s.min && score <= s.max) ?? SEGMENTS[2];
}

// ─── SVG geometry helpers ─────────────────────────────────────────────────────
// Convention: 180° = leftmost (score 0), 0° = rightmost (score 100)
// Standard math coords: angle measured CCW from positive-x axis
function scoreToDeg(score) {
  return 180 - (score / 100) * 180;
}

function polarXY(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

// SVG arc path between two angles (always clockwise on screen = CCW in math)
function arcSegPath(cx, cy, rOuter, rInner, startDeg, endDeg) {
  const o1 = polarXY(cx, cy, rOuter, startDeg);
  const o2 = polarXY(cx, cy, rOuter, endDeg);
  const i1 = polarXY(cx, cy, rInner, endDeg);
  const i2 = polarXY(cx, cy, rInner, startDeg);
  const large = Math.abs(startDeg - endDeg) > 180 ? 1 : 0;
  // Outer arc: startDeg → endDeg (decreasing angle = CW on screen)
  // sweep-flag 0 = CCW in SVG coords = rightward on screen for descending angles
  return [
    `M ${o1.x.toFixed(2)} ${o1.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${large} 0 ${o2.x.toFixed(2)} ${o2.y.toFixed(2)}`,
    `L ${i1.x.toFixed(2)} ${i1.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${large} 1 ${i2.x.toFixed(2)} ${i2.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CX = 130, CY = 112;
const R_OUTER = 100;
const R_INNER = 72;
const R_MID   = (R_OUTER + R_INNER) / 2; // label placement radius
const GAP_DEG = 1.5; // gap between segments in degrees

// ─── Gauge SVG ────────────────────────────────────────────────────────────────
function GaugeSVG({ score }) {
  const activeSeg = getSegment(score);
  const needleDeg = scoreToDeg(score);
  const needleTip = polarXY(CX, CY, R_OUTER - 4, needleDeg);
  const needleB1  = polarXY(CX, CY, 10, needleDeg + 90);
  const needleB2  = polarXY(CX, CY, 10, needleDeg - 90);

  return (
    <svg viewBox="0 0 260 120" className="fg-svg" style={{ overflow: 'visible' }}>
      <defs>
        {/* Glow filter for active segment */}
        <filter id="segGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Tighter glow for needle */}
        <filter id="needleGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Radial ambient behind gauge */}
        <radialGradient id="ambientGrad" cx="50%" cy="100%" r="60%">
          <stop offset="0%"   stopColor={activeSeg.bright} stopOpacity="0.12" />
          <stop offset="100%" stopColor={activeSeg.bright} stopOpacity="0"    />
        </radialGradient>
      </defs>

      {/* Ambient glow layer */}
      <ellipse cx={CX} cy={CY} rx="115" ry="70" fill="url(#ambientGrad)" />

      {/* ── Segments ── */}
      {SEGMENTS.map((seg) => {
        const isActive = seg.id === activeSeg.id;
        // Convert score boundaries to degrees, apply inner gap
        const startDeg = scoreToDeg(seg.min) - GAP_DEG / 2;
        const endDeg   = scoreToDeg(seg.max) + GAP_DEG / 2;
        const path = arcSegPath(CX, CY, R_OUTER, R_INNER, startDeg, endDeg);

        return (
          <path
            key={seg.id}
            d={path}
            fill={isActive ? seg.bright : seg.dim}
            opacity={isActive ? 1 : 0.85}
            filter={isActive ? 'url(#segGlow)' : undefined}
          />
        );
      })}

      {/* ── Segment boundary tick marks ── */}
      {[0, 25, 45, 55, 75, 100].map((s) => {
        const deg   = scoreToDeg(s);
        const inner = polarXY(CX, CY, R_INNER - 2, deg);
        const outer = polarXY(CX, CY, R_OUTER + 2, deg);
        return (
          <line
            key={s}
            x1={inner.x.toFixed(2)} y1={inner.y.toFixed(2)}
            x2={outer.x.toFixed(2)} y2={outer.y.toFixed(2)}
            stroke="rgba(0,0,0,0.7)"
            strokeWidth="1.5"
          />
        );
      })}

      {/* ── Numeric tick labels at 0, 25, 50, 75, 100 ── */}
      {[0, 25, 50, 75, 100].map((s) => {
        const deg = scoreToDeg(s);
        const lp  = polarXY(CX, CY, R_OUTER + 12, deg);
        const anchor = s === 0 ? 'end' : s === 100 ? 'start' : 'middle';
        return (
          <text
            key={`tick-${s}`}
            x={lp.x.toFixed(2)}
            y={lp.y.toFixed(2)}
            textAnchor={anchor}
            dominantBaseline="middle"
            fontSize="8"
            fontFamily="'Courier New', monospace"
            fontWeight="bold"
            fill="rgba(0,255,204,0.6)"
          >
            {s}
          </text>
        );
      })}

      {/* ── Label inside active segment ── */}
      {(() => {
        const midScore = (activeSeg.min + activeSeg.max) / 2;
        const midDeg   = scoreToDeg(midScore);
        const lp       = polarXY(CX, CY, R_MID, midDeg);
        // Short label that fits inside narrow segments
        const text = activeSeg.min >= 45 && activeSeg.max <= 55
          ? 'NEU'
          : activeSeg.short;
        return (
          <text
            x={lp.x.toFixed(2)}
            y={lp.y.toFixed(2)}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={activeSeg.id === 'neutral' ? '6' : '5.5'}
            fontFamily="'Courier New', monospace"
            fontWeight="bold"
            fill="#000000"
            opacity="0.85"
            letterSpacing="0.3"
          >
            {text}
          </text>
        );
      })()}

      {/* ── Needle ── */}
      <polygon
        points={[needleTip, needleB1, needleB2]
          .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}
        fill="#ffffff"
        opacity="0.95"
        filter="url(#needleGlow)"
      />

      {/* Hub rings */}
      <circle cx={CX} cy={CY} r="9"   fill="#0a1520" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      <circle cx={CX} cy={CY} r="4.5" fill={activeSeg.bright} filter="url(#needleGlow)" />
    </svg>
  );
}

// ─── Stat rows ────────────────────────────────────────────────────────────────
function StatRow({ label, score, rating }) {
  if (score == null) return null;
  const seg   = getSegment(score);
  const color = seg.bright;
  return (
    <div className="fg-stat-row">
      <span className="fg-stat-label">{label}</span>
      <span className="fg-stat-score" style={{ color }}>{Math.round(score)}</span>
      <span className="fg-stat-rating" style={{ color }}>{seg.short}</span>
    </div>
  );
}

// ─── sessionStorage cache ─────────────────────────────────────────────────────
const SS_KEY = 'fg-cache';

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function readCache() {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return null;
    const { date, payload } = JSON.parse(raw);
    return date === getTodayKey() ? payload : null;
  } catch {
    return null;
  }
}

function writeCache(payload) {
  try {
    sessionStorage.setItem(SS_KEY, JSON.stringify({ date: getTodayKey(), payload }));
  } catch { /* ignore */ }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function MarketSentiment() {
  const [data,    setData]    = useState(() => readCache());
  const [loading, setLoading] = useState(!readCache());
  const [error,   setError]   = useState(null);
  const hasCacheRef = useRef(!!readCache());

  useEffect(() => {
    async function load() {
      const cached = readCache();
      if (cached) {
        setData(cached);
        setLoading(false);
        hasCacheRef.current = true;
        return;
      }
      try {
        const res = await fetch('/api/sentiment');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        writeCache(json);
        setData(json);
        hasCacheRef.current = true;
      } catch (err) {
        if (!hasCacheRef.current) setError('Fear & Greed data unavailable');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
    const iv = setInterval(load, 24 * 60 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  if (loading) return <div className="fg-state">LOADING SENTIMENT…</div>;
  if (error)   return <div className="fg-state fg-state-error">{error}</div>;

  const fg    = data?.fear_and_greed ?? {};
  const score = fg.score ?? 50;
  const seg   = getSegment(score);

  const hist      = data?.fear_and_greed_historical ?? {};
  const prevClose = fg.previous_close ?? hist.previous_close ?? null;
  const weekAgo   = fg['1_week_ago']  ?? hist['1_week_ago']  ?? null;
  const monthAgo  = fg['1_month_ago'] ?? hist['1_month_ago'] ?? null;

  return (
    <div className="fg-panel">
      {/* Ambient background glow */}
      <div
        className="fg-ambient"
        style={{ background: `radial-gradient(ellipse at 50% 70%, ${seg.bright}18 0%, transparent 65%)` }}
      />

      {/* Gauge */}
      <div className="fg-gauge-wrap">
        <GaugeSVG score={score} />
      </div>

      {/* Score + label below gauge */}
      <div className="fg-readout">
        <span className="fg-big-score" style={{ color: seg.bright, textShadow: `0 0 20px ${seg.bright}` }}>
          {Math.round(score)}
        </span>
        <span className="fg-big-label" style={{ color: seg.bright }}>
          {seg.label}
        </span>
      </div>

      {/* Historical stat rows */}
      <div className="fg-stats">
        <StatRow label="PREV CLOSE" score={prevClose} />
        <StatRow label="1 WEEK AGO" score={weekAgo}   />
        <StatRow label="1 MONTH AGO" score={monthAgo}  />
      </div>
    </div>
  );
}
