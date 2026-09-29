export const REGION = {
  west: 78,
  east: 96,
  south: 4,
  north: 23,
  maxDepth: 1200,
};
export const DEPTHS = [
  0, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 650, 800, 1000, 1200,
];
export const TIMES = Array.from(
  { length: 5 },
  (_, i) => `2024-09-${15 + i}T12:00:00Z`,
);
export const PALETTE = [
  "#263d89",
  "#246ca9",
  "#2898bc",
  "#49c5be",
  "#acd9a4",
  "#e9dc79",
  "#f1a15f",
  "#d86750",
];
export type Point = [number, number];
export interface CoastFeature {
  properties: { name: string };
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
}
export interface Profile {
  id: string;
  platform: string;
  name: string;
  lat: number;
  lon: number;
  time: string;
  depths: number[];
  temperatures: number[];
}
export interface OceanData {
  id: string;
  times: string[];
  latitudes: number[];
  longitudes: number[];
  depths: number[];
  temperatures: Float32Array;
  profiles: Profile[][];
  land: Point[][];
  source: string;
}

const PLATFORMS = [
  { id: "LP-01", name: "Bengal central", lat: 14.2, lon: 87.5 },
  { id: "LP-02", name: "Sri Lanka east", lat: 8.8, lon: 83.4 },
  { id: "LP-03", name: "Andaman basin", lat: 12.3, lon: 92.0 },
  { id: "LP-04", name: "Northern bay", lat: 18.0, lon: 89.3 },
  { id: "LP-05", name: "Southern bay", lat: 6.5, lon: 88.2 },
];

// Deterministic representative field: a thermocline and two moving mesoscale features.
// This is synthetic data, not a numerical ocean forecast or an observation product.
export function representativeTemperature(
  lon: number,
  lat: number,
  depth: number,
  time: number,
) {
  const warm = Math.exp(
    -((lon - (85.4 + time * 0.55)) ** 2 / 10 + (lat - 13.2) ** 2 / 16),
  );
  const cold = Math.exp(
    -((lon - 91) ** 2 / 7 + (lat - (16.5 - time * 0.35)) ** 2 / 10),
  );
  const thermocline =
    175 +
    140 * warm -
    90 * cold +
    20 * Math.sin(lon * 0.65 + lat * 0.35 + time * 0.55);
  const surface =
    28.6 - 0.09 * (lat - 4) + 0.55 * Math.sin(lon * 0.45 + time * 0.6);
  return (
    4.3 +
    5.1 * Math.exp(-depth / 650) +
    (surface - 9.4) / (1 + Math.exp((depth - thermocline) / 72))
  );
}

