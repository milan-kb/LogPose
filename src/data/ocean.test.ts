import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareAtDepth, compareProfile, matchProfile, modelAt, observedAt, validateCase } from "./ocean.ts";
import type { OceanData } from "./ocean.ts";

const meta = JSON.parse(readFileSync("public/real-case/case.json", "utf8"));
const bytes = readFileSync("public/real-case/temperature.f32");
const temperatures = new Float32Array(bytes.length / 4);
for (let i = 0; i < temperatures.length; i++) temperatures[i] = bytes.readFloatLE(i * 4);
const data: OceanData = validateCase({ ...meta, temperatures, land: [] });
const profile = data.profiles[0][0];
const fixture = JSON.parse(readFileSync("data/real-case/verification.json", "utf8"));
const close = (a: number | null, b: number, tolerance = 0.000003) => {
  assert.notEqual(a, null);
  assert.ok(Math.abs(a! - b) < tolerance, `${a} != ${b}`);
};

test("native scientific grid agrees with independently decoded NetCDF source nodes", () => {
  assert.deepEqual([data.times.length, data.depths.length, data.latitudes.length, data.longitudes.length], [3, 37, 121, 121]);
  for (const node of fixture.nodes) close(modelAt(data, node.lon, node.lat, node.depth, node.time), node.value);
  assert.ok(data.depths[0] > 0 && data.depths.at(-1)! > 1200);
  assert.notEqual(data.depths[2] - data.depths[1], data.depths[1] - data.depths[0]);
  assert.ok(modelAt(data, 88, 15, 25, 0)! > modelAt(data, 88, 15, 1200, 0)!);
});

test("real model and converted Argo values match independent source-derived comparisons", () => {
  assert.equal(profile.id, fixture.profile);
  assert.equal(profile.time, "2023-09-15T21:32:52Z");
  assert.equal(profile.depths.length, 102);
  for (const expected of fixture.comparisons) {
    const actual = compareAtDepth(data, profile, expected.depth);
    close(actual.model, expected.model);
    close(actual.observed, expected.observed, 1e-10);
    close(actual.difference, expected.difference);
    assert.equal(actual.difference, actual.model! - actual.observed!);
  }
});

test("daily mean matching preserves observation timestamp and rejects other days/outside positions", () => {
  const match = matchProfile(data, profile);
  assert.equal(match.modelTime, fixture.modelTime);
  close(match.offsetHours, fixture.offsetHours, 1e-10);
  assert.equal(match.timeIndex, 0);
  assert.equal(matchProfile(data, { ...profile, time: "2023-09-16T00:00:00Z" }).timeIndex, 1);
  assert.equal(matchProfile(data, { ...profile, time: "2023-09-18T00:00:00Z" }).timeIndex, -1);
  assert.equal(matchProfile(data, { ...profile, lon: 81 }).timeIndex, -1);
  assert.deepEqual(data.profiles.slice(1), [[], []]);
});

test("interpolation respects nonuniform axes and invalid corners without extrapolation", () => {
  const grid: OceanData = { ...data, times: [data.times[0]], depths: [1, 100], latitudes: [10, 12], longitudes: [82, 85],
    temperatures: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]) };
  close(modelAt(grid, 83.5, 11, 50.5, 0), 4.5);
  grid.temperatures[7] = NaN;
  assert.equal(modelAt(grid, 83.5, 11, 50.5, 0), null);
  assert.equal(modelAt(grid, 82, 10, 1, 0), 1);
  for (const [lon, lat, z, t] of [[81, 15, 250, 0], [88, 21, 250, 0], [88, 15, 0, 0], [88, 15, 1300, 0],
    [88, 15, 250, 3], [88, 15, 250, 0.5], [NaN, 15, 250, 0]]) assert.equal(modelAt(data, lon, lat, z, t), null);
});

test("observation gaps and unsupported shallow depths cannot produce fabricated comparisons", () => {
  assert.equal(compareAtDepth(data, profile, 0).difference, null);
  assert.equal(observedAt(profile, 3000), null);
  assert.equal(observedAt({ ...profile, depths: [1, 150], temperatures: [28, 15] }, 25), null);
  assert.equal(observedAt({ ...profile, depths: [1, 25], temperatures: [NaN, 15] }, 10), null);
  assert.throws(() => validateCase({ ...data, profiles: [[{ ...profile, qc: { ...profile.qc, TEMP: ["4"] } }], [], []] }));
  assert.throws(() => validateCase({ ...data, temperatures: new Float32Array(2) }));
});

test("summary metrics count only valid pairs inside the displayed water column", () => {
  const comparison = compareProfile(data, profile);
  const valid = comparison.samples.filter(s => s.difference !== null);
  assert.ok(valid.length > 50 && valid.length < 102);
  assert.ok(comparison.samples.every(s => s.depth <= 1200));
  close(comparison.bias, valid.reduce((sum, s) => sum + s.difference!, 0) / valid.length);
  close(comparison.rmse, Math.sqrt(valid.reduce((sum, s) => sum + s.difference! ** 2, 0) / valid.length));
  assert.equal(compareProfile(data, { ...profile, time: "2000-01-01T00:00:00Z" }).count, 0);
});
