'use client';

/* eslint-disable react-hooks/immutability -- three.js objects (materials, buffers, fog, groups) are mutated
   imperatively inside useFrame by design in React Three Fiber; React never renders from these values. */

import { memo, useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls, PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { districtShapes, project } from '@/lib/geo';
import { DISTRICTS } from '@/lib/data';
import { LEVEL_HEX, heatRgb, type Level } from '@/lib/heat';
import { rng, sampleText } from '@/lib/text-sample';
import { markSceneReady, type Tier } from './perf';

/*
 * Performance notes (this scene must stay at 60 fps on integrated GPUs):
 *   - every border and every graph edge is a native line inside ONE geometry per layer — no fat-line meshes
 *   - graph nodes are a single InstancedMesh; the BFS wave only rewrites a colour buffer
 *   - the letter→district particles are one Points draw call animated entirely in the vertex shader
 *   - the shadow map renders only while pillars are moving, never on idle frames
 *   - no post-processing pass; resolution steps down automatically if the frame rate drops
 *   - nothing is allocated per frame
 */

export interface MapDatum {
  tmax: number;
  level: Level;
}

/** Card rectangle as fractions of the canvas (hero): the camera frames the whole state inside it. */
export interface CardFit {
  top: number;
  bottom: number;
  side: number;
}

export interface HeatMap3DProps {
  data: MapDatum[]; // index = district id
  tier: Exclude<Tier, 'off'>;
  variant: 'hero' | 'console';
  /** hero: 0..1 camera progress from the card framing to the dive over Vidarbha */
  progressRef?: MutableRefObject<number>;
  /** hero: 0..1 letters→districts morph progress */
  morphRef?: MutableRefObject<number>;
  /** hero: the DOM wordmark the particles are sampled from */
  wordRef?: RefObject<HTMLElement | null>;
  fitRef?: MutableRefObject<CardFit>;
  /** element that receives pointer events for the camera parallax (hero: the whole stage) */
  eventSource?: RefObject<HTMLElement | null>;
  selected?: number | null;
  onSelect?: (id: number) => void;
  onHover?: (id: number | null) => void;
  /** BFS result to animate across the adjacency graph (level per district, parent per district) */
  bfs?: { level: number[]; parent: number[]; source: number } | null;
  /** districts to emphasise (e.g. one heat cluster) */
  emphasis?: Set<number> | null;
  showGraph?: boolean;
  labels?: number[];
  active?: boolean;
}

export const heightFor = (t: number) => 0.06 + Math.max(0, t - 30) * 0.075;

const MIDNIGHT = new THREE.Color('#2c3d50');
const ASPHALT = new THREE.Color('#33495d');
const setHeat = (t: number, out: THREE.Color) => {
  const [r, g, b] = heatRgb(t);
  return out.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
};
const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, t), 3);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Hero morph timing: particle i flies during morph ∈ [delay_i, delay_i + FLIGHT]. */
const FLIGHT = 0.5;
const SPREAD = 0.42; // how much of the morph the breadth-first spread across districts takes
/** Cold height fraction before a district's particles land. */
const COLD = 0.16;
/** District heat-on factor 0..1 for a given morph value. */
const heatOn = (delay: number, m: number) => smooth(delay + 0.4, delay + 0.6, m);

/** Cross-component flags for the frame (cheaper than React state for per-frame signalling). */
interface Bus {
  shadowDirty: boolean;
}

// ── geometry, built once ──────────────────────────────────────────────────────────────────────────────────────────
interface Built {
  id: number;
  geom: THREE.ExtrudeGeometry;
  /** roof border as line-segment pairs at local y = 1, so it rides the pillar's scale for free */
  roof: THREE.BufferGeometry;
  /** outer ring vertices at ground level (camera fitting) */
  ring: THREE.Vector3[];
  /** outer rings in plane coordinates (x, y) for point-in-polygon sampling */
  rings: [number, number][][];
  bbox: [number, number, number, number];
  centroid: [number, number]; // x, z
}

