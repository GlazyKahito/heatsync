import geo from '@/data/mh-districts.geo.json';

/**
 * Maharashtra district polygons (geoBoundaries ADM2, simplified with shared borders preserved), projected onto a flat
 * plane with an equirectangular projection centred on the state. One projection is shared by the 3D scenes and the
 * SVG maps so a district sits at the same place everywhere.
 */

export const LAT0 = 19.0;
export const LON0 = 76.75;
const COS0 = Math.cos((LAT0 * Math.PI) / 180);

type Ring = [number, number][];
type Polygon = Ring[]; // [outer, ...holes]

interface Feature {
  properties: { id: number; name: string };
  geometry: { type: 'Polygon'; coordinates: Polygon } | { type: 'MultiPolygon'; coordinates: Polygon[] };
}

/** lon/lat → plane units (1 unit ≈ 1 degree of latitude ≈ 111 km). +x east, +y north. */
export const project = (lon: number, lat: number): [number, number] => [(lon - LON0) * COS0, lat - LAT0];

export interface DistrictShape {
  id: number;
  name: string;
  polygons: Polygon[]; // projected
  bbox: [number, number, number, number];
}

function bboxOf(polys: Polygon[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of polys) for (const [x, y] of p[0]) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

let cache: DistrictShape[] | null = null;

export function districtShapes(): DistrictShape[] {
  if (cache) return cache;
  const feats = (geo as unknown as { features: Feature[] }).features;
  cache = feats
    .map((f) => {
      const raw = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      const polygons = raw.map((poly) => poly.map((ring) => ring.map(([lon, lat]) => project(lon, lat))));
      return { id: f.properties.id, name: f.properties.name, polygons, bbox: bboxOf(polygons) };
    })
    .sort((a, b) => a.id - b.id);
  return cache;
}

/** Bounds of the whole state in plane units. */
export function stateBounds() {
  const all = districtShapes();
  return all.reduce(
    (b, d) => [Math.min(b[0], d.bbox[0]), Math.min(b[1], d.bbox[1]), Math.max(b[2], d.bbox[2]), Math.max(b[3], d.bbox[3])] as [number, number, number, number],
    [Infinity, Infinity, -Infinity, -Infinity] as [number, number, number, number],
  );
}

/** SVG path for a district, given a plane→screen mapping (y is flipped so north is up). */
export function svgPath(d: DistrictShape, sx: (x: number) => number, sy: (y: number) => number) {
  return d.polygons
    .map((poly) => poly.map((ring) => `M${ring.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join('L')}Z`).join(''))
    .join('');
}
