"""Offline verification against retained NetCDF sources; emits independent TS test fixtures."""
import json
import hashlib
from datetime import timedelta
from pathlib import Path
import numpy as np
import netCDF4 as nc
import gsw

CASE = Path(__file__).resolve().parent
PUBLIC = CASE.parents[1] / "public/real-case"
meta = json.loads((PUBLIC / "case.json").read_text())
manifest = json.loads((CASE / "manifest.json").read_text())
field = np.fromfile(PUBLIC / "temperature.f32", dtype="<f4").reshape(meta["shape"])
for name, info in manifest["files"].items():
    assert hashlib.sha256((PUBLIC/name).read_bytes()).hexdigest() == info["sha256"]
for i, info in enumerate(manifest["modelFiles"]):
    path = CASE / info["file"]
    assert hashlib.sha256(path.read_bytes()).hexdigest() == info["sha256"]
    with nc.Dataset(path) as m:
        raw = np.ma.filled(m["thetao"][:], np.nan)[0]
        np.testing.assert_array_equal(field[i], raw.astype("<f4"))
        for name, key in [("depth", "depths"), ("latitude", "latitudes"), ("longitude", "longitudes")]:
            np.testing.assert_array_equal(m[name][:], meta[key])
        assert m["thetao"].dimensions == ("time", "depth", "latitude", "longitude")
        assert m["depth"].positive == "down" and m["depth"].units == "m"
        assert m["thetao"].standard_name == "sea_water_potential_temperature"
        assert m["thetao"].units == "degrees_C"
        assert nc.num2date(m["time"][0], m["time"].units).strftime("%Y-%m-%dT%H:%M:%SZ") == meta["times"][i]

profile = meta["profiles"][0][0]
path = CASE / "observations/D2902766_135.nc"
assert hashlib.sha256(path.read_bytes()).hexdigest() == manifest["argo"]["sha256"]
with nc.Dataset(path) as a:
    assert a["DATA_MODE"][0] == b"D"
    assert a["POSITION_QC"][0] == a["JULD_QC"][0] == b"1"
    stamp = nc.num2date(a["JULD"][0], a["JULD"].units) + timedelta(microseconds=500000)
    assert stamp.strftime("%Y-%m-%dT%H:%M:%SZ") == profile["time"]
    assert float(a["LATITUDE"][0]) == profile["lat"] and float(a["LONGITUDE"][0]) == profile["lon"]
    assert int(a["CYCLE_NUMBER"][0]) == profile["cycle"]
    p, t, s = [np.asarray(a[k+"_ADJUSTED"][0], dtype=float) for k in ["PRES", "TEMP", "PSAL"]]
    for k in ["PRES", "TEMP", "PSAL"]:
        assert (a[k+"_ADJUSTED_QC"][0] == b"1").all()
        assert profile["qc"][k] == ["1"] * len(p)
    z = -gsw.z_from_p(p, profile["lat"])
    theta = gsw.pt0_from_t(gsw.SA_from_SP(s, p, profile["lon"], profile["lat"]), t, p)
    np.testing.assert_allclose(profile["depths"], z, rtol=0, atol=1e-12)
    np.testing.assert_allclose(profile["temperatures"], theta, rtol=0, atol=1e-12)
    assert np.max(np.diff(z)) < 100

# Independent horizontal interpolation via numpy, then vertical interpolation on native levels.
xs, ys, zs = [np.asarray(meta[k]) for k in ["longitudes", "latitudes", "depths"]]
xi, yi = np.searchsorted(xs, profile["lon"])-1, np.searchsorted(ys, profile["lat"])-1
with nc.Dataset(CASE / manifest["modelFiles"][0]["file"]) as m:
    source = m["thetao"][0, :, yi:yi+2, xi:xi+2]
    assert not np.ma.getmaskarray(source).any()
    column = np.array([np.interp(profile["lat"], ys[yi:yi+2],
                      [np.interp(profile["lon"], xs[xi:xi+2], row) for row in layer]) for layer in source])
checks = []
for depth in [1, 25, 100, 225, 250, 600, 1200]:
    model, observed = float(np.interp(depth, zs, column)), float(np.interp(depth, z, theta))
    checks.append(dict(depth=depth, model=model, observed=observed, difference=model-observed))
nodes = []
for ti, zi, y, x in [(0, 0, 60, 60), (1, 20, 42, 82), (2, 36, 70, 100)]:
    with nc.Dataset(CASE / manifest["modelFiles"][ti]["file"]) as m:
        nodes.append(dict(time=ti, depth=float(zs[zi]), lat=float(ys[y]), lon=float(xs[x]), value=float(m["thetao"][0, zi, y, x])))
fixture = dict(profile=profile["id"], nodes=nodes, comparisons=checks,
               observationTime=profile["time"], modelTime=meta["times"][0],
               offsetHours=9 + 32/60 + 52/3600)
(CASE / "verification.json").write_text(json.dumps(fixture, indent=2) + "\n")
print(json.dumps(fixture, indent=2))
print("PASS: source checksums, all model samples/axes/units/times, adjusted QC and thermodynamic conversions")