function buildDistricts(): Built[] {
  return districtShapes().map((d) => {
    const shapes: THREE.Shape[] = [];
    const seg: number[] = [];
    const ring: THREE.Vector3[] = [];
    const rings: [number, number][][] = [];
    for (const poly of d.polygons) {
      const [outer, ...holes] = poly;
      const s = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
      for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
      shapes.push(s);
      rings.push(outer as [number, number][]);
      for (let i = 0; i < outer.length; i++) {
        const [x0, y0] = outer[i];
        const [x1, y1] = outer[(i + 1) % outer.length];
        seg.push(x0, 1.003, -y0, x1, 1.003, -y1);
        if (i % 2 === 0) ring.push(new THREE.Vector3(x0, 0, -y0));
      }
    }
    const geom = new THREE.ExtrudeGeometry(shapes, { depth: 1, bevelEnabled: false, curveSegments: 1 });
    geom.rotateX(-Math.PI / 2); // extrude along +Y; shape north (+y) → −Z
    geom.computeVertexNormals();
    const roof = new THREE.BufferGeometry();
    roof.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    const dd = DISTRICTS[d.id];
    const [cx, cy] = project(dd.lon, dd.lat);
    return { id: d.id, geom, roof, ring, rings, bbox: d.bbox, centroid: [cx, -cy] };
  });
}

function insideRings(rings: [number, number][][], x: number, y: number) {
  for (const r of rings) {
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i];
      const [xj, yj] = r[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

// ── one district pillar ───────────────────────────────────────────────────────────────────────────────────────────
const Pillar = memo(function Pillar({
  b,
  datum,
  selected,
  dimmed,
  shadows,
  onSelect,
  onHover,
  interactive,
  rise,
  bus,
  heat,
}: {
  b: Built;
  datum: MapDatum;
  selected: boolean;
  dimmed: boolean;
  shadows: boolean;
  onSelect?: (id: number) => void;
  onHover?: (id: number | null) => void;
  interactive: boolean;
  rise: MutableRefObject<number>;
  bus: Bus;
  /** hero: the district stays cold and low until its particles land (morph ≥ delay) */
  heat?: { ref: MutableRefObject<number>; delay: number };
}) {
  const group = useRef<THREE.Group>(null);
  const mats = useMemo(
    () => ({
      cap: new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.06, envMapIntensity: 0.9 }),
      side: new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.04, envMapIntensity: 0.6 }),
      roof: new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }),
    }),
    [],
  );
  const pair = useMemo(() => [mats.cap, mats.side], [mats]);
  const hover = useRef(false);
  const h = useRef(0.001);
  const target = useMemo(() => {
    const hot = setHeat(datum.tmax, new THREE.Color());
    if (dimmed) hot.lerp(MIDNIGHT, 0.65);
    const cold = hot.clone().lerp(ASPHALT, 0.82);
    const glow = Math.max(0, (datum.tmax - 41.5) / 5) * (dimmed ? 0.12 : 1) * 0.6 + (selected ? 0.2 : 0);
    return { hot, cold, glow };
  }, [datum.tmax, dimmed, selected]);
  const lastOn = useRef(-1);

  // console: colour transition from whatever is showing to the new target, then idle
  const anim = useRef({ t: 1, from: new THREE.Color(), fromGlow: 0 });
  useEffect(() => {
    anim.current = { t: 0, from: mats.cap.color.clone(), fromGlow: mats.cap.emissiveIntensity };
    lastOn.current = -1;
    const strong = datum.level !== 'green' || selected;
    mats.roof.color.set(selected ? '#ffffff' : datum.level === 'green' ? '#ecf0f1' : LEVEL_HEX[datum.level]);
    mats.roof.opacity = dimmed ? 0.12 : strong ? 0.95 : 0.24;
  }, [datum.level, dimmed, selected, mats, target]);

  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  const paint = (color: THREE.Color, glow: number) => {
    mats.cap.color.copy(color);
    mats.side.color.copy(color).multiplyScalar(0.62);
    mats.cap.emissive.copy(color);
    mats.side.emissive.copy(color);
    mats.cap.emissiveIntensity = glow;
    mats.side.emissiveIntensity = glow * 0.35;
  };
  const tmp = useMemo(() => new THREE.Color(), []);

  useFrame((_, dt) => {
    const on = heat ? heatOn(heat.delay, heat.ref.current) : 1;
    const goal = heightFor(datum.tmax) * rise.current * (COLD + (1 - COLD) * on) * (selected ? 1.12 : 1) + (hover.current ? 0.05 : 0);
    const diff = goal - h.current;
    if (Math.abs(diff) > 1e-4) {
      h.current += diff * (1 - Math.exp(-dt * (heat ? 9 : 4.5)));
      if (group.current) group.current.scale.y = Math.max(0.001, h.current);
      bus.shadowDirty = true;
    }
    if (heat) {
      // hero: colour follows the heat-on factor directly (only repaint when it changes)
      if (Math.abs(on - lastOn.current) > 0.002) {
        lastOn.current = on;
        paint(tmp.copy(target.cold).lerp(target.hot, on), target.glow * on);
        mats.roof.opacity = (0.24 + 0.71 * on) * (datum.level === 'green' ? 0.4 : 1);
      }
      return;
    }
    const a = anim.current;
    if (a.t < 1) {
      a.t = Math.min(1, a.t + dt * 1.7);
      const k = easeOut(a.t);
      paint(tmp.copy(a.from).lerp(target.hot, k), a.fromGlow + (target.glow - a.fromGlow) * k);
    }
  });

  const handlers = interactive
    ? {
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          hover.current = true;
          document.body.style.cursor = 'pointer';
          onHover?.(b.id);
        },
        onPointerOut: () => {
          hover.current = false;
          document.body.style.cursor = '';
          onHover?.(null);
        },
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onSelect?.(b.id);
        },
      }
    : {};

  return (
    <group ref={group} scale={[1, 0.001, 1]}>
      <mesh geometry={b.geom} material={pair} castShadow={shadows} receiveShadow={shadows} {...handlers} />
      <lineSegments geometry={b.roof} material={mats.roof} renderOrder={2} />
    </group>
  );
});

