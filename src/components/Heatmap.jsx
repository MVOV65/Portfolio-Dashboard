// Heatmap — fills the panel 100%, tiles scale with the panel via CSS grid.
// Color: cyan (#00ffcc) for positive, magenta (#ff00aa) for negative.
// Intensity scales with magnitude; flat tiles are near-black.

const CLAMP = 5; // % at which color fully saturates

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function dpToColor(dp) {
  if (dp == null) return 'rgba(255,255,255,0.04)';
  const t = Math.min(Math.abs(dp) / CLAMP, 1);

  if (dp > 0) {
    // near-black → dark muted teal: rgb(8,28,24) → rgb(14,52,44)
    const r = lerp(8,  14, t);
    const g = lerp(22, 52, t);
    const b = lerp(20, 44, t);
    return `rgb(${r},${g},${b})`;
  } else if (dp < 0) {
    // near-black → dark muted magenta: rgb(28,8,20) → rgb(52,14,36)
    const r = lerp(24, 52, t);
    const g = lerp(8,  14, t);
    const b = lerp(18, 36, t);
    return `rgb(${r},${g},${b})`;
  }

  return 'rgba(255,255,255,0.03)';
}

// Bigger movers → larger tiles via CSS grid span.
// Returns 1, 2, or 3 columns wide depending on magnitude.
function colSpan(dp) {
  if (dp == null) return 1;
  const abs = Math.abs(dp);
  if (abs >= 4)   return 3;
  if (abs >= 2)   return 2;
  return 1;
}

// Neon text color — full cyan/magenta but only on text, not background
function neonColor(dp) {
  if (dp == null || Math.abs(dp) < 0.05) return 'var(--text-dim)';
  const t = Math.min(Math.abs(dp) / CLAMP, 1);
  // Even at low magnitude show a hint of color; full neon at saturation
  const alpha = 0.4 + t * 0.6;
  return dp > 0
    ? `rgba(0, 255, 204, ${alpha})`   // cyan
    : `rgba(255, 0, 170, ${alpha})`;  // magenta
}

function borderColor(dp) {
  if (dp == null || Math.abs(dp) < 0.05) return 'rgba(255,255,255,0.06)';
  const t = Math.min(Math.abs(dp) / CLAMP, 1);
  const alpha = 0.08 + t * 0.18;
  return dp > 0
    ? `rgba(0, 255, 204, ${alpha})`
    : `rgba(255, 0, 170, ${alpha})`;
}

const SOL_ORANGE = '#ff9400';

function Tile({ q, onClickTicker }) {
  const dp      = q.dp;
  const hasData = q.c != null;
  const label   = q.label ?? q.symbol;
  const isSol   = q.symbol === 'SOLUSD';
  const sign    = dp != null && dp >= 0 ? '+' : '';
  const pctStr  = hasData && dp != null ? `${sign}${dp.toFixed(2)}%` : '—';
  const span    = hasData ? colSpan(dp) : 1;

  // SOL overrides: orange tinted background + orange border
  const bg     = isSol ? 'rgba(255,148,0,0.08)' : (hasData ? dpToColor(dp) : 'rgba(255,255,255,0.04)');
  const border = isSol ? `1px solid rgba(255,148,0,0.5)` : `1px solid ${hasData ? borderColor(dp) : 'rgba(255,255,255,0.06)'}`;
  const pctCol = isSol ? SOL_ORANGE : (hasData ? neonColor(dp) : 'var(--text-dim)');

  return (
    <div
      className="hm-tile"
      style={{ background: bg, border, gridColumn: `span ${span}` }}
      onClick={() => onClickTicker(q.symbol)}
      title={`${label}  ${pctStr}`}
    >
      <span className="hm-ticker" style={{ color: isSol ? SOL_ORANGE : 'var(--text-dim)' }}>{label}</span>
      <span className="hm-pct"    style={{ color: pctCol }}>{pctStr}</span>
    </div>
  );
}

export default function Heatmap({ quotes, onClickTicker }) {
  if (!quotes || quotes.length === 0) {
    return <div className="hm-empty">NO DATA</div>;
  }

  // Sort biggest movers first so large tiles sit at the top-left
  const sorted = [...quotes].sort((a, b) => {
    const av = a.dp != null ? Math.abs(a.dp) : -1;
    const bv = b.dp != null ? Math.abs(b.dp) : -1;
    return bv - av;
  });

  return (
    <div className="hm-grid">
      {sorted.map((q) => (
        <Tile key={q.symbol} q={q} onClickTicker={onClickTicker} />
      ))}
    </div>
  );
}
