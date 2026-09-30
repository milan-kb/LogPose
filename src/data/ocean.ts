// Fixed, attributable local case. No synthetic fallback or upstream browser requests.
export const REGION = { west: 82, east: 92, south: 10, north: 20, maxDepth: 1200 };
export const PALETTE = ["#263d89", "#246ca9", "#2898bc", "#49c5be", "#acd9a4", "#e9dc79", "#f1a15f", "#d86750"];
export type Point = [number, number];
export interface CoastFeature {
  properties: { name: string };
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
}
export interface Profile {
  id: string;
  platform: string;
  name: string;
  cycle: number;
  lat: number;
  lon: number;
  time: string;
  depths: number[];
  temperatures: number[];
  dataMode: string;
  source: string;
  qc: Record<string, string[]>;
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

export function validateCase(data: OceanData) {
  for (const axis of [data.latitudes, data.longitudes, data.depths]) {
    if (!Array.isArray(axis) || axis.length < 2 || axis.some((v, i) =>
      !Number.isFinite(v) || (i > 0 && v <= axis[i - 1]))) throw new Error("Invalid scientific coordinate axis.");
  }
  if (!data.times.length || data.times.some((t, i) => !Number.isFinite(Date.parse(t)) ||
      (i > 0 && Date.parse(t) - Date.parse(data.times[i - 1]) !== 86400000)))
    throw new Error("Invalid daily model times.");
  if (data.temperatures.length !== data.times.length * data.depths.length * data.latitudes.length * data.longitudes.length ||
      data.profiles.length !== data.times.length) throw new Error("Incomplete local scientific array.");
  for (const [day, profiles] of data.profiles.entries()) for (const p of profiles) {
    if (p.dataMode !== "D" || !p.depths.length || p.depths.length !== p.temperatures.length ||
        p.depths.some((z, i) => !Number.isFinite(z) || (i > 0 && z <= p.depths[i - 1])) ||
        p.temperatures.some(t => !Number.isFinite(t)) ||
        ["PRES", "TEMP", "PSAL"].some(k => p.qc[k]?.length !== p.depths.length || p.qc[k].some(q => q !== "1")) ||
        matchProfile(data, p).timeIndex !== day) throw new Error("Invalid local Argo profile or match.");
  }
  return data;
}

export async function loadOceanData(): Promise<OceanData> {
  const urls = ["/real-case/case.json", "/real-case/temperature.f32", "/coastline.geojson"];
  const responses = await Promise.all(urls.map(url => fetch(url)));
  if (responses.some(r => !r.ok)) throw new Error("The local real-data case could not be loaded. Please reload the workspace.");
  const [meta, bytes, geo] = await Promise.all([
    responses[0].json(), responses[1].arrayBuffer(), responses[2].json(),
  ]);
  if (bytes.byteLength % 4) throw new Error("Corrupt local temperature array.");
  const view = new DataView(bytes);
  const temperatures = new Float32Array(bytes.byteLength / 4);
  for (let i = 0; i < temperatures.length; i++) temperatures[i] = view.getFloat32(i * 4, true);
  const land = (geo.features as CoastFeature[]).flatMap(f => f.geometry.type === "Polygon"
    ? [(f.geometry.coordinates as number[][][])[0] as Point[]]
    : (f.geometry.coordinates as number[][][][]).map(p => p[0] as Point[]));
  return validateCase({ ...meta, temperatures, land });
}

// Bracket actual native coordinates, including nonuniform model depth levels.
function bracket(axis: number[], value: number): [number, number] | null {
  if (!Number.isFinite(value) || value < axis[0] || value > axis.at(-1)!) return null;
  let lo = 0, hi = axis.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (axis[mid] <= value) lo = mid;
    else hi = mid;
  }
  return [lo, (value - axis[lo]) / (axis[hi] - axis[lo])];
}

export function modelAt(data: OceanData, lon: number, lat: number, depth: number, time: number): number | null {
  if (!Number.isInteger(time) || time < 0 || time >= data.times.length) return null;
  const bx = bracket(data.longitudes, lon), by = bracket(data.latitudes, lat), bz = bracket(data.depths, depth);
  if (!bx || !by || !bz) return null;
  const [x, fx] = bx, [y, fy] = by, [z, fz] = bz;
  let value = 0;
  for (let dz = 0; dz <= 1; dz++) for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
    const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
    if (weight === 0) continue;
    const sample = data.temperatures[((time * data.depths.length + z + dz) * data.latitudes.length + y + dy) * data.longitudes.length + x + dx];
    if (!Number.isFinite(sample)) return null;
    value += sample * weight;
  }
  return value;
}

export function matchProfile(data: OceanData, profile: Profile) {
  const observation = Date.parse(profile.time);
  const inside = !!bracket(data.longitudes, profile.lon) && !!bracket(data.latitudes, profile.lat);
  const timeIndex = inside ? data.times.findIndex(t => {
    const centre = Date.parse(t);
    return observation >= centre - 43200000 && observation < centre + 43200000;
  }) : -1;
  return { timeIndex, modelTime: timeIndex < 0 ? null : data.times[timeIndex],
    offsetHours: timeIndex < 0 ? null : (observation - Date.parse(data.times[timeIndex])) / 3600000,
    rule: "Observation UTC day → daily mean (00:00–24:00 UTC)" };
}

export function observedAt(profile: Profile, depth: number): number | null {
  const pair = bracket(profile.depths, depth);
  if (!pair) return null;
  const [lo, f] = pair;
  if (f === 0) return Number.isFinite(profile.temperatures[lo]) ? profile.temperatures[lo] : null;
  if (f === 1) return Number.isFinite(profile.temperatures[lo + 1]) ? profile.temperatures[lo + 1] : null;
  // ponytail: 100 m gap ceiling is appropriate for this inspected profile; review per source before adding cases.
  if (profile.depths[lo + 1] - profile.depths[lo] > 100 ||
      !Number.isFinite(profile.temperatures[lo]) || !Number.isFinite(profile.temperatures[lo + 1])) return null;
  return profile.temperatures[lo] * (1 - f) + profile.temperatures[lo + 1] * f;
}

export function compareAtDepth(data: OceanData, profile: Profile, depth: number) {
  const match = matchProfile(data, profile);
  const model = modelAt(data, profile.lon, profile.lat, depth, match.timeIndex);
  const observed = observedAt(profile, depth);
  return { depth, model, observed, difference: model === null || observed === null ? null : model - observed, match };
}

export function compareProfile(data: OceanData, profile: Profile) {
  const samples = profile.depths.filter(d => d <= REGION.maxDepth).map(depth => compareAtDepth(data, profile, depth));
  const valid = samples.filter(s => s.difference !== null);
  return { samples, count: valid.length,
    bias: valid.length ? valid.reduce((a, s) => a + s.difference!, 0) / valid.length : null,
    rmse: valid.length ? Math.sqrt(valid.reduce((a, s) => a + s.difference! ** 2, 0) / valid.length) : null };
}

export function colourFor(value: number): [number, number, number] {
  const n = Math.max(0, Math.min(1, (value - 4) / 26)) * (PALETTE.length - 1);
  const a = Math.floor(n), b = Math.min(a + 1, PALETTE.length - 1), f = n - a;
  const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return rgb(PALETTE[a]).map((v, i) => v + (rgb(PALETTE[b])[i] - v) * f) as [number, number, number];
}
export const formatDate = (time: string) => new Date(time).toLocaleDateString("en-GB", {
  day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
});
export const formatTimestamp = (time: string) => `${formatDate(time)} ${new Date(time).toISOString().slice(11, 19)} UTC`;
