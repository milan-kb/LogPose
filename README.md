# LOG POSE · Ocean workspace

An interactive, local-data prototype for SIH26067. React + TypeScript + Three.js. No backend, credentials or upstream data service is required.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:5173. For production: `npm run build`, then `npm run preview`. The `dist/` directory can be hosted by any static web server.

## Recording flow (60–90 seconds)

1. Start at the saved Bay of Bengal view. No profile is selected and the comparison panel is hidden.
2. Drag the ocean to rotate; scroll to zoom. Reset using the circular-arrow button.
3. Move the depth slider from 0 to 250 to 600 metres. The coloured plane moves through the actual depth-resolved field.
4. Move the time slider, or play the timeline. Both model and synthetic profile snapshots update to the indicated date and time.
5. Click LP-02 or LP-03 in the scene. The selected profile is highlighted through the water column.
6. Read model temperature, observed temperature and their difference at the selected profile depth. The larger chart shows the full water column; click it to select a sampled depth.
7. Expand **Comparison details** only when matching, provenance or summary metrics need to be shown. The demo-data button explains all prototype assumptions.

Suggested wording: “This prototype uses a representative model field and synthetic observations. We can explore depth and time, select an instrument profile and inspect a calculated model–observation comparison.”

## Scientific honesty

- **All temperatures and instrument profiles are synthetic.** No live INCOIS data or measured Argo observations are included.
- The deterministic field has a thermocline and moving warm/cold features. It is not the output of an operational numerical ocean model.
- Model arrays have explicit latitude, longitude, physical depth and time axes: 0.25° horizontal spacing, 25 m depth spacing, 0–1,200 m, five daily snapshots.
- There are five illustrative Argo-style platforms per snapshot and 15 observation depths. Daily snapshots are not a claim about real Argo sampling frequency or a tracked instrument.
- Model samples use bilinear horizontal and linear depth interpolation at the profile timestamp. Invalid values and out-of-domain requests are rejected; no extrapolation is performed.
- Mean difference is model minus synthetic observation. RMSE and mean difference weight valid paired samples equally; these are not independent validation metrics.
- Rendering uses a depth slice plus two boundary sections of the three-dimensional field, not volume raycasting. Depth is visually exaggerated approximately 560×. Original metre depths remain unchanged.
- Geography is a regional equirectangular approximation. The 1,200 m water-column box is schematic, not bathymetry. Land cells are masked using the bundled coastline.

## Structure

```text
src/data/ocean.ts               Local dataset, sampling and comparison boundary
src/components/OceanScene.tsx   Three.js rendering and camera lifecycle
src/components/ProfileChart.tsx Linked scientific profile chart
src/components/Inspector.tsx    Comparison, matching and provenance
src/components/Timeline.tsx     Snapshot navigation and playback
src/App.tsx                    Workspace controls and shared selection state
```

Replace `loadOceanData()` and its source metadata to introduce external scientific data. Preserve the model/observation distinction, coordinate/time semantics and the `modelAt`/comparison contract. The current sampler specifically supports a regular 0.25°/25 m grid: it must be generalized before using differently spaced real datasets.

## Checks

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

The browser suite verifies depth rendering changes, camera interaction, marker selection, time playback, profile comparison, local-only requests, phone layout and the data-error state.

## Bundled assets

- `public/coastline.geojson`: selected country exteriors from [Natural Earth 1:110m](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson), public domain.
- DM Sans and Space Grotesk from Google Fonts, locally bundled under the SIL Open Font License. License texts are in `public/fonts/`.

No external network requests are needed after serving the application.
