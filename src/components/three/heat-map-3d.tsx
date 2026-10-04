'use client';

/* eslint-disable react-hooks/immutability -- three.js objects (materials, fog, groups) are mutated imperatively inside
   useFrame by design in React Three Fiber; React never renders from these values. */

import { memo, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Environment, Lightformer, Line, OrbitControls } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { districtShapes, project } from '@/lib/geo';
import { DISTRICTS } from '@/lib/data';
import { LEVEL_HEX, heatRgb, type Level } from '@/lib/heat';
import { markSceneReady, type Tier } from './perf';

export interface MapDatum {
  tmax: number;
  level: Level;
}

export interface HeatMap3DProps {
  data: MapDatum[]; // index = district id
  tier: Exclude<Tier, 'off'>;
  variant: 'hero' | 'console';
  /** 0..1 scroll progress for the hero choreography */
  progressRef?: MutableRefObject<number>;
  /** hero only: the visible card as fractions of the canvas (height, width); the camera fits the whole state in it */
  fitRef?: MutableRefObject<{ h: number; w: number }>;
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

const C = {
  cloud: new THREE.Color('#ecf0f1'),
  silver: new THREE.Color('#bdc3c7'),
  asphalt: new THREE.Color('#33495d'),
  midnight: new THREE.Color('#2c3d50'),
  abyss: new THREE.Color('#1a2531'),
  void: new THREE.Color('#121a23'),
};

export const heightFor = (t: number) => 0.06 + Math.max(0, t - 30) * 0.075;

const tmp = new THREE.Color();
const heatColor = (t: number, out: THREE.Color) => {
  const [r, g, b] = heatRgb(t);
  return out.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
};

// ── geometry, built once ──────────────────────────────────────────────────────────────────────────────────────────
interface Built {
  id: number;
  geom: THREE.ExtrudeGeometry;
  outline: THREE.Vector3[][]; // outer rings at y = 0
  centroid: [number, number]; // x, z
}

function buildDistricts(): Built[] {
  return districtShapes().map((d) => {
    const shapes: THREE.Shape[] = [];
    const outline: THREE.Vector3[][] = [];
    for (const poly of d.polygons) {
      const [outer, ...holes] = poly;
      const s = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
      for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
      shapes.push(s);
      outline.push(outer.map(([x, y]) => new THREE.Vector3(x, 0, -y)));
    }
    const geom = new THREE.ExtrudeGeometry(shapes, { depth: 1, bevelEnabled: false, curveSegments: 1 });
    geom.rotateX(-Math.PI / 2); // extrude along +Y; shape north (+y) → −Z
    geom.computeVertexNormals();
    const dd = DISTRICTS[d.id];
    const [cx, cy] = project(dd.lon, dd.lat);
    return { id: d.id, geom, outline, centroid: [cx, -cy] };
  });
}

// ── one district pillar ───────────────────────────────────────────────────────────────────────────────────────────
const Pillar = memo(function Pillar({
  b,
  datum,
  selected,
  dimmed,
  tier,
  onSelect,
  onHover,
  interactive,
  rise,
}: {
  b: Built;
  datum: MapDatum;
  selected: boolean;
  dimmed: boolean;
  tier: 'high' | 'low';
  onSelect?: (id: number) => void;
  onHover?: (id: number | null) => void;
  interactive: boolean;
  rise: MutableRefObject<number>;
}) {
  const group = useRef<THREE.Group>(null);
  const cap = useMemo(() => new THREE.MeshPhysicalMaterial({ roughness: 0.38, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.35 }), []);
  const side = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.08 }), []);
  const materials = useMemo(() => [cap, side], [cap, side]);
  const hover = useRef(false);
  const target = heightFor(datum.tmax);
  const h = useRef(0.001);
  const levelHex = LEVEL_HEX[datum.level];

  useEffect(() => () => [cap, side].forEach((m) => m.dispose()), [cap, side]);

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 4.5);
    const goal = target * rise.current * (selected ? 1.12 : 1) + (hover.current ? 0.05 : 0);
    h.current += (goal - h.current) * k;
    if (group.current) group.current.scale.y = Math.max(0.001, h.current);

    heatColor(datum.tmax, tmp);
    if (dimmed) tmp.lerp(C.midnight, 0.65);
    cap.color.lerp(tmp, k);
    side.color.lerp(tmp.clone().multiplyScalar(0.62), k);
    // white-hot districts glow; hover and selection lift them slightly
    const glow = Math.max(0, (datum.tmax - 41.5) / 5) * (dimmed ? 0.15 : 1) * 0.55 + (hover.current ? 0.12 : 0) + (selected ? 0.18 : 0);
    cap.emissive.copy(tmp);
    cap.emissiveIntensity += (glow - cap.emissiveIntensity) * k;
    side.emissive.copy(tmp);
    side.emissiveIntensity = cap.emissiveIntensity * 0.35;
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
    <group>
      <group ref={group} scale={[1, 0.001, 1]}>
        <mesh geometry={b.geom} material={materials} castShadow={tier === 'high'} receiveShadow={tier === 'high'} {...handlers} />
      </group>
      <TopOutline b={b} heightRef={h} color={datum.level === 'green' ? '#ecf0f1' : levelHex} strong={datum.level !== 'green' || selected} />
    </group>
  );
});

