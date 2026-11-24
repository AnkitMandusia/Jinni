import React, { useEffect, useRef, useState } from 'react';
import { J, inr } from '../theme/jinni';

/** Number that eases up to its value (cheap "alive" feel without a chart library). */
export const CountUp: React.FC<{ value: number; money?: boolean; ms?: number }> = ({ value, money, ms = 700 }) => {
  const [v, setV] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const t0 = performance.now(); const from = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms); const e = 1 - Math.pow(1 - k, 3);
      setV(from + (value - from) * e);
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, ms]);
  return <>{money ? inr(Math.round(v)) : Math.round(v).toLocaleString('en-IN')}</>;
};

export interface BarSeries { key: string; label: string; color: string }
/** Stacked daily bars with hover tooltip. Pure SVG. */
export const StackedBars: React.FC<{ data: Record<string, any>[]; series: BarSeries[]; xKey: string; height?: number; money?: boolean }> = ({ data, series, xKey, height = 220, money = true }) => {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, pad = { l: 44, r: 8, t: 10, b: 26 }, H = height;
  const totals = data.map(d => series.reduce((s, x) => s + (Number(d[x.key]) || 0), 0));
  const max = Math.max(1, ...totals) * 1.12;
  const bw = (W - pad.l - pad.r) / Math.max(1, data.length);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, 0.5, 1].map(f => f * max);
  return <div style={{ position: 'relative' }}>
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Daily sales">
      {ticks.map((t, i) => <g key={i}><line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={J.p100} strokeDasharray="3 4" />
        <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill={J.mute}>{t >= 1000 ? `${Math.round(t / 1000)}k` : Math.round(t)}</text></g>)}
      {data.map((d, i) => {
        let acc = 0; const x = pad.l + i * bw + bw * 0.2; const w = bw * 0.6;
        return <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: 'default' }}>
          <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
          {series.map((s, si) => { const v = Number(d[s.key]) || 0; const y0 = y(acc), y1 = y(acc + v); acc += v;
            return v > 0 ? <rect key={s.key} x={x} y={y1} width={w} height={Math.max(0, y0 - y1)} rx={si === series.length - 1 ? 5 : 0} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.45}>
              <animate attributeName="height" from="0" to={Math.max(0, y0 - y1)} dur="0.6s" fill="freeze" /><animate attributeName="y" from={y0} to={y1} dur="0.6s" fill="freeze" /></rect> : null; })}
          {(i % Math.ceil(data.length / 8) === 0 || hover === i) && <text x={x + w / 2} y={H - 8} textAnchor="middle" fontSize="10" fill={hover === i ? J.p600 : J.mute} fontWeight={hover === i ? 700 : 400}>{String(d[xKey]).slice(5).replace('-', '/')}</text>}
        </g>;
      })}
    </svg>
    {hover !== null && <div style={{ position: 'absolute', top: 0, left: `${((hover + 0.5) / data.length) * 100}%`, transform: 'translateX(-50%)', background: J.p900, color: '#fff', padding: '8px 11px', borderRadius: 10, fontSize: 12, pointerEvents: 'none', boxShadow: '0 8px 24px rgba(26,12,53,.35)', whiteSpace: 'nowrap', zIndex: 2 }}>
      <b style={{ color: J.g300 }}>{String(data[hover][xKey])}</b>
      {series.map(s => <div key={s.key}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: s.color, marginRight: 6 }} />{s.label}: {money ? inr(data[hover][s.key]) : data[hover][s.key]}</div>)}
    </div>}
    <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 4, flexWrap: 'wrap' }}>
      {series.map(s => <span key={s.key} style={{ fontSize: 12, color: J.mute }}><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 3, background: s.color, marginRight: 6 }} />{s.label}</span>)}
    </div>
  </div>;
};

/** Donut with centre label. */
export const Donut: React.FC<{ parts: { label: string; value: number; color: string }[]; centre?: string }> = ({ parts, centre }) => {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1; const R = 52, C = 2 * Math.PI * R; let off = 0;
  return <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
    <svg viewBox="0 0 140 140" width="132" height="132" style={{ flexShrink: 0 }}>
      <circle cx="70" cy="70" r={R} fill="none" stroke={J.p50} strokeWidth="18" />
      {parts.map(p => { const len = (p.value / total) * C; const el = <circle key={p.label} cx="70" cy="70" r={R} fill="none" stroke={p.color} strokeWidth="18" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform="rotate(-90 70 70)" style={{ transition: 'stroke-dasharray .6s' }} />; off += len; return el; })}
      {centre && <text x="70" y="75" textAnchor="middle" fontSize="15" fontWeight="700" fill={J.p700}>{centre}</text>}
    </svg>
    <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
      {parts.map(p => <div key={p.label}><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: p.color, marginRight: 8 }} /><span style={{ color: J.ink }}>{p.label}</span> <b style={{ color: J.p600 }}>{inr(p.value)}</b> <span style={{ color: J.mute }}>· {Math.round((p.value / total) * 100)}%</span></div>)}
    </div>
  </div>;
};