// ── letters → districts: one Points draw call, animated in the vertex shader ──────────────────────────────────────
const MORPH_VERT = /* glsl */ `
  attribute vec2 aSrc;
  attribute float aDelay;
  attribute float aSeed;
  attribute float aHeat;
  uniform float uMorph;
  uniform float uTime;
  uniform float uSrcSize;
  uniform float uDstSize;
  uniform float uPixelRatio;
  varying float vAlpha;
  varying float vHeat;
  varying float vE;
  varying float vDst;
  void main() {
    float t = clamp((uMorph - aDelay) / ${FLIGHT.toFixed(2)}, 0.0, 1.0);
    float e = t * t * (3.0 - 2.0 * t);
    vec4 dst = projectionMatrix * viewMatrix * vec4(position, 1.0);
    vec2 dstN = dst.xy / dst.w;
    // a curved flight: up and out from the word, then down onto the district, with a little turbulence mid-air
    vec2 mid = mix(aSrc, dstN, 0.5) + vec2((aSeed - 0.5) * 0.55, 0.28 + aSeed * 0.32);
    vec2 p = mix(mix(aSrc, mid, e), mix(mid, dstN, e), e);
    float air = sin(3.14159 * e);
    p += vec2(sin(aSeed * 40.0 + uTime * 2.1), cos(aSeed * 31.0 + uTime * 1.7)) * 0.025 * air;
    float z = mix(-0.999, clamp(dst.z / dst.w, -1.0, 1.0), smoothstep(0.55, 1.0, e));
    gl_Position = vec4(p, z, 1.0);
    gl_PointSize = mix(uSrcSize, uDstSize, e) * (1.0 + 0.6 * air) * uPixelRatio;
    // visible once the morph starts, gone once the particle has landed and its district has lit up
    vAlpha = smoothstep(0.0, 0.035, uMorph) * (1.0 - smoothstep(0.88, 1.0, t));
    vHeat = air;
    vE = e;
    vDst = aHeat;
  }
`;
const MORPH_FRAG = /* glsl */ `
  varying float vAlpha;
  varying float vHeat;
  varying float vE;
  varying float vDst;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.12, d) * vAlpha;
    // leaves the word in the wordmark's white, arrives in its district's colour: slate for cool, white-hot for hot
    vec3 dest = mix(vec3(0.42, 0.53, 0.62), vec3(1.0, 1.0, 1.0), vDst);
    vec3 col = mix(vec3(0.925, 0.941, 0.945), dest, smoothstep(0.15, 0.85, vE)) * (1.0 + 0.25 * vHeat);
    gl_FragColor = vec4(col * a, a);
  }
`;

