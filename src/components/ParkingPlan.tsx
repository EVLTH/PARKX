// Plan technique SVG paramétrique de la maquette (unités : cm).
import React, { useEffect, useRef, useState } from 'react';
import type { Geometry, PlaceGeo } from '../lib/geometry';
import { pcbLabel } from '../lib/utils';
import { Icon } from './Icons';
import { BRAND, LED } from '../styles/brand';

const NAVY = BRAND.navy;
const BLUE = BRAND.blue;
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString('fr-FR');

export interface PlanOptions {
  dims: boolean;
  pcbs: boolean;
  margins: boolean;
  numbers: boolean;
  marks: boolean;
}
export const DEFAULT_OPTIONS: PlanOptions = { dims: true, pcbs: true, margins: true, numbers: true, marks: true };

const PAD = { l: 16, t: 16, r: 14, b: 16 };

function Dim({ x1, y1, x2, y2, label, side = 1, color = '#334155', fs = 1.6 }: { x1: number; y1: number; x2: number; y2: number; label: string; side?: 1 | -1; color?: string; fs?: number }) {
  const hor = Math.abs(y2 - y1) < 1e-6;
  const t = 0.9;
  const len = hor ? Math.abs(x2 - x1) : Math.abs(y2 - y1);
  if (len < 0.3) return null;
  return (
    <g className="dim" stroke={color} strokeWidth={0.12} fill={color}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      {hor ? (
        <>
          <line x1={x1} y1={y1 - t} x2={x1} y2={y1 + t} />
          <line x1={x2} y1={y2 - t} x2={x2} y2={y2 + t} />
          <line x1={x1 - 0.5} y1={y1 + 0.5} x2={x1 + 0.5} y2={y1 - 0.5} strokeWidth={0.22} />
          <line x1={x2 - 0.5} y1={y2 + 0.5} x2={x2 + 0.5} y2={y2 - 0.5} strokeWidth={0.22} />
          <text x={(x1 + x2) / 2} y={y1 - 0.55 * side + (side > 0 ? 0 : fs)} fontSize={fs} textAnchor="middle" stroke="none" className="dim-txt">{label}</text>
        </>
      ) : (
        <>
          <line x1={x1 - t} y1={y1} x2={x1 + t} y2={y1} />
          <line x1={x2 - t} y1={y2} x2={x2 + t} y2={y2} />
          <line x1={x1 - 0.5} y1={y1 + 0.5} x2={x1 + 0.5} y2={y1 - 0.5} strokeWidth={0.22} />
          <line x1={x2 - 0.5} y1={y2 + 0.5} x2={x2 + 0.5} y2={y2 - 0.5} strokeWidth={0.22} />
          <text x={x1 - 0.6 * side} y={(y1 + y2) / 2} fontSize={fs} textAnchor="middle" stroke="none" className="dim-txt" transform={`rotate(-90 ${x1 - 0.6 * side} ${(y1 + y2) / 2})`}>
            {label}
          </text>
        </>
      )}
    </g>
  );
}

function Wheelchair({ cx, cy, s }: { cx: number; cy: number; s: number }) {
  // pictogramme simplifié (unités arbitraires 0..10)
  return (
    <g transform={`translate(${cx - 5 * s} ${cy - 5 * s}) scale(${s})`} fill="none" stroke={BLUE} strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="4.4" cy="1.2" r="1.05" fill={BLUE} stroke="none" />
      <path d="M4.2 3v3.4h3.3l1.4 2.8M4.2 4.8h2.6" />
      <path d="M3 5.2a2.9 2.9 0 1 0 4.1 3.4" />
    </g>
  );
}