/** Border drawn on the pillar's roof, coloured by warning level. */
function TopOutline({ b, heightRef, color, strong }: { b: Built; heightRef: MutableRefObject<number>; color: string; strong: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (g.current) g.current.position.y = heightRef.current + 0.004;
  });
  return (
    <group ref={g}>
      {b.outline.map((pts, i) => (
        <Line key={i} points={pts} color={color} lineWidth={strong ? 1.4 : 0.6} transparent opacity={strong ? 0.95 : 0.22} />
      ))}
    </group>
  );
}

// ── adjacency graph with BFS waves ────────────────────────────────────────────────────────────────────────────────
function GraphLayer({
  built,
  data,
  bfs,
  rise,
}: {
  built: Built[];
  data: MapDatum[];
  bfs?: HeatMap3DProps['bfs'];
  rise: MutableRefObject<number>;
}) {
  const edges = useMemo(() => {
    const out: { a: number; b: number; curve: THREE.QuadraticBezierCurve3 }[] = [];
    for (const d of DISTRICTS)
      for (const n of d.neighbors)
        if (d.id < n) {
          const [ax, az] = built[d.id].centroid;
          const [bx, bz] = built[n].centroid;
          const ya = heightFor(data[d.id].tmax) + 0.08;
          const yb = heightFor(data[n].tmax) + 0.08;
          const mid = new THREE.Vector3((ax + bx) / 2, Math.max(ya, yb) + 0.32, (az + bz) / 2);
          out.push({ a: d.id, b: n, curve: new THREE.QuadraticBezierCurve3(new THREE.Vector3(ax, ya, az), mid, new THREE.Vector3(bx, yb, bz)) });
        }
    return out;
  }, [built, data]);

  const lines = useRef<(THREE.Object3D | null)[]>([]);
  const nodes = useRef<(THREE.Mesh | null)[]>([]);
  const maxLevel = bfs ? Math.max(...bfs.level) : 0;
  const PERIOD = 1.1; // seconds per BFS level

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const cycle = (maxLevel + 2.5) * PERIOD;
    const wave = bfs ? (t % cycle) / PERIOD : -1; // current BFS level (fractional)
    edges.forEach((e, i) => {
      const obj = lines.current[i] as unknown as { material?: { opacity: number; color: THREE.Color } } | null;
      if (!obj?.material) return;
      let o = 0.1 * rise.current;
      let lit = false;
      if (bfs) {
        // an edge is a BFS tree edge when one end is the other's parent
        const tree = bfs.parent[e.b] === e.a || bfs.parent[e.a] === e.b;
        const lv = Math.max(bfs.level[e.a], bfs.level[e.b]);
        const dist = wave - lv;
        if (tree && dist > -0.15 && dist < 1.2) {
          o = 0.95 * (1 - Math.max(0, dist) / 1.2);
          lit = true;
        } else if (tree) o = 0.22;
      }
      obj.material.opacity = o;
      obj.material.color.set(lit ? '#ffffff' : '#bdc3c7');
    });
    nodes.current.forEach((m, id) => {
      if (!m) return;
      const lv = bfs ? bfs.level[id] : -1;
      const dist = wave - lv;
      const pulse = bfs && lv >= 0 && dist > 0 && dist < 1 ? 1 - dist : 0;
      const s = (id === bfs?.source ? 1.6 : 1) * (0.9 + pulse * 1.4) * rise.current;
      m.scale.setScalar(Math.max(0.001, s));
      (m.material as THREE.MeshBasicMaterial).opacity = 0.35 + pulse * 0.65;
    });
  });

  return (
    <group>
      {edges.map((e, i) => (
        <Line
          key={`${e.a}-${e.b}`}
          ref={(r) => {
            lines.current[i] = r as unknown as THREE.Object3D;
          }}
          points={e.curve.getPoints(18)}
          color="#bdc3c7"
          lineWidth={1.1}
          transparent
          opacity={0.1}
          depthWrite={false}
        />
      ))}
      {built.map((b) => (
        <mesh
          key={b.id}
          ref={(r) => {
            nodes.current[b.id] = r;
          }}
          position={[b.centroid[0], heightFor(data[b.id].tmax) + 0.08, b.centroid[1]]}
        >
          <sphereGeometry args={[0.035, 12, 12]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.5} toneMapped={false} />
        </mesh>
      ))}
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
  fitRef?: MutableRefObject<{ h: number; w: number }>;
  built: Built[];
  data: MapDatum[];
}) {
  const { camera, pointer, scene, size } = useThree();
  const look = useMemo(() => new THREE.Vector3(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const target0 = useMemo(() => new THREE.Vector3(0, 0.35, 0.1), []);
  // end of the scroll: low over Vidarbha, the hot core
  const to = useMemo(() => new THREE.Vector3(5.4, 3.3, 6.2), []);
  // start direction: an oblique ~40° view, which suits a wide, short card better than a top-down one
  const dir = useMemo(() => new THREE.Vector3(0.25, 8.2, 9.6).normalize(), []);
  const probe = useMemo(() => new THREE.PerspectiveCamera(), []);
  // every outline vertex, at ground level and at the top of its own pillar (+ room for the graph arcs)
  const corners = useMemo(() => {
    const out: THREE.Vector3[] = [];
    built.forEach((b) => {
      const top = heightFor(data[b.id].tmax) + 0.35;
      b.outline.forEach((ring) =>
        ring.forEach((pt, i) => {
          if (i % 2) return;
          out.push(new THREE.Vector3(pt.x, 0, pt.z), new THREE.Vector3(pt.x, top, pt.z));
        }),
      );
    });
    return out;
  }, [built, data]);
  const fitted = useRef({ key: '', from: new THREE.Vector3(0.25, 8.2, 9.6) });
  const v = useMemo(() => new THREE.Vector3(), []);
  const placed = useRef(false);

  /** Smallest camera distance (along the start direction) at which every corner lands inside the card. */
  const fitFrom = (h: number, w: number) => {
    const persp = camera as THREE.PerspectiveCamera;
    probe.fov = persp.fov;
    probe.aspect = size.width / Math.max(1, size.height);
    probe.near = 0.1;
    probe.far = 200;
    probe.updateProjectionMatrix();
    const fits = (d: number) => {
      probe.position.copy(target0).addScaledVector(dir, d);
      probe.lookAt(target0);
      probe.updateMatrixWorld();
      return corners.every((c) => {
        v.copy(c).project(probe);
        return Math.abs(v.x) <= w * 0.92 && Math.abs(v.y) <= h * 0.88;
      });
    };
    let lo = 4;
    let hi = 120;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    return target0.clone().addScaledVector(dir, hi);
  };

  useFrame(({ clock }, dt) => {
    const f = fitRef?.current ?? { h: 0.9, w: 0.9 };
    const key = `${size.width}x${size.height}:${f.h.toFixed(3)}:${f.w.toFixed(3)}`;
    if (fitted.current.key !== key) fitted.current = { key, from: fitFrom(f.h, f.w) };
    const from = fitted.current.from;

    const p = progressRef?.current ?? 0;
    const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    const t = clock.elapsedTime;
    pos.lerpVectors(from, to, e);
    // idle drift and pointer parallax, scaled down while the whole state must stay in frame
    const sway = 0.25 + 0.75 * e;
    pos.x += (Math.sin(t * 0.18) * 0.3 + pointer.x * 0.45) * sway;
    pos.y += (Math.cos(t * 0.21) * 0.1 + pointer.y * 0.2) * sway;
    // first frame: start exactly on the fitted framing so the whole state is visible from the first paint
    if (!placed.current) {
      placed.current = true;
      camera.position.copy(pos);
    } else camera.position.lerp(pos, 1 - Math.exp(-dt * 3));
    look.set(THREE.MathUtils.lerp(target0.x, 1.4, e), THREE.MathUtils.lerp(target0.y, 0.3, e), THREE.MathUtils.lerp(target0.z, -0.4, e));
    camera.lookAt(look);
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
    labels.forEach((id, i) => {
      const el = els.current[i];
      if (!el) return;
      v.set(built[id].centroid[0], heightFor(data[id].tmax) + 0.12, built[id].centroid[1]).project(camera);
      const show = progressRef ? Math.min(1, Math.max(0, (progressRef.current - 0.3) / 0.15)) : 1;
      if (v.z > 1 || show === 0) {
        el.style.opacity = '0';
        return;
      }
      el.style.opacity = show.toFixed(2);
      el.style.transform = `translate3d(${(((v.x + 1) / 2) * size.width).toFixed(1)}px, ${(((1 - v.y) / 2) * size.height).toFixed(1)}px, 0) translate(-50%, -130%)`;
    });
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

function Ground() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.002} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#1a2531" roughness={0.92} metalness={0} />
      </mesh>
      <gridHelper args={[40, 80, '#33495d', '#233242']} position-y={0.0005} />
    </group>
  );
}

// ── scene ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function Scene(props: HeatMap3DProps & { built: Built[]; labelEls: MutableRefObject<(HTMLDivElement | null)[]> }) {
  const { built, data, tier, variant, selected, onSelect, onHover, bfs, emphasis, showGraph = true, labels = [], progressRef } = props;
  const rise = useRef(0);
  useFrame((_, dt) => {
    rise.current = Math.min(1, rise.current + dt * 0.55);
  });

  return (
    <>
      <color attach="background" args={['#1a2531']} />
      <fog attach="fog" args={['#1a2531', 9, 26]} />
      <ambientLight intensity={0.35} color="#bdc3c7" />
      <hemisphereLight args={['#ecf0f1', '#1a2531', 0.45]} />
      <directionalLight
        position={[5, 9, 4]}
        intensity={1.6}
        color="#ecf0f1"
        castShadow={tier === 'high'}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-6, 4, -5]} intensity={0.5} color="#bdc3c7" />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={1.4} color="#ecf0f1" position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
        <Lightformer form="rect" intensity={0.6} color="#bdc3c7" position={[-6, 2, 3]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="ring" intensity={0.5} color="#ecf0f1" position={[6, 3, -2]} scale={3} />
      </Environment>

      <Ground />

      <group>
        {built.map((b) => (
          <Pillar
            key={b.id}
            b={b}
            datum={data[b.id]}
            selected={selected === b.id}
            dimmed={!!emphasis && !emphasis.has(b.id)}
            tier={tier}
            onSelect={onSelect}
            onHover={onHover}
            interactive={variant === 'console'}
            rise={rise}
          />
        ))}
        {showGraph && <GraphLayer built={built} data={data} bfs={bfs} rise={rise} />}
        <LabelProjector built={built} data={data} labels={labels} els={props.labelEls} progressRef={variant === 'hero' ? progressRef : undefined} />
      </group>

      {variant === 'hero' ? (
        <HeroRig progressRef={progressRef} fitRef={props.fitRef} built={built} data={data} />
      ) : (
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minDistance={4}
          maxDistance={20}
          maxPolarAngle={Math.PI / 2.25}
          target={[0.3, 0.2, 0.3]}
        />
      )}

      {tier === 'high' && (
        <EffectComposer multisampling={4}>
          <Bloom intensity={0.55} luminanceThreshold={0.72} luminanceSmoothing={0.25} mipmapBlur />
          <Vignette offset={0.25} darkness={0.55} />
        </EffectComposer>
      )}
      <Ready />
    </>
  );
}