function ParticleMorph({
  built,
  data,
  bfs,
  morphRef,
  wordRef,
}: {
  built: Built[];
  data: MapDatum[];
  bfs: NonNullable<HeatMap3DProps['bfs']>;
  morphRef: MutableRefObject<number>;
  wordRef: RefObject<HTMLElement | null>;
}) {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const [geom, setGeom] = useState<THREE.BufferGeometry | null>(null);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: MORPH_VERT,
        fragmentShader: MORPH_FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        premultipliedAlpha: true,
        uniforms: { uMorph: { value: 0 }, uTime: { value: 0 }, uSrcSize: { value: 3 }, uDstSize: { value: 2.2 }, uPixelRatio: { value: 1 } },
      }),
    [],
  );
  const maxLevel = Math.max(1, ...bfs.level);

  // (re)build whenever the layout changes: sources are the word's glyph pixels in canvas NDC, destinations are random
  // points on the districts' roofs, paired west→east so the flight paths fan out instead of crossing
  useEffect(() => {
    let cancelled = false;
    const build = () => {
      const word = wordRef.current;
      if (!word || cancelled) return;
      const sample = sampleText(word, { max: 6500, density: 54, seed: 11 });
      if (!sample) return;
      const cr = gl.domElement.getBoundingClientRect();
      const n = sample.count;
      const src = new Float32Array(n * 2);
      const order: number[] = [];
      for (let i = 0; i < n; i++) {
        src[2 * i] = ((sample.points[2 * i] - cr.left) / cr.width) * 2 - 1;
        src[2 * i + 1] = 1 - ((sample.points[2 * i + 1] - cr.top) / cr.height) * 2;
        order.push(i);
      }
      order.sort((a, b) => src[2 * a] - src[2 * b]);

      // destinations: districts weighted by area, a random roof point inside each polygon
      const rand = rng(23);
      const area = DISTRICTS.map((d) => d.areaKm2);
      const total = area.reduce((s, v) => s + v, 0);
      const dst: { x: number; y: number; z: number; id: number }[] = [];
      for (let k = 0; k < built.length; k++) {
        const quota = Math.max(12, Math.round((area[k] / total) * n));
        const b = built[k];
        const [x0, y0, x1, y1] = b.bbox;
        const top = heightFor(data[k].tmax) + 0.006;
        let made = 0;
        for (let tries = 0; made < quota && tries < quota * 40; tries++) {
          const px = x0 + rand() * (x1 - x0);
          const py = y0 + rand() * (y1 - y0);
          if (!insideRings(b.rings, px, py)) continue;
          dst.push({ x: px, y: top, z: -py, id: k });
          made++;
        }
      }
      dst.sort((a, b) => a.x - b.x);
      const m = Math.min(n, dst.length);
      const pos = new Float32Array(m * 3);
      const srcOut = new Float32Array(m * 2);
      const delay = new Float32Array(m);
      const seed = new Float32Array(m);
      const heat = new Float32Array(m);
      for (let j = 0; j < m; j++) {
        // pair the j-th leftmost glyph point with the j-th westernmost roof point (sampled evenly across both lists)
        const si = order[Math.floor((j / m) * n)];
        const d = dst[Math.floor((j / m) * dst.length)];
        pos[3 * j] = d.x;
        pos[3 * j + 1] = d.y;
        pos[3 * j + 2] = d.z;
        srcOut[2 * j] = src[2 * si];
        srcOut[2 * j + 1] = src[2 * si + 1];
        // breadth-first from the hottest district: its neighbours receive their heat next, and so on outward
        delay[j] = (SPREAD * Math.max(0, bfs.level[d.id])) / maxLevel + rand() * 0.08;
        seed[j] = rand();
        heat[j] = Math.min(1, Math.max(0, (data[d.id].tmax - 34) / 11));
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aSrc', new THREE.BufferAttribute(srcOut, 2));
      g.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      g.setAttribute('aHeat', new THREE.BufferAttribute(heat, 1));
      mat.uniforms.uSrcSize.value = sample.step * 1.25;
      setGeom((old) => {
        old?.dispose();
        return g;
      });
    };
    const fonts = document.fonts?.ready ?? Promise.resolve();
    fonts.then(() => requestAnimationFrame(build));
    return () => {
      cancelled = true;
    };
  }, [gl, size.width, size.height, built, data, bfs, maxLevel, mat, wordRef]);

  useEffect(
    () => () => {
      mat.dispose();
    },
    [mat],
  );
  useEffect(() => () => geom?.dispose(), [geom]);

  useFrame(({ clock }) => {
    mat.uniforms.uMorph.value = morphRef.current;
    mat.uniforms.uTime.value = clock.elapsedTime;
    mat.uniforms.uPixelRatio.value = gl.getPixelRatio();
  });

  if (!geom) return null;
  return <points geometry={geom} material={mat} frustumCulled={false} renderOrder={10} />;
}

// ── adjacency graph with BFS waves: one line geometry + one instanced mesh ─────────────────────────────────────────
const ARC_SEGMENTS = 16;

