"""Acquire one verified GLORYS/Argo case; no synthetic data or upstream browser calls."""
from pathlib import Path
from datetime import datetime, timezone, timedelta
import hashlib
import json
import shutil
import requests
import netCDF4 as nc
import numpy as np
import gsw

ROOT = Path(__file__).resolve().parents[2]
CASE = Path(__file__).resolve().parent
PUBLIC = ROOT / "public/real-case"
ARGO = "https://data-argo.ifremer.fr/dac/csio/2902766/profiles/D2902766_135.nc"
BASE = "https://tds.gdex.ucar.edu/thredds/dodsC/files/d010049/2023/"
DAYS = ["20230915", "20230916", "20230917"]


def attributes(variable):
    return {k: (variable.getncattr(k).decode() if isinstance(variable.getncattr(k), bytes)
                else np.asarray(variable.getncattr(k)).tolist()) for k in variable.ncattrs()}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare():
    for directory in [CASE / "model", CASE / "observations", PUBLIC]:
        directory.mkdir(parents=True, exist_ok=True)
    argo_file = CASE / "observations/D2902766_135.nc"
    if not argo_file.exists():
        response = requests.get(ARGO, timeout=90)
        response.raise_for_status()
        argo_file.write_bytes(response.content)
    a = nc.Dataset(argo_file)
    assert a["DATA_MODE"][0] == b"D"
    assert a["POSITION_QC"][0] == a["JULD_QC"][0] == b"1"
    lat, lon = float(a["LATITUDE"][0]), float(a["LONGITUDE"][0])
    obs_time = nc.num2date(a["JULD"][0], a["JULD"].units)
    stamp = (obs_time + timedelta(microseconds=500000)).strftime("%Y-%m-%dT%H:%M:%SZ")
    # Preserve rejected levels as gaps. This selected profile has no rejected levels.
    values = [np.ma.filled(a[k][0], np.nan).astype(float) for k in
              ["PRES_ADJUSTED", "TEMP_ADJUSTED", "PSAL_ADJUSTED"]]
    p, t, s = values
    good = np.logical_and.reduce([np.isfinite(v) for v in values] +
             [a[k + "_ADJUSTED_QC"][0] == b"1" for k in ["PRES", "TEMP", "PSAL"]])
    assert good.all(), "This fixed case requires all levels QC 1; review changes instead of bridging QC gaps"
    assert np.all(np.diff(p) > 0)
    sa = gsw.SA_from_SP(s, p, lon, lat)
    theta = gsw.pt0_from_t(sa, t, p)
    depths = -gsw.z_from_p(p, lat)  # positive-down metres; dynamic height/geopotential = 0
    profile = dict(id="2902766-135", platform="2902766", name="Argo cycle 135",
                   cycle=135, lat=lat, lon=lon, time=stamp, dataMode="D",
                   depths=depths.tolist(), temperatures=theta.tolist(),
                   pressures=p.tolist(), inSituTemperatures=t.tolist(), practicalSalinities=s.tolist(),
                   qc={k: [v.decode() for v in a[k+"_ADJUSTED_QC"][0]] for k in ["PRES", "TEMP", "PSAL"]},
                   source=ARGO, sourceUpdated=b"".join(a["DATE_UPDATE"][:]).decode(),
                   positionQC="1", timeQC="1")
    matrices, times, sources = [], [], []
    for day in DAYS:
        filename = f"mercatorglorys12v1_gl12_mean_{day}_R20230920.nc"
        subset = CASE / "model" / filename
        url = BASE + filename
        if not subset.exists():
            print("Subsetting", url, flush=True)
            with nc.Dataset(url) as source:
                ys = np.where((source["latitude"][:] >= 10) & (source["latitude"][:] <= 20))[0]
                xs = np.where((source["longitude"][:] >= 82) & (source["longitude"][:] <= 92))[0]
                zs = np.where(source["depth"][:] <= 1246)[0]
                # Server-side native-resolution subset; retain packed scientific samples and attributes.
                source["thetao"].set_auto_maskandscale(False)
                packed = source["thetao"][0:1, :len(zs), ys[0]:ys[-1]+1, xs[0]:xs[-1]+1]
                with nc.Dataset(subset, "w") as dest:
                    dest.setncatts(attributes(source))
                    for name, data in [("time", source["time"][:]), ("depth", source["depth"][zs]),
                                       ("latitude", source["latitude"][ys]), ("longitude", source["longitude"][xs])]:
                        dest.createDimension(name, len(data))
                        v = dest.createVariable(name, "f4", (name,))
                        v.setncatts(attributes(source[name])); v[:] = data
                    attrs = attributes(source["thetao"])
                    v = dest.createVariable("thetao", "i2", ("time", "depth", "latitude", "longitude"),
                                            fill_value=attrs.pop("_FillValue"), zlib=True)
                    v.setncatts(attrs); v.set_auto_maskandscale(False); v[:] = packed
        with nc.Dataset(subset) as m:
            assert m["thetao"].standard_name == "sea_water_potential_temperature"
            assert m["depth"].positive == "down"
            axes = {k: m[k][:].astype(float).tolist() for k in ["longitude", "latitude", "depth"]}
            assert all(np.all(np.diff(axis) > 0) for axis in axes.values())
            assert axes["longitude"][0] <= lon <= axes["longitude"][-1]
            assert axes["latitude"][0] <= lat <= axes["latitude"][-1]
            date = nc.num2date(m["time"][0], m["time"].units)
            assert date.strftime("%Y%m%d") == day and date.hour == 12
            times.append(date.strftime("%Y-%m-%dT%H:%M:%SZ"))
            matrices.append(np.ma.filled(m["thetao"][:], np.nan).astype("<f4"))
            sources.append(dict(url=url, file=str(subset.relative_to(CASE)), sha256=sha(subset),
                                attributes=attributes(m), variables={k: attributes(m[k]) for k in m.variables}))
    field = np.concatenate(matrices, axis=0)
    assert field.shape == (3, 37, 121, 121), field.shape
    assert times[0][:10] == stamp[:10]
    field.tofile(PUBLIC / "temperature.f32")
    metadata = dict(id="glorys12-argo-2902766-20230915", times=times,
                    latitudes=axes["latitude"], longitudes=axes["longitude"], depths=axes["depth"],
                    profiles=[[profile], [], []], source="Copernicus GLORYS12V1 + Argo GDAC",
                    binary="temperature.f32", shape=list(field.shape), units="degree_Celsius",
                    temperatureDefinition="Potential temperature referenced to 0 dbar (ITS-90)")
    (PUBLIC / "case.json").write_text(json.dumps(metadata, indent=2, allow_nan=False) + "\n")
    manifest = dict(case=metadata["id"], acquiredUTC=datetime.now(timezone.utc).isoformat(),
                    product="GLOBAL_MULTIYEAR_PHY_001_030", version="GLORYS12V1",
                    catalogueDataset="cmems_mod_glo_phy_my_0.083deg_P1D-m, catalogue version 202311",
                    modelDOI="10.48670/moi-00021", mirrorDOI="10.5065/3NSD-QP06",
                    modelFiles=sources,
                    argo=dict(url=ARGO, sha256=sha(argo_file), attributes=attributes(a),
                              variables={k: attributes(a[k]) for k in a.variables}, profile=profile["id"]),
                    processing=dict(netcdf=nc.__version__, numpy=np.__version__, gsw=gsw.__version__,
                                    pressureToDepth="-gsw.z_from_p(PRES_ADJUSTED, latitude), dynamic height/geopotential 0",
                                    temperature="gsw.SA_from_SP(PSAL_ADJUSTED,p,lon,lat); gsw.pt0_from_t(SA,TEMP_ADJUSTED,p)",
                                    qc="Delayed mode only; adjusted PRES/TEMP/PSAL, position and time QC=1; no rejected gaps",
                                    time="Daily mean UTC midnight-to-midnight, labelled at noon; match profile's UTC day, no time interpolation",
                                    spatial="Bilinear native 1/12 degree rectilinear grid; all nonzero-weight corners must be valid",
                                    vertical="Linear on native physical model levels and observed converted depths; no extrapolation; observed gaps >100 m rejected",
                                    scientific="Native grid Float32 decoded from packed NetCDF; no spatial/depth downsampling for comparisons",
                                    display="Existing renderer samples the scientific array; never used for comparisons"),
                    caveats=["Reanalysis assimilates in-situ T/S profiles; independence is not established.",
                             "Daily mean vs instantaneous profile; temporal representativeness error is not quantified.",
                             "Fixed local historical subset; no live services or general NetCDF uploader.",
                             "Salinity is used only for thermodynamic conversion, not displayed."],
                    files={f.name: dict(bytes=f.stat().st_size, sha256=sha(f)) for f in
                           [PUBLIC/"temperature.f32", PUBLIC/"case.json"]})
    (CASE / "manifest.json").write_text(json.dumps(manifest, indent=2, allow_nan=False) + "\n")
    shutil.copyfile(CASE / "manifest.json", PUBLIC / "manifest.json")
    print("Prepared", field.shape, "bytes", field.nbytes, "profile", stamp, lat, lon)


if __name__ == "__main__":
    prepare()