export default function HeatMap3D(props: HeatMap3DProps) {
  const built = useMemo(() => buildDistricts(), []);
  const labelEls = useRef<(HTMLDivElement | null)[]>([]);
  const labels = props.labels ?? [];
  // client-only component (loaded with ssr: false), so window is always available here
  const dpr = useMemo(() => Math.min(window.devicePixelRatio || 1, props.tier === 'high' ? 1.75 : 1.25), [props.tier]);
  useEffect(() => () => built.forEach((b) => b.geom.dispose()), [built]);

  return (
    <div className="absolute inset-0">
      <Canvas
        shadows={props.tier === 'high' ? 'percentage' : false}
        dpr={dpr}
        frameloop={props.active === false ? 'never' : 'always'}
        camera={{ position: props.variant === 'hero' ? [0.25, 8.2, 9.6] : [1.4, 9.8, 9.6], fov: 34, near: 0.1, far: 120 }}
        gl={{ antialias: props.tier !== 'high', powerPreference: 'high-performance', alpha: false }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
        onPointerMissed={() => props.onHover?.(null)}
      >
        <Scene {...props} built={built} labelEls={labelEls} />
      </Canvas>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {labels.map((id, i) => (
          <div
            key={id}
            ref={(el) => {
              labelEls.current[i] = el;
            }}
            className="absolute left-0 top-0 whitespace-nowrap rounded-full border border-white/20 bg-[#1a2531]/80 px-2.5 py-1 font-mono text-[11px] text-cloud opacity-0 shadow-lg backdrop-blur will-change-transform"
          >
            <span className="mr-1.5 inline-block size-1.5 rounded-full align-middle" style={{ background: LEVEL_HEX[props.data[id].level] }} />
            {DISTRICTS[id].name} <span className="text-silver">{props.data[id].tmax.toFixed(1)}°</span>
          </div>
        ))}
      </div>
    </div>
  );
}