function GraphLayer({ built, data, bfs, rise }: { built: Built[]; data: MapDatum[]; bfs?: HeatMap3DProps['bfs']; rise: MutableRefObject<number> }) {
  const edges = useMemo(() => {
    const out: [number, number][] = [];
    for (const d of DISTRICTS) for (const n of d.neighbors) if (d.id < n) out.push([d.id, n]);
    return out;
  }, []);

  const lineGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const verts = edges.length * ARC_SEGMENTS * 2;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(verts * 4).fill(1), 4).setUsage(THREE.DynamicDrawUsage));
    return g;
  }, [edges]);
  const lineMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true, toneMapped: false }),
    [],
  );

  // arc shapes follow the pillar heights of the day; rebuilt in place (no new GPU objects)
  useEffect(() => {
    const pos = lineGeom.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const a = new THREE.Vector3();
    const m = new THREE.Vector3();
    const c = new THREE.Vector3();
    const p = new THREE.Vector3();
    const q = new THREE.Vector3();
    let o = 0;
    for (const [u, v] of edges) {
      const ya = heightFor(data[u].tmax) + 0.08;
      const yb = heightFor(data[v].tmax) + 0.08;
      a.set(built[u].centroid[0], ya, built[u].centroid[1]);
      c.set(built[v].centroid[0], yb, built[v].centroid[1]);
      m.set((a.x + c.x) / 2, Math.max(ya, yb) + 0.32, (a.z + c.z) / 2);
      const at = (t: number, out: THREE.Vector3) => out.set(0, 0, 0).addScaledVector(a, (1 - t) ** 2).addScaledVector(m, 2 * (1 - t) * t).addScaledVector(c, t * t);
      for (let s = 0; s < ARC_SEGMENTS; s++) {
        at(s / ARC_SEGMENTS, p);
        at((s + 1) / ARC_SEGMENTS, q);
        arr[o++] = p.x;
        arr[o++] = p.y;
        arr[o++] = p.z;
        arr[o++] = q.x;
        arr[o++] = q.y;
        arr[o++] = q.z;
      }
    }
    pos.needsUpdate = true;
    lineGeom.computeBoundingSphere();
  }, [lineGeom, edges, built, data]);

  const nodes = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tint = useMemo(() => new THREE.Color(), []);
  const nodeY = useMemo(() => data.map((d) => heightFor(d.tmax) + 0.08), [data]);
  const maxLevel = bfs ? Math.max(...bfs.level) : 0;
  const PERIOD = 1.1; // seconds per BFS level

  useEffect(
    () => () => {
      lineGeom.dispose();
      lineMat.dispose();
    },
    [lineGeom, lineMat],
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const cycle = (maxLevel + 2.5) * PERIOD;
    const wave = bfs ? (t % cycle) / PERIOD : -1;
    const r = rise.current;
    const col = lineGeom.getAttribute('color') as THREE.BufferAttribute;
    const arr = col.array as Float32Array;
    let o = 0;
    for (const [u, v] of edges) {
      let k = 0.09 * r;
      if (bfs) {
        const tree = bfs.parent[v] === u || bfs.parent[u] === v;
        if (tree) {
          const dist = wave - Math.max(bfs.level[u], bfs.level[v]);
          k = dist > -0.15 && dist < 1.2 ? 0.95 * (1 - Math.max(0, dist) / 1.2) : 0.2;
          k *= r;
        }
      }
      for (let s = 0; s < ARC_SEGMENTS * 2; s++) {
        arr[o + 3] = k; // rgb stays white; alpha carries the brightness
        o += 4;
      }
    }
    col.needsUpdate = true;

    const mesh = nodes.current;
    if (!mesh) return;
    for (let id = 0; id < built.length; id++) {
      const lv = bfs ? bfs.level[id] : -1;
      const dist = wave - lv;
      const pulse = bfs && lv >= 0 && dist > 0 && dist < 1 ? 1 - dist : 0;
      const s = Math.max(0.001, (id === bfs?.source ? 1.6 : 1) * (0.9 + pulse * 1.4) * r);
      dummy.position.set(built[id].centroid[0], nodeY[id], built[id].centroid[1]);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      mesh.setMatrixAt(id, dummy.matrix);
      mesh.setColorAt(id, tint.setScalar(0.45 + pulse * 0.55));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <lineSegments geometry={lineGeom} material={lineMat} renderOrder={3} frustumCulled={false} />
      <instancedMesh ref={nodes} args={[undefined, undefined, built.length]} frustumCulled={false} renderOrder={4}>
        <sphereGeometry args={[0.035, 10, 10]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

// ── camera choreography ───────────────────────────────────────────────────────────────────────────────────────────
function HeroRig({
  progressRef,
  fitRef,
  built,
  data,
}: {
  progressRef?: MutableRefObject<number>;
  fitRef?: MutableRefObject<CardFit>;
  built: Built[];
  data: MapDatum[];
}) {
  const { camera, pointer, scene, size } = useThree();
  const look = useMemo(() => new THREE.Vector3(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const target0 = useMemo(() => new THREE.Vector3(0, 0.3, 0.1), []);
  // end of the scroll: low over Vidarbha, the hot core
  const to = useMemo(() => new THREE.Vector3(5.4, 3.3, 6.2), []);
  // start direction: an oblique ~40° view, which suits a wide, short card better than a top-down one
  const dir = useMemo(() => new THREE.Vector3(0.25, 8.2, 9.6).normalize(), []);
  const probe = useMemo(() => new THREE.PerspectiveCamera(), []);
  // every outline vertex, at ground level and at the top of its (fully risen) pillar plus room for the graph arcs
  const corners = useMemo(() => {
    const out: THREE.Vector3[] = [];
    built.forEach((b) => {
      const top = heightFor(data[b.id].tmax) + 0.35;
      b.ring.forEach((pt) => out.push(pt.clone(), new THREE.Vector3(pt.x, top, pt.z)));
    });
    return out;
  }, [built, data]);
  const fitted = useRef({ key: '', from: new THREE.Vector3(0.25, 8.2, 9.6), dy: 0 });
  const v = useMemo(() => new THREE.Vector3(), []);
  const placed = useRef(false);

  /**
   * The card sits below the centre of the canvas, so the projection is shifted (setViewOffset) to put the look-at
   * point in the middle of the card — the canvas itself never moves, which keeps screen and canvas coordinates equal
   * for the letter particles. Then the camera distance is binary-searched until every corner lands inside the card.
   */
  const fitFrom = (f: CardFit) => {
    const W = size.width;
    const H = Math.max(1, size.height);
    const dy = ((f.top + (1 - f.bottom)) / 2 - 0.5) * H;
    const persp = camera as THREE.PerspectiveCamera;
    probe.fov = persp.fov;
    probe.aspect = W / H;
    probe.near = 0.1;
    probe.far = 200;
    probe.setViewOffset(W, H, 0, -dy, W, H);
    const topN = 1 - 2 * f.top;
    const botN = -1 + 2 * f.bottom;
    const mY = (topN - botN) * 0.07;
    const xLim = (1 - 2 * f.side) * 0.9;
    const fits = (d: number) => {
      probe.position.copy(target0).addScaledVector(dir, d);
      probe.lookAt(target0);
      probe.updateMatrixWorld();
      return corners.every((c) => {
        v.copy(c).project(probe);
        return Math.abs(v.x) <= xLim && v.y <= topN - mY && v.y >= botN + mY;
      });
    };
    let lo = 4;
    let hi = 140;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    return { from: target0.clone().addScaledVector(dir, hi), dy };
  };

  useEffect(() => () => (camera as THREE.PerspectiveCamera).clearViewOffset(), [camera]);

  useFrame(({ clock }, dt) => {
    const f = fitRef?.current ?? { top: 0.05, bottom: 0.05, side: 0.05 };
    const key = `${size.width}x${size.height}:${f.top.toFixed(4)}:${f.bottom.toFixed(4)}:${f.side.toFixed(4)}`;
    if (fitted.current.key !== key) fitted.current = { key, ...fitFrom(f) };
    const { from, dy } = fitted.current;

    const p = progressRef?.current ?? 0;
    const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    const t = clock.elapsedTime;
    pos.lerpVectors(from, to, e);
    // idle drift and pointer parallax, scaled down while the whole state must stay inside the card
    const sway = 0.2 + 0.8 * e;
    pos.x += (Math.sin(t * 0.18) * 0.3 + pointer.x * 0.45) * sway;
    pos.y += (Math.cos(t * 0.21) * 0.1 + pointer.y * 0.2) * sway;
    // first frame: start exactly on the fitted framing so the whole state is visible from the first paint
    if (!placed.current) {
      placed.current = true;
      camera.position.copy(pos);
    } else camera.position.lerp(pos, 1 - Math.exp(-dt * 3));
    look.set(THREE.MathUtils.lerp(target0.x, 1.4, e), THREE.MathUtils.lerp(target0.y, 0.3, e), THREE.MathUtils.lerp(target0.z, -0.4, e));
    camera.lookAt(look);
    (camera as THREE.PerspectiveCamera).setViewOffset(size.width, size.height, 0, -dy * (1 - e), size.width, size.height);
    // keep the fog band around the map whatever the camera distance
    if (scene.fog instanceof THREE.Fog) {
      const d = camera.position.distanceTo(look);
      scene.fog.near = d * 0.85;
      scene.fog.far = d * 2.4;
    }
  });
  return null;
}

/** Projects label anchors to screen space every frame and moves plain DOM labels (no extra React roots). */
function LabelProjector({
  built,
  data,
  labels,
  els,
  progressRef,
}: {
  built: Built[];
  data: MapDatum[];
  labels: number[];
  els: MutableRefObject<(HTMLDivElement | null)[]>;
  /** hero: labels stay hidden until the camera has dived in, so they never pile up on the small overview */
  progressRef?: MutableRefObject<number>;
}) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const show = progressRef ? Math.min(1, Math.max(0, (progressRef.current - 0.55) / 0.15)) : 1;
    labels.forEach((id, i) => {
      const el = els.current[i];
      if (!el) return;
      v.set(built[id].centroid[0], heightFor(data[id].tmax) + 0.12, built[id].centroid[1]).project(camera);
      if (v.z > 1 || show === 0) {
        if (el.style.opacity !== '0') el.style.opacity = '0';
        return;
      }
      el.style.opacity = show.toFixed(2);
      el.style.transform = `translate3d(${(((v.x + 1) / 2) * size.width).toFixed(1)}px, ${(((1 - v.y) / 2) * size.height).toFixed(1)}px, 0) translate(-50%, -130%)`;
    });
  });
  return null;
}

/** Renders the shadow map only on frames where something moved. */
function ShadowSync({ bus }: { bus: Bus }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
  }, [gl]);
  useFrame(() => {
    if (bus.shadowDirty) {
      gl.shadowMap.needsUpdate = true;
      bus.shadowDirty = false;
    }
  });
  return null;
}

