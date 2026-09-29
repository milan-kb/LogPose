import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareAtDepth,
  compareProfile,
  makeDataset,
  modelAt,
  representativeTemperature,
  TIMES,
} from "./ocean.ts";

const data = makeDataset();

test("grid indexing preserves time, geographic axes and physical depth", () => {
  for (const [lon, lat, depth, time] of [
    [78, 4, 0, 0],
    [96, 23, 1200, 4],
    [85.5, 13.25, 250, 2],
  ]) {
    assert.ok(
      Math.abs(
        modelAt(data, lon, lat, depth, time)! -
          representativeTemperature(lon, lat, depth, time),
      ) < 0.00001,
    );
  }
  assert.notEqual(modelAt(data, 86, 14, 250, 0), modelAt(data, 86, 14, 250, 4));
  assert.ok(modelAt(data, 86, 14, 0, 0)! > modelAt(data, 86, 14, 1200, 0)!);
});

test("interpolation uses all eight neighbouring values and rejects extrapolation", () => {
  const expected =
    [85, 85.25]
      .flatMap((lon) =>
        [13, 13.25].flatMap((lat) =>
          [200, 225].map((z) => modelAt(data, lon, lat, z, 1)!),
        ),
      )
      .reduce((a, b) => a + b, 0) / 8;
  assert.ok(
    Math.abs(modelAt(data, 85.125, 13.125, 212.5, 1)! - expected) < 1e-8,
  );
  for (const args of [
    [77, 14, 250, 0],
    [85, 24, 250, 0],
    [85, 14, -1, 0],
    [85, 14, 1201, 0],
    [85, 14, 250, 5],
    [85, 14, 250, 0.5],
    [NaN, 14, 250, 0],
  ]) {
    assert.equal(modelAt(data, args[0], args[1], args[2], args[3]), null);
  }
});

test("invalid model cells cannot silently enter comparisons", () => {
  const masked = makeDataset([
    [
      [84.9, 12.9],
      [85.1, 12.9],
      [85.1, 13.1],
      [84.9, 13.1],
    ],
  ]);
  assert.equal(modelAt(masked, 85, 13, 200, 0), null);
  assert.equal(modelAt(masked, 85.125, 13.125, 200, 0), null);
  assert.ok(modelAt(masked, 85.25, 13.25, 200, 0) !== null);
});

test("comparison uses profile time, calculated differences and actual sample counts", () => {
  for (let time = 0; time < TIMES.length; time++) {
    const profile = data.profiles[time][0];
    const result = compareProfile(data, profile);
    assert.equal(profile.time, TIMES[time]);
    assert.equal(result.count, 15);
    const differences = profile.depths.map(
      (depth, i) =>
        modelAt(data, profile.lon, profile.lat, depth, time)! -
        profile.temperatures[i],
    );
    assert.equal(
      result.bias,
      differences.reduce((a, b) => a + b, 0) / differences.length,
    );
    assert.equal(
      result.rmse,
      Math.sqrt(
        differences.reduce((a, b) => a + b * b, 0) / differences.length,
      ),
    );
    assert.ok(result.rmse! >= Math.abs(result.bias!));
  }
  const unavailable = compareProfile(data, {
    ...data.profiles[0][0],
    time: "2000-01-01T00:00:00Z",
  });
  assert.equal(unavailable.count, 0);
  assert.equal(unavailable.bias, null);
  assert.equal(unavailable.rmse, null);
});

test("headline comparison is evaluated at the exact selected depth", () => {
  const profile = data.profiles[0][0];
  const result = compareAtDepth(data, profile, 125);
  assert.equal(result.depth, 125);
  assert.equal(result.model, modelAt(data, profile.lon, profile.lat, 125, 0));
  assert.equal(
    result.observed,
    (profile.temperatures[4] + profile.temperatures[5]) / 2,
  );
  assert.equal(result.difference, result.model! - result.observed!);
  assert.equal(compareAtDepth(data, profile, 1201).observed, null);
});