export function ParkingPlan({
  geo,
  options = DEFAULT_OPTIONS,
  selected,
  onSelect,
  placeLayer,
  children,
  viewBox,
  svgRef,
  highlightPcb,
  className = '',
}: {
  geo: Geometry;
  options?: PlanOptions;
  selected?: number | null;
  onSelect?: (n: number) => void;
  placeLayer?: (p: PlaceGeo) => React.ReactNode;
  children?: React.ReactNode;
  viewBox?: string;
  svgRef?: React.Ref<SVGSVGElement>;
  highlightPcb?: number | null;
  className?: string;
}) {
  const { cfg, ix, iy, innerW, innerH } = geo;
  const W = cfg.plateW,
    H = cfg.plateH;
  const pad = options.dims ? PAD : { l: 3, t: 3, r: 3, b: 3 };
  const vb = viewBox || `${-pad.l} ${-pad.t} ${W + pad.l + pad.r} ${H + pad.t + pad.b}`;
  const top = geo.places.filter((p) => p.row === 'top');
  const bottom = geo.places.filter((p) => p.row === 'bottom');
  const valid = geo.errors.length === 0;
  const fs = Math.max(1.6, Math.min(2.5, W / 52));

  return (
    <svg ref={svgRef} className={'plan-svg ' + className} viewBox={vb} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Plan de la maquette vue de dessus" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="hatch" width="1.4" height="1.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="1.4" stroke="#94A3B8" strokeWidth="0.25" />
        </pattern>
        <pattern id="hatchPmr" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="1.6" stroke={BLUE} strokeOpacity=".35" strokeWidth="0.35" />
        </pattern>
        <pattern id="dots" width="2" height="2" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.13" fill="#94A3B8" />
        </pattern>
        <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="0.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Plaque + bordures */}
      <rect x={0} y={0} width={W} height={H} fill="#E6EBF1" stroke={NAVY} strokeWidth={0.35} />
      <rect x={0} y={0} width={W} height={H} fill="url(#hatch)" />
      {innerW > 0 && innerH > 0 && <rect x={ix} y={iy} width={innerW} height={innerH} fill="#FFFFFF" stroke={NAVY} strokeWidth={0.2} />}
      {options.margins && innerW > 0 && innerH > 0 && <rect x={ix} y={iy} width={innerW} height={innerH} fill="url(#dots)" />}

      {/* Repères tous les 10 cm */}
      {options.marks && (
        <g stroke={NAVY} strokeWidth={0.12}>
          {Array.from({ length: Math.floor(W / 10) + 1 }, (_, i) => (
            <g key={'mx' + i}>
              <line x1={i * 10} y1={0} x2={i * 10} y2={i % 5 === 0 ? 1.6 : 0.9} />
              <line x1={i * 10} y1={H} x2={i * 10} y2={H - (i % 5 === 0 ? 1.6 : 0.9)} />
            </g>
          ))}
          {Array.from({ length: Math.floor(H / 10) + 1 }, (_, i) => (
            <g key={'my' + i}>
              <line x1={0} y1={i * 10} x2={i % 5 === 0 ? 1.6 : 0.9} y2={i * 10} />
              <line x1={W} y1={i * 10} x2={W - (i % 5 === 0 ? 1.6 : 0.9)} y2={i * 10} />
            </g>
          ))}
        </g>
      )}

      {valid && (
        <>
          {/* Allée centrale */}
          <rect x={ix} y={geo.aisleY} width={innerW} height={cfg.aisle} fill="#EDF2F7" />
          <line x1={ix + 2} x2={ix + innerW - 2} y1={geo.aisleMid} y2={geo.aisleMid} stroke="#94A3B8" strokeWidth={0.25} strokeDasharray="2.2 1.6" />
          <text x={ix + innerW / 2} y={geo.aisleMid + (geo.cfg.aisle > 6 ? -1.4 : 0.5)} fontSize={fs * 0.95} textAnchor="middle" fill="#64748B" letterSpacing="0.4">ALLÉE CENTRALE</text>
          {cfg.aisle > 6 && (
            <g fill="#94A3B8">
              {[0.2, 0.5, 0.8].map((k) => {
                const x = ix + innerW * k;
                return <path key={k} d={`M${x + 1.6} ${geo.aisleMid + 2.2} h-3 l0 -0.7 l-1.3 1.2 l1.3 1.2 l0 -0.7 h3z`} />;
              })}
            </g>
          )}

          {/* Places */}
          {[...top, ...bottom].map((p) => {
            const sel = selected === p.number;
            const openTop = p.row === 'bottom'; // la rangée inférieure s'ouvre vers le haut (allée)
            const lines = openTop ? `M${p.x} ${p.y} V${p.y + p.h} H${p.x + p.w} V${p.y}` : `M${p.x} ${p.y + p.h} V${p.y} H${p.x + p.w} V${p.y + p.h}`;
            const numY = p.numY;
            return (
              <g key={p.number} className={'place ' + (sel ? 'sel ' : '') + (onSelect ? 'clickable' : '')} onClick={() => onSelect?.(p.number)} data-place={p.number}>
                <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={p.pmr ? '#E6F1FA' : '#FFFFFF'} className="place-bg" />
                {p.pmr && <rect x={p.x} y={p.y} width={p.w} height={p.h} fill="url(#hatchPmr)" />}
                <path d={lines} fill="none" stroke={NAVY} strokeWidth={0.32} />
                {p.pmr && <Wheelchair cx={p.cx} cy={p.iconY} s={Math.min(p.w, p.h) * 0.034} />}
                {options.numbers && (
                  <g>
                    <circle cx={p.cx} cy={numY} r={Math.min(2.2, p.w * 0.31)} fill={sel ? BLUE : p.pmr ? BLUE : NAVY} />
                    <text x={p.cx} y={numY + 0.6} fontSize={Math.min(1.75, p.w * 0.25)} textAnchor="middle" fill="#fff" fontWeight={700}>{p.number}</text>
                  </g>
                )}
                {placeLayer?.(p)}
                {sel && <rect x={p.x + 0.2} y={p.y + 0.2} width={p.w - 0.4} height={p.h - 0.4} fill="none" stroke={BLUE} strokeWidth={0.45} />}
              </g>
            );
          })}

          {/* PCB, liaisons et LED (une LED par place, à l'entrée de la place) */}
          {options.pcbs &&
            geo.pcbs.map((b) => {
              const hl = highlightPcb === b.number;
              const [pa, pb] = b.places.map((n) => geo.places.find((p) => p.number === n)!);
              const yb = b.row === 'top' ? b.y + b.h : b.y;
              return (
                <g key={'pcb' + b.number} className={'pcb ' + (hl ? 'hl' : '')}>
                  {[pa, pb].map((p) => (
                    <g key={p.number}>
                      <path d={`M${p.x + 0.7} ${yb} V${p.ledY} H${p.cx - 0.62}`} stroke={hl ? BLUE : '#64748B'} strokeWidth={0.16} strokeDasharray="0.6 0.5" fill="none" />
                      <circle cx={p.cx} cy={p.ledY} r={0.62} fill="#FFFFFF" stroke={hl ? BLUE : NAVY} strokeWidth={0.2} />
                      <circle cx={p.cx} cy={p.ledY} r={0.26} fill={hl ? BLUE : NAVY} />
                    </g>
                  ))}
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={0.35} fill={hl ? BLUE : NAVY} />
                  <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 0.45} fontSize={Math.min(1.25, b.h * 0.75)} textAnchor="middle" fill="#fff" fontWeight={700}>
                    {pcbLabel(b.number)}
                  </text>
                </g>
              );
            })}

          {/* Marges */}
          {options.margins && (
            <g>
              <Dim x1={ix + 1.6} y1={iy} x2={ix + 1.6} y2={geo.topRowY} label={fmt(geo.marginT)} color={BLUE} fs={fs * 0.8} side={-1} />
              <Dim x1={ix + 1.6} y1={geo.bottomRowY + cfg.placeDepth} x2={ix + 1.6} y2={iy + innerH} label={fmt(geo.marginT)} color={BLUE} fs={fs * 0.8} side={-1} />
              <Dim x1={ix + 1.6} y1={geo.aisleY} x2={ix + 1.6} y2={geo.aisleY + cfg.aisle} label={fmt(cfg.aisle)} color={BLUE} fs={fs * 0.8} side={-1} />
            </g>
          )}
        </>
      )}

      {/* Cotations extérieures */}
      {options.dims && (
        <g>
          <Dim x1={0} y1={-11} x2={W} y2={-11} label={`${fmt(W)} cm`} fs={fs} />
          <Dim x1={-11} y1={0} x2={-11} y2={H} label={`${fmt(H)} cm`} fs={fs} />
          <Dim x1={ix} y1={H + 11} x2={ix + innerW} y2={H + 11} label={`Intérieur ${fmt(innerW)} cm`} fs={fs} side={-1} />
          <Dim x1={-5} y1={iy} x2={-5} y2={iy + innerH} label={`${fmt(innerH)} cm`} fs={fs} />
          <Dim x1={0} y1={-5} x2={ix} y2={-5} label={fmt(cfg.border)} fs={fs * 0.8} color={'#64748B'} />
          {valid && (
            <>
              <Dim x1={ix} y1={-5} x2={ix + geo.marginTopRowL} y2={-5} label={fmt(geo.marginTopRowL)} fs={fs * 0.8} color={BLUE} />
              <Dim x1={ix + geo.marginTopRowL} y1={-5} x2={ix + geo.marginTopRowL + geo.topLen} y2={-5} label={`12 × ${fmt(cfg.placeWidth)} = ${fmt(geo.topLen)}`} fs={fs * 0.85} />
              <Dim x1={ix + geo.marginTopRowL + geo.topLen} y1={-5} x2={ix + innerW} y2={-5} label={fmt(geo.marginTopRowL)} fs={fs * 0.8} color={BLUE} />
              <Dim x1={ix} y1={H + 5} x2={ix + geo.marginBottomRowL} y2={H + 5} label={fmt(geo.marginBottomRowL)} fs={fs * 0.8} color={BLUE} side={-1} />
              <Dim x1={ix + geo.marginBottomRowL} y1={H + 5} x2={ix + geo.marginBottomRowL + cfg.pmrWidth} y2={H + 5} label={`PMR ${fmt(cfg.pmrWidth)}`} fs={fs * 0.8} side={-1} />
              <Dim x1={ix + geo.marginBottomRowL + cfg.pmrWidth} y1={H + 5} x2={ix + geo.marginBottomRowL + geo.bottomLen} y2={H + 5} label={`11 × ${fmt(cfg.placeWidth)} = ${fmt(11 * cfg.placeWidth)}`} fs={fs * 0.85} side={-1} />
              <Dim x1={ix + geo.marginBottomRowL + geo.bottomLen} y1={H + 5} x2={ix + innerW} y2={H + 5} label={fmt(geo.marginBottomRowL)} fs={fs * 0.8} color={BLUE} side={-1} />
              {/* chaîne transversale à droite */}
              {[
                [iy, geo.topRowY, fmt(geo.marginT), BLUE],
                [geo.topRowY, geo.aisleY, fmt(cfg.placeDepth), '#334155'],
                [geo.aisleY, geo.bottomRowY, fmt(cfg.aisle), '#334155'],
                [geo.bottomRowY, geo.bottomRowY + cfg.placeDepth, fmt(cfg.placeDepth), '#334155'],
                [geo.bottomRowY + cfg.placeDepth, iy + innerH, fmt(geo.marginT), BLUE],
              ].map(([a, b, l, c], i) => (
                <Dim key={i} x1={W + 5} y1={a as number} x2={W + 5} y2={b as number} label={l as string} fs={fs * 0.8} color={c as string} side={-1} />
              ))}
            </>
          )}
        </g>
      )}
      {children}
    </svg>
  );
}