function Ready() {
  const frames = useRef(0);
  useFrame(() => {
    if (++frames.current === 3) markSceneReady();
  });
  return null;
}

function Ground({ shadows, hero }: { shadows: boolean; hero: boolean }) {
  // hero: the canvas is transparent over the page, so only the shadows are drawn on the ground
  if (hero)
    return shadows ? (
      <mesh rotation-x={-Math.PI / 2} position-y={-0.002} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <shadowMaterial opacity={0.35} />
      </mesh>
    ) : null;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.002} receiveShadow={shadows}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#1a2531" roughness={0.92} metalness={0} />
      </mesh>
      <gridHelper args={[40, 80, '#33495d', '#233242']} position-y={0.0005} />
    </group>
  );
}

// ── scene ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function Scene(props: HeatMap3DProps & { built: Built[]; labelEls: MutableRefObject<(HTMLDivElement | null)[]> }) {
  const { built, data, tier, variant, selected, onSelect, onHover, bfs, emphasis, showGraph = true, labels = [], progressRef, morphRef, wordRef } = props;
  const hero = variant === 'hero';
  const shadows = tier === 'high';
  const rise = useRef(0);
  const graphRise = useRef(0);
  const bus = useMemo<Bus>(() => ({ shadowDirty: true }), []);
  const maxLevel = bfs ? Math.max(1, ...bfs.level) : 1;
  useFrame((_, dt) => {
    if (rise.current < 1) rise.current = Math.min(1, rise.current + dt * 0.55);
    // hero: the graph appears once the letters have landed
    graphRise.current = rise.current * (morphRef ? smooth(0.86, 1, morphRef.current) : 1);
  });

  return (
    <>
      {!hero && <color attach="background" args={['#1a2531']} />}
      <fog attach="fog" args={['#1a2531', 9, 26]} />
      <ambientLight intensity={0.4} color="#bdc3c7" />
      <hemisphereLight args={['#ecf0f1', '#1a2531', 0.5]} />
      <directionalLight
        position={[5, 9, 4]}
        intensity={1.7}
        color="#ecf0f1"
        castShadow={shadows}
        shadow-mapSize={[1536, 1536]}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[-6, 4, -5]} intensity={0.5} color="#bdc3c7" />
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={1.4} color="#ecf0f1" position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
        <Lightformer form="rect" intensity={0.6} color="#bdc3c7" position={[-6, 2, 3]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="ring" intensity={0.5} color="#ecf0f1" position={[6, 3, -2]} scale={3} />
      </Environment>

      <Ground shadows={shadows} hero={hero} />

      <group>
        {built.map((b) => (
          <Pillar
            key={b.id}
            b={b}
            datum={data[b.id]}
            selected={selected === b.id}
            dimmed={!!emphasis && !emphasis.has(b.id)}
            shadows={shadows}
            onSelect={onSelect}
            onHover={onHover}
            interactive={variant === 'console'}
            rise={rise}
            bus={bus}
            heat={morphRef && bfs ? { ref: morphRef, delay: (SPREAD * Math.max(0, bfs.level[b.id])) / maxLevel } : undefined}
          />
        ))}
        {showGraph && <GraphLayer built={built} data={data} bfs={bfs} rise={graphRise} />}
        {hero && morphRef && wordRef && bfs && <ParticleMorph built={built} data={data} bfs={bfs} morphRef={morphRef} wordRef={wordRef} />}
        <LabelProjector built={built} data={data} labels={labels} els={props.labelEls} progressRef={hero ? progressRef : undefined} />
      </group>

      {hero ? (
        <HeroRig progressRef={progressRef} fitRef={props.fitRef} built={built} data={data} />
      ) : (
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={4} maxDistance={20} maxPolarAngle={Math.PI / 2.25} target={[0.3, 0.2, 0.3]} />
      )}
      {shadows && <ShadowSync bus={bus} />}
      <Ready />
    </>
  );
}

