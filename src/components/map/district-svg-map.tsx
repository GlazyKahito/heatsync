'use client';

import { memo, useMemo } from 'react';
import { districtShapes, project, stateBounds, svgPath } from '@/lib/geo';
import { DISTRICTS } from '@/lib/data';
import { LEVEL_HEX, heatHex, type Level } from '@/lib/heat';
import { cn } from '@/lib/utils';

export interface SvgDatum {
  tmax: number;
  level: Level;
}

/**
 * Flat SVG map of the 36 districts, filled on the palette's heat ramp and outlined by warning level. Used as the hero
 * poster before WebGL is ready, as the Lite-mode map, and inside the DSA lab.
 */
export const DistrictSvgMap = memo(function DistrictSvgMap({
  data,
  className,
  selected,
  onSelect,
  highlight,
  showGraph = false,
  graphEdges,
  nodeFill,
  label,
}: {
  data?: SvgDatum[];
  className?: string;
  selected?: number | null;
  onSelect?: (id: number) => void;
  highlight?: Set<number> | null;
  showGraph?: boolean;
  /** optional subset of edges to emphasise, as [a, b] pairs */
  graphEdges?: [number, number][];
  nodeFill?: (id: number) => string | undefined;
  label?: string;
}) {
  const shapes = districtShapes();
  const W = 1000;
  const geom = useMemo(() => {
    const [x0, y0, x1, y1] = stateBounds();
    const pad = 0.15;
    const s = W / (x1 - x0 + pad * 2);
    const H = (y1 - y0 + pad * 2) * s;
    const sx = (x: number) => (x - x0 + pad) * s;
    const sy = (y: number) => (y1 - y + pad) * s;
    const paths = shapes.map((d) => svgPath(d, sx, sy));
    const nodes = DISTRICTS.map((d) => {
      const [x, y] = project(d.lon, d.lat);
      return [sx(x), sy(y)] as [number, number];
    });
    const edges: [number, number][] = [];
    for (const d of DISTRICTS) for (const n of d.neighbors) if (d.id < n) edges.push([d.id, n]);
    return { H, paths, nodes, edges };
  }, [shapes]);

  const emph = useMemo(() => new Set((graphEdges ?? []).map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`))), [graphEdges]);

  return (
    <svg viewBox={`0 0 ${W} ${geom.H.toFixed(0)}`} className={cn('h-auto w-full', className)} role="img" aria-label={label ?? 'Map of Maharashtra’s 36 districts'}>
      <defs>
        <filter id="hs-map-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <g>
        {shapes.map((d, i) => {
          const datum = data?.[d.id];
          const dim = highlight && !highlight.has(d.id);
          const fill = datum ? heatHex(datum.tmax) : '#33495d';
          const stroke = datum && datum.level !== 'green' ? LEVEL_HEX[datum.level] : 'rgba(236,240,241,0.28)';
          return (
            <path
              key={d.id}
              d={geom.paths[i]}
              fill={fill}
              fillOpacity={dim ? 0.18 : datum ? 0.92 : 0.6}
              stroke={selected === d.id ? '#ffffff' : stroke}
              strokeWidth={selected === d.id ? 3 : datum && datum.level !== 'green' ? 1.6 : 0.8}
              strokeLinejoin="round"
              className={cn('transition-[fill,fill-opacity,stroke] duration-500', onSelect && 'cursor-pointer hover:brightness-110')}
              onClick={onSelect ? () => onSelect(d.id) : undefined}
            >
              <title>{`${DISTRICTS[d.id].name}${datum ? ` · ${datum.tmax.toFixed(1)} °C` : ''}`}</title>
            </path>
          );
        })}
      </g>
      {showGraph && (
        <g aria-hidden>
          {geom.edges.map(([a, b]) => {
            const on = emph.has(`${a}-${b}`);
            return (
              <line
                key={`${a}-${b}`}
                x1={geom.nodes[a][0]}
                y1={geom.nodes[a][1]}
                x2={geom.nodes[b][0]}
                y2={geom.nodes[b][1]}
                stroke={on ? '#ffffff' : '#ecf0f1'}
                strokeOpacity={on ? 0.95 : 0.22}
                strokeWidth={on ? 2.6 : 1}
                className="transition-[stroke-opacity,stroke-width] duration-300"
              />
            );
          })}
          {geom.nodes.map(([x, y], id) => (
            <circle key={id} cx={x} cy={y} r={id === selected ? 7 : 4.5} fill={nodeFill?.(id) ?? '#ecf0f1'} stroke="#1a2531" strokeWidth={1.5} className="transition-[fill,r] duration-300" />
          ))}
        </g>
      )}
    </svg>
  );
});
