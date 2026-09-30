# One real Bay of Bengal case

## Source discovery and selection

Sources were checked before selecting the region:

- [Copernicus product](https://data.marine.copernicus.eu/product/GLOBAL_MULTIYEAR_PHY_001_030/description), DOI **10.48670/moi-00021**.
- [Current STAC dataset](https://stac.marine.copernicus.eu/metadata/GLOBAL_MULTIYEAR_PHY_001_030/cmems_mod_glo_phy_my_0.083deg_P1D-m_202311/dataset.stac.json): catalogue version `202311`. This is discovery metadata, not a claim that the NCAR mirror files were downloaded from that Zarr store.
- [NCAR GDEX mirror](https://gdex.ucar.edu/datasets/d010049/), DOI **10.5065/3NSD-QP06**, with openly accessible [2023 THREDDS catalogue](https://tds.gdex.ucar.edu/thredds/catalog/files/d010049/2023/catalog.html).
- [Argo GDAC access guidance](https://argo.ucsd.edu/data/data-from-gdacs/) and [profile index](https://data-argo.ifremer.fr/ar_index_global_prof.txt.gz), screened for Indian Ocean delayed-mode profiles in September 2023.
- Selected [D2902766_135.nc](https://data-argo.ifremer.fr/dac/csio/2902766/profiles/D2902766_135.nc), Argo DOI **10.17882/42182**.

Rejected candidate `incois/1902669/profiles/D1902669_001.nc`: only one pressure sample, adjusted TEMP/PSAL missing and QC 4. The selected CSIO profile has 102 usable adjusted samples with QC 1. Geographic bounds were selected around this verified overlapping profile, not an invented observation.

## Inspected model

| Property | Value |
|---|---|
| Product/model | Global Ocean Physics Reanalysis / GLORYS12V1 |
| Origin | Mercator Ocean International / Copernicus Marine |
| Acquisition | NCAR GDEX `d010049`, OPeNDAP native-resolution subset |
| Files | `mercatorglorys12v1_gl12_mean_20230915_R20230920.nc` through `...20230917_R20230920.nc` |
| Source processing | `MERCATOR GLORYS12V1`; NetCDF creation history `2023/12/01 08:50:26` for 15 Sept; exact attributes for each file in manifest |
| Grid | Rectilinear published grid, approximately 1/12°, not the original native NEMO staggered C-grid |
| Axes | `time, depth, latitude, longitude`; longitudes east-positive −180…180; latitude south-to-north |
| Local extent | 82…92° E, 10…20° N; 121×121 horizontal points |
| Depth | `depth`, metres, positive down; 37 nonuniform retained levels 0.494025…1245.291 m |
| Temperature | `thetao`; CF `sea_water_potential_temperature`; degrees_C, potential temperature referenced to surface pressure |
| Time | Hours since 1950-01-01, Gregorian; daily UTC means labelled at 12:00 |
| Packing | int16; `_FillValue=-32767`; add_offset=21; scale_factor=0.0007324442267417908; source valid_min/max retained |
| Missing data | NetCDF mask/scale decoding; masked cells become NaN, never zero |

The source files contain legacy `title`/`bulletin_type` strings referring to analysis/forecast/operational. Product identity is established by the catalogued GLORYS reanalysis and `source=MERCATOR GLORYS12V1`; the application does not promote those legacy strings into an operational/live claim.

Daily temporal semantics are documented in the [product manual](https://documentation.marine.copernicus.eu/PUM/CMEMS-GLO-PUM-001-030.pdf): midnight-to-midnight mean centred at noon. This matters because STAC field-date metadata can appear at midnight; actual downloaded NetCDF time coordinates are decoded and verified at noon.

## Inspected Argo

WMO **2902766**, cycle **135**, CSIO DAC, mode **D**, position **15.105° N, 87.882° E**, **2023-09-15T21:32:52Z** (NetCDF floating-day representation rounded to nearest second).

- `JULD`: days since 1950-01-01 00:00:00 UTC; `JULD_QC=1`, `POSITION_QC=1`.
- `PRES_ADJUSTED`: sea pressure (0 at sea level), dbar.
- `TEMP_ADJUSTED`: in-situ sea temperature, ITS-90 °C, **not directly thetao**.
- `PSAL_ADJUSTED`: practical salinity, needed only for thermodynamic conversion.
- Raw and adjusted PRES/TEMP/PSAL variables, errors, QC and calibration/history records are retained in the original complete NetCDF file. This case uses adjusted values only; no raw fallback.
- All 102 adjusted samples have PRES/TEMP/PSAL QC 1. Their converted depth range is approximately 0.398–1958.357 m. The complete arrays and QC flags are preserved in `case.json`; the UI plots the first 1,200 m.
- Original global/variable attributes and SHA-256 are in `manifest.json`.

## Normalization and matching

1. Confirm position inside actual model coordinate bounds.
2. Match the observation to its containing UTC daily-mean interval `[00:00,24:00)`. Retain both timestamps; the observation is 9.547778 hours after noon. No time interpolation.
3. Use `gsw.SA_from_SP` with adjusted salinity, pressure and location; convert measured in-situ temperature using `gsw.pt0_from_t`. Convert sea pressure with `-gsw.z_from_p(p,lat)` (zero dynamic-height/geopotential correction).
4. Sample native-resolution model data with bilinear horizontal and linear physical-depth interpolation. Actual coordinate arrays are bracketed, not nominal fixed spacings. Every nonzero-weight corner must be valid.
5. Interpolate the converted Argo profile linearly only between valid adjacent depths; never extrapolate or bridge gaps exceeding 100 m. Preparation rejects a changed source profile with QC gaps rather than silently removing levels and connecting across them.
6. Difference = model − observed, calculated before display rounding. Mean difference/RMSE use valid, equally weighted paired observation depths ≤1,200 m; not depth-integrated statistics.

Pressure-to-depth is latitude dependent, not `1 dbar = 1 m`. The conversion uses GSW/TEOS-10; small equation-of-state differences from model thermodynamics and neglected dynamic-height effects are not quantified. The observation is instantaneous while the model is a daily mean. GLORYS assimilates in-situ profiles: independence is **not** established.

## Reproduce

Python is needed only for preparation/verification, not running the application.

```sh
python3 -m venv /tmp/opencode/ocean-venv
/tmp/opencode/ocean-venv/bin/pip install -r data/real-case/requirements.txt
/tmp/opencode/ocean-venv/bin/python data/real-case/prepare.py
/tmp/opencode/ocean-venv/bin/python data/real-case/verify.py
npm test
```

`prepare.py` reuses the retained local scientific inputs. If absent, it acquires the explicit single-profile URL and three bounded OPeNDAP subsets (without downloading multi-gigabyte global files). No credentials are required on the verified mirror. A future upstream revision can change checksums: retain the original manifest when reviewing new downloads rather than silently asserting identical provenance.

`verify.py` compares **every prepared model value** with NetCDF decoding, checks axes/time/units and thermodynamic conversion, and produces independently interpolated reference values in `verification.json` for frontend tests. Selected checkpoints include 250 m: model 12.1132179478, observed 12.0379177111, difference +0.0753002367 °C. Float32 browser storage differs from decoded float64 packed values by less than 0.000003 °C.

## Storage and attribution

- `model/`: three temperature-only packed native-grid subsets, ~0.6 MB each, with source attributes. These are bounded verification fixtures, **not** global raw archives.
- `observations/`: original complete Argo profile, ~22 KB.
- `manifest.json`: source URLs, identifiers, attributes, processing versions and SHA-256 checksums.
- `public/real-case/`: browser-ready case JSON, 6.5 MB little-endian Float32 scientific field and a copy of the manifest. Array order is `[time][depth][latitude][longitude]`.

Copernicus acknowledgement: this application uses data from the **Copernicus Marine Service** (Mercator Ocean International), product DOI 10.48670/moi-00021; redistributed historical subset via NSF NCAR GDEX, DOI 10.5065/3NSD-QP06. See [Copernicus licence](https://marine.copernicus.eu/user-corner/service-commitments-and-licence).

Argo acknowledgement: these data were collected and made freely available by the International Argo Program and the national programmes that contribute to it ([argo.ucsd.edu](https://argo.ucsd.edu/), DOI 10.17882/42182). Argo is part of the Global Ocean Observing System. The selected profile is distributed by the Ifremer GDAC, CSIO DAC.
