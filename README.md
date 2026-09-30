# LOG POSE · Ocean workspace

A browser-based SIH26067 prototype with **real GLORYS12V1 reanalysis temperature and one real delayed-mode Argo profile**. React + TypeScript + Three.js. The complete prepared historical case is bundled locally; no accounts, backend or upstream availability are needed to run it.

## Run

```sh
npm install
npm run dev -- --port 5173
```

Open http://localhost:5173. `npm run build` produces a static `dist/` including the real-data case; `npm run preview` serves it.

## The case

- **Model:** Copernicus Marine Global Ocean Physics Reanalysis, `GLOBAL_MULTIYEAR_PHY_001_030`, GLORYS12V1, acquired from the NCAR GDEX `d010049` THREDDS mirror. Three daily native-resolution subsets, **15–17 September 2023**, **82–92° E / 10–20° N**.
- **Observation:** Ifremer Argo GDAC, CSIO DAC, WMO **2902766**, ascending cycle **135**, **15 September 2023 21:32:52 UTC**, **15.105° N / 87.882° E**. Adjusted pressure, temperature and salinity: all 102 samples QC 1, delayed mode D; position/time QC 1.
- **Quantity compared:** potential temperature referenced to **0 dbar**, ITS-90 degrees Celsius. The measured in-situ temperature is converted using TEOS-10 GSW and measured adjusted salinity. Salinity is a conversion input only, not a new visualization feature.
- **Time matching:** instantaneous profile against its containing UTC day's model mean, labelled at noon. Actual observation time is retained; offset from mean centre is **+9.5478 h**, not zero.
- **Space/depth:** bilinear native model grid plus linear interpolation on actual nonuniform physical model depths. Reject any invalid contributing corner. Argo pressure becomes positive-down depth using latitude-dependent GSW conversion. No extrapolation; no observation gaps over 100 m.
- **Important:** GLORYS assimilates in-situ T/S profiles. Independence from this profile is not established. This is a model–observation comparison, **not independent validation**.

## Recording flow (60–90 seconds)

1. State “real historical GLORYS12V1 + Argo, bundled locally; not a live forecast.”
2. Rotate slightly, reset, then move depth from 25 to 250 to 600 m.
3. Change the date. The daily mean changes; on 16–17 September the UI correctly reports no observation in this bounded case. Return to **15 September**.
4. Select **2902766**. Its water-column samples and profile inspector appear.
5. At **250 m**, model **12.113 °C**, Argo **12.038 °C**, difference **+0.075 °C**. Values come from the existing real-data calculation (12.113217… − 12.037917… = 0.075300…).
6. Click the profile chart to change depth. Scene, annotation, inspector and chart stay linked.
7. Expand Comparison details: point out observation time vs daily mean, QC and interpolation. The About dialog and linked manifest disclose full provenance and limitations.

## Scientific preparation and reproducibility

See [`data/real-case/README.md`](data/real-case/README.md). Small native NetCDF **subsets**, the complete 22 KB Argo profile, manifest and independent source-derived verification values are retained. No global raw files are included.

`public/real-case/case.json` holds coordinates, profile values and QC. `temperature.f32` is a 6.5 MB little-endian native-resolution scientific array in **time, depth, latitude, longitude** order. The renderer samples this scientific array for its mesh; comparison calculations never read display pixels or a downsampled field.

The application fails visibly if the local case is missing or invalid. There is **no synthetic fallback**.

## Checks

```sh
npm test
npm run test:browser
npm run build
```

Browser checks deny all non-local requests while exercising the real-data workflow, comparison values, timestamps, empty observation days, playback, camera/reset, phone layout and missing-file error state.

## Structure

```text
data/real-case/                  Acquisition, source subsets, provenance, scientific checks
public/real-case/                Offline prepared case shipped with the app
src/data/ocean.ts                Local loading, native-axis sampling, matching and comparison
src/components/OceanScene.tsx    Existing depth-slice/section renderer and camera lifecycle
src/components/ProfileChart.tsx Linked potential-temperature profile chart
src/components/Inspector.tsx    Comparison, matching and provenance
src/components/Timeline.tsx     Daily-mean navigation and playback
src/App.tsx                     Workspace and shared state
```

## Limits

One fixed regional case, three daily fields, one profile, temperature only. This is not a general NetCDF uploader, operational integration, forecast or independently validated model. The scene uses depth slices and boundary sections, not volume raycasting. Depth is exaggerated (roughly 315× in this regional display); the box is schematic, not bathymetry. The view is limited to 1–1,200 m, while the scientific model retains the bracketing 1,245 m level and the full Argo profile extends to 1,958 m. Summary metrics use equally weighted valid observation samples within the displayed depth range; sampling is nonuniform and uncertainty is not quantified.

Bundled geography: Natural Earth 1:110m country exteriors (public domain). Fonts: locally bundled DM Sans / Space Grotesk under SIL Open Font License.