/** Conteneur avec zoom et déplacement. */
export function PlanViewer({ geo, children, height = 520, toolbarExtra }: { geo: Geometry; children: (viewBox: string) => React.ReactNode; height?: number | string; toolbarExtra?: React.ReactNode }) {
  const W = geo.cfg.plateW + PAD.l + PAD.r;
  const H = geo.cfg.plateH + PAD.t + PAD.b;
  const [z, setZ] = useState(1);
  const [c, setC] = useState({ x: -PAD.l + W / 2, y: -PAD.t + H / 2 });
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setZ(1);
    setC({ x: -PAD.l + W / 2, y: -PAD.t + H / 2 });
  }, [W, H]);
  const vw = W / z,
    vh = H / z;
  const vb = `${c.x - vw / 2} ${c.y - vh / 2} ${vw} ${vh}`;
  const zoom = (f: number) => setZ((v) => Math.max(1, Math.min(6, v * f)));
  return (
    <div className="plan-viewer">
      <div className="pv-tools no-print">
        <button onClick={() => zoom(1.35)} title="Zoom avant"><Icon name="zoomIn" size={15} /></button>
        <button onClick={() => zoom(1 / 1.35)} title="Zoom arrière"><Icon name="zoomOut" size={15} /></button>
        <button onClick={() => { setZ(1); setC({ x: -PAD.l + W / 2, y: -PAD.t + H / 2 }); }} title="Vue d'ensemble"><Icon name="fit" size={15} /></button>
        <span>{Math.round(z * 100)} %</span>
        {toolbarExtra}
      </div>
      <div
        ref={box}
        className={'pv-canvas ' + (z > 1 ? 'grab' : '')}
        style={{ height }}
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
        }}
        onPointerDown={(e) => {
          if (z <= 1) return;
          drag.current = { x: e.clientX, y: e.clientY, cx: c.x, cy: c.y };
        }}
        onPointerMove={(e) => {
          if (!drag.current || !box.current) return;
          const r = box.current.getBoundingClientRect();
          const k = Math.max(vw / r.width, vh / r.height);
          setC({ x: drag.current.cx - (e.clientX - drag.current.x) * k, y: drag.current.cy - (e.clientY - drag.current.y) * k });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => (drag.current = null)}
      >
        {children(vb)}
      </div>
    </div>
  );
}

export function PlanLegend({ dynamic = false }: { dynamic?: boolean }) {
  return (
    <div className="plan-legend">
      <span><i className="lg-pmr" /> Place PMR (n°1)</span>
      <span><i className="lg-pcb" /> PCB (1 pour 2 places)</span>
      {!dynamic && <span><i className="lg-led" /> LED (entrée de place)</span>}
    </div>
  );
}