export function inRing(lon: number, lat: number, ring: Point[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}

export function makeDataset(land: Point[][] = []): OceanData {
  const longitudes = Array.from(
    { length: 73 },
    (_, i) => REGION.west + i * 0.25,
  );
  const latitudes = Array.from(
    { length: 77 },
    (_, i) => REGION.south + i * 0.25,
  );
  const depths = Array.from({ length: 49 }, (_, i) => i * 25);
  const temperatures = new Float32Array(
    TIMES.length * depths.length * latitudes.length * longitudes.length,
  );
  const wet = latitudes.flatMap((lat) =>
    longitudes.map((lon) => !land.some((ring) => inRing(lon, lat, ring))),
  );
  let index = 0;
  for (let t = 0; t < TIMES.length; t++)
    for (const depth of depths)
      for (let y = 0; y < latitudes.length; y++)
        for (let x = 0; x < longitudes.length; x++) {
          temperatures[index++] = wet[y * longitudes.length + x]
            ? representativeTemperature(longitudes[x], latitudes[y], depth, t)
            : NaN;
        }
  const profiles = TIMES.map((time, t) =>
    PLATFORMS.map((p, i) => {
      const lon = p.lon + 0.035 * t,
        lat = p.lat + 0.025 * t;
      return {
        id: `${p.id}-${time.slice(0, 10)}`,
        platform: p.id,
        name: p.name,
        lat,
        lon,
        time,
        depths: DEPTHS,
        temperatures: DEPTHS.map(
          (z) =>
            representativeTemperature(lon, lat, z, t) +
            (0.35 + i * 0.1) * Math.sin(z / 170 + i * 0.8 + t * 0.35) +
            0.3 * Math.exp(-(((z - 200) / 110) ** 2)),
        ),
      };
    }),
  );
  return {
    id: "log-pose-bay-demo-v1",
    times: TIMES,
    latitudes,
    longitudes,
    depths,
    temperatures,
    profiles,
    land,
    source: "Deterministic representative field · not live or measured data",
  };
}

export async function loadOceanData(): Promise<OceanData> {
  const response = await fetch("/coastline.geojson");
  if (!response.ok)
    throw new Error(
      "The local geographic dataset could not be loaded. Please reload the workspace.",
    );
  const geo = (await response.json()) as { features: CoastFeature[] };
  // Natural Earth exterior rings. This regional overview does not resolve coastal bathymetry.
  const land = geo.features.flatMap((f) =>
    f.geometry.type === "Polygon"
      ? [(f.geometry.coordinates as number[][][])[0] as Point[]]
      : (f.geometry.coordinates as number[][][][]).map((p) => p[0] as Point[]),
  );
  return makeDataset(land);
}

export function modelAt(
  data: OceanData,
  lon: number,
  lat: number,
  depth: number,
  time: number,
): number | null {
  if (
    !Number.isInteger(time) ||
    time < 0 ||
    time >= data.times.length ||
    ![lon, lat, depth].every(Number.isFinite) ||
    lon < REGION.west ||
    lon > REGION.east ||
    lat < REGION.south ||
    lat > REGION.north ||
    depth < 0 ||
    depth > REGION.maxDepth
  )
    return null;
  const coordinate = (
    value: number,
    start: number,
    step: number,
    count: number,
  ) => {
    const position = (value - start) / step,
      lower = Math.min(Math.floor(position), count - 2);
    return [lower, position - lower];
  };
  const [x, fx] = coordinate(lon, REGION.west, 0.25, data.longitudes.length);
  const [y, fy] = coordinate(lat, REGION.south, 0.25, data.latitudes.length);
  const [z, fz] = coordinate(depth, 0, 25, data.depths.length);
  let value = 0;
  for (let dz = 0; dz <= 1; dz++)
    for (let dy = 0; dy <= 1; dy++)
      for (let dx = 0; dx <= 1; dx++) {
        const weight =
          (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
        if (weight === 0) continue;
        const sample =
          data.temperatures[
            ((time * data.depths.length + z + dz) * data.latitudes.length +
              y +
              dy) *
              data.longitudes.length +
              x +
              dx
          ];
        if (!Number.isFinite(sample)) return null;
        value += sample * weight;
      }
  return value;
}

export function compareProfile(data: OceanData, profile: Profile) {
  const time = data.times.indexOf(profile.time);
  const samples = profile.depths.map((depth, i) => {
    const model = modelAt(data, profile.lon, profile.lat, depth, time),
      observed = profile.temperatures[i];
    return {
      depth,
      model,
      observed,
      difference:
        model === null || !Number.isFinite(observed) ? null : model - observed,
    };
  });
  const valid = samples.filter((s) => s.difference !== null);
  return {
    samples,
    count: valid.length,
    bias: valid.length
      ? valid.reduce((a, s) => a + s.difference!, 0) / valid.length
      : null,
    rmse: valid.length
      ? Math.sqrt(
          valid.reduce((a, s) => a + s.difference! ** 2, 0) / valid.length,
        )
      : null,
  };
}

export function compareAtDepth(
  data: OceanData,
  profile: Profile,
  depth: number,
) {
  const time = data.times.indexOf(profile.time);
  const model = modelAt(data, profile.lon, profile.lat, depth, time);
  if (
    model === null ||
    depth < profile.depths[0] ||
    depth > profile.depths.at(-1)!
  )
    return { depth, model, observed: null, difference: null };
  const upper = profile.depths.findIndex((value) => value >= depth);
  if (upper === 0) {
    const observed = profile.temperatures[0];
    return { depth, model, observed, difference: model - observed };
  }
  const lower = upper - 1;
  const fraction =
    (depth - profile.depths[lower]) /
    (profile.depths[upper] - profile.depths[lower]);
  const observed =
    profile.temperatures[lower] * (1 - fraction) +
    profile.temperatures[upper] * fraction;
  return { depth, model, observed, difference: model - observed };
}

export function colourFor(value: number): [number, number, number] {
  const n = Math.max(0, Math.min(1, (value - 4) / 26)) * (PALETTE.length - 1);
  const a = Math.floor(n),
    b = Math.min(a + 1, PALETTE.length - 1),
    f = n - a;
  const rgb = (hex: string) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return rgb(PALETTE[a]).map((v, i) => v + (rgb(PALETTE[b])[i] - v) * f) as [
    number,
    number,
    number,
  ];
}

export const formatDate = (time: string) =>
  new Date(time).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