export default function HeatMap3D(props: HeatMap3DProps) {
  const built = useMemo(() => buildDistricts(), []);
  const labelEls = useRef<(HTMLDivElement | null)[]>([]);
  const labels = props.labels ?? [];
  const hero = props.variant === 'hero';
  // client-only component (loaded with ssr: false), so window is always available here
  const maxDpr = Math.min(window.devicePixelRatio || 1, props.tier === 'high' ? 1.5 : 1.25);
  const [dpr, setDpr] = useState(maxDpr);
  useEffect(
    () => () =>
      built.forEach((b) => {
        b.geom.dispose();
        b.roof.dispose();
      }),
    [built],
  );

  return (
    <div className="absolute inset-0">
      <Canvas
        shadows={props.tier === 'high' ? 'percentage' : false}
        dpr={Math.min(dpr, maxDpr)}
        frameloop={props.active === false ? 'never' : 'always'}
        camera={{ position: hero ? [0.25, 8.2, 9.6] : [1.4, 9.8, 9.6], fov: 34, near: 0.1, far: 140 }}
        gl={{ antialias: true, powerPreference: 'high-performance', alpha: hero, stencil: false, premultipliedAlpha: true }}
        eventSource={props.eventSource as RefObject<HTMLElement> | undefined}
        eventPrefix={props.eventSource ? 'client' : undefined}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          if (hero) gl.setClearColor(0x000000, 0);
        }}
        onPointerMissed={() => props.onHover?.(null)}
      >
        {/* step the resolution down (never below 1×) when frames start dropping, back up when there is headroom */}
        <PerformanceMonitor
          flipflops={3}
          onDecline={() => setDpr((d) => Math.max(1, d - 0.25))}
          onIncline={() => setDpr((d) => Math.min(maxDpr, d + 0.25))}
          onFallback={() => setDpr(1)}
        />
        <Scene {...props} built={built} labelEls={labelEls} />
      </Canvas>
      {/* console: vignette in CSS instead of a post-processing pass */}
      {!hero && <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_58%,rgba(18,26,35,0.55)_100%)]" />}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {labels.map((id, i) => (
          <div
            key={id}
            ref={(el) => {
              labelEls.current[i] = el;
            }}
            className="absolute left-0 top-0 whitespace-nowrap rounded-full border border-white/20 bg-[#1a2531]/92 px-2.5 py-1 font-mono text-[11px] text-cloud opacity-0 shadow-lg will-change-transform"
          >
            <span className="mr-1.5 inline-block size-1.5 rounded-full align-middle" style={{ background: LEVEL_HEX[props.data[id].level] }} />
            {DISTRICTS[id].name} <span className="text-silver">{props.data[id].tmax.toFixed(1)}°</span>
          </div>
        ))}
      </div>
    </div>
  );
}
