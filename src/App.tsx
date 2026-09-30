import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Compass,
  Info,
  LoaderCircle,
  Radio,
  RotateCcw,
  Thermometer,
  X,
} from "lucide-react";
import OceanScene from "./components/OceanScene";
import Inspector from "./components/Inspector";
import Timeline from "./components/Timeline";
import { loadOceanData, PALETTE } from "./data/ocean";
import type { OceanData } from "./data/ocean";

export default function App() {
  const [data, setData] = useState<OceanData | null>(null);
  const [error, setError] = useState("");
  const [depth, setDepth] = useState(250);
  const [time, setTime] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [observations, setObservations] = useState(true);
  const sections = true;
  const [playing, setPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const topView = false;
  const [info, setInfo] = useState(false);
  const infoButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let active = true;
    loadOceanData()
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(String(e.message));
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!playing || !data) return;
    const id = window.setInterval(
      () => setTime((t) => (t + 1) % data.times.length),
      1800,
    );
    return () => clearInterval(id);
  }, [playing, data]);
  useEffect(() => {
    if (info) dialog.current?.showModal();
    else if (dialog.current?.open) {
      dialog.current.close();
      infoButton.current?.focus();
    }
  }, [info]);

  const select = (id: string) => {
    setSelected(id);
    setObservations(true);
  };
  const closeProfile = () => {
    document
      .querySelector<HTMLButtonElement>(`[data-platform="${selected}"]`)
      ?.focus();
    setSelected(null);
  };
  const profile = data?.profiles[time].find((p) => p.platform === selected);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a href="/" className="brand" aria-label="Log Pose home">
          <Compass size={29} strokeWidth={1.5} />
          <span>
            LOG<span>POSE</span>
          </span>
        </a>
        <nav className="workflow" aria-label="Explore, select, compare">
          <span className={!profile ? "current" : "done"}>Explore</span>
          <ArrowRight size={14} />
          <span className={!profile ? "next" : "done"}>Select observation</span>
          <ArrowRight size={14} />
          <span className={profile ? "current" : "next"}>Compare</span>
        </nav>
        <button
          ref={infoButton}
          className="demo-info"
          onClick={() => setInfo(true)}
          aria-label="About this demo"
        >
          <span className="demo-dot" />
          GLORYS12V1 + Argo · local case
          <Info size={16} />
        </button>
      </header>

      {!data ? (
        <main className="loading-workspace">
          {error ? (
            <>
              <Info size={28} />
              <h2>Unable to open the workspace</h2>
              <p>{error}</p>
              <button
                className="text-button"
                onClick={() => window.location.reload()}
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <LoaderCircle size={30} className="spin" />
              <h2>Preparing your ocean workspace</h2>
              <p>Loading local GLORYS12V1 temperatures and a QC-qualified Argo profile…</p>
            </>
          )}
        </main>
      ) : (
        <main className={`workspace ${profile ? "has-selection" : ""}`}>
          <section className="scene-column" aria-label="Ocean exploration">
            <div className="scene-container">
              <div className="scene-heading">
                <p>3D OCEAN · BAY OF BENGAL</p>
                <h1>
                  {profile
                    ? `Observation ${profile.platform}`
                    : "Explore below the surface"}
                </h1>
                <span>
                  {profile
                    ? "Selected from the 3D water column · comparing temperature at the active depth"
                    : data.profiles[time].length
                      ? "Move through depth and time, then select the Argo observation."
                      : "No observation in this case on this day. Return to 15 September to compare."}
                </span>
              </div>
              <div className="scene-actions">
                <label className="observation-toggle">
                  <Radio size={17} />
                  <span>Observations</span>
                  <input
                    aria-label="Observation profiles"
                    type="checkbox"
                    checked={observations}
                    onChange={(e) => setObservations(e.target.checked)}
                  />
                  <span className="switch" />
                </label>
                <button
                  className="text-button reset-button"
                  onClick={() => {
                    setResetKey((k) => k + 1);
                  }}
                  aria-label="Reset view"
                >
                  <RotateCcw size={16} />
                  <span>Reset view</span>
                </button>
              </div>
              <OceanScene
                data={data}
                depth={depth}
                time={time}
                selected={selected}
                observations={observations}
                sections={sections}
                resetKey={resetKey}
                topView={topView}
                onSelect={select}
              />
              <div className="depth-caption">
                <span>SELECTED DEPTH</span>
                <strong>
                  {depth.toLocaleString()} <small>m</small>
                </strong>
                <span>below surface</span>
              </div>
              <div className="scene-bottom">
                <div className="temperature-legend">
                  <span>
                    Potential temperature <b>°C</b>
                  </span>
                  <div
                    className="colour-ramp"
                    style={{
                      background: `linear-gradient(to right, ${PALETTE.join(",")})`,
                    }}
                  />
                  <div className="legend-ticks">
                    <span>4</span>
                    <span>17</span>
                    <span>30</span>
                  </div>
                </div>
                <p className="scene-hint">
                  Drag to rotate · scroll to zoom
                  <span>Translucent walls show context sections</span>
                </p>
              </div>
            </div>

            <div className="controls-dock">
              <div className="variable-control">
                <span className="control-label">VARIABLE</span>
                <strong>
                  <Thermometer size={19} />
                  Temperature
                </strong>
                <span className="supporting-label">Potential · 0 dbar · °C</span>
              </div>
              <div className="depth-control">
                <div className="control-heading">
                  <label className="control-label" htmlFor="depth">
                    DEPTH
                  </label>
                  <strong>
                    <span data-testid="depth-value">
                      {depth.toLocaleString()}
                    </span>{" "}
                    m
                  </strong>
                </div>
                <input
                  id="depth"
                  aria-label="Depth in metres"
                  type="range"
                  min="1"
                  max="1200"
                  step="1"
                  value={depth}
                  onChange={(e) => setDepth(Number(e.target.value))}
                  style={
                    {
                      "--range-progress": `${depth / 12}%`,
                    } as React.CSSProperties
                  }
                />
                <div className="range-labels">
                    <span>1 m</span>
                  <span>1,200 m</span>
                </div>
              </div>
              <Timeline
                times={data.times}
                time={time}
                playing={playing}
                onTime={(t) => {
                  setTime(t);
                  setPlaying(false);
                }}
                onPlay={() => setPlaying((p) => !p)}
              />
            </div>
          </section>
          {profile && (
            <Inspector
              data={data}
              profile={profile}
              depth={depth}
              onDepth={setDepth}
              onClose={closeProfile}
            />
          )}
        </main>
      )}
      <footer className="statusbar">
        <span>
          Copernicus Marine GLORYS12V1 + Argo GDAC · September 2023 · Local historical subset, not live
        </span>
        <span>LOG POSE · SIH26067</span>
      </footer>

      <dialog
        ref={dialog}
        className="about-dialog"
        onCancel={() => setInfo(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setInfo(false);
        }}
      >
        <div className="dialog-content">
          <button
            className="icon-button dialog-close"
            onClick={() => setInfo(false)}
            aria-label="Close about dialog"
          >
            <X size={20} />
          </button>
          <p className="control-label">ABOUT THE PROTOTYPE</p>
          <h2>
            A connected view
            <br />
            of the ocean.
          </h2>
          <p>
            Explore a depth-resolved temperature field, select an instrument
            profile and compare the two.
          </p>
          <div className="demo-disclosure">
            <Info size={20} />
            <p>
              <strong>This prototype uses real historical data.</strong> Copernicus Marine
              GLORYS12V1 reanalysis and an adjusted, delayed-mode Argo profile are bundled locally.
              This is not a live service, operational forecast or independent model validation.
            </p>
          </div>
          <dl>
            <div>
              <dt>Model field</dt>
              <dd>
                GLOBAL_MULTIYEAR_PHY_001_030 · GLORYS12V1, via NCAR GDEX.
                82–92° E, 10–20° N; 15–17 September 2023. Native 1/12° grid and
                37 nonuniform levels (0.49–1,245 m); daily UTC means labelled at noon.
              </dd>
            </div>
            <div>
              <dt>Profiles</dt>
              <dd>
                Argo 2902766, cycle 135 · CSIO, via Ifremer GDAC.
                15 September 2023, 21:32:52 UTC. Adjusted pressure, temperature
                and salinity: all 102 samples QC 1; delayed mode D. Only shown on its UTC day.
              </dd>
            </div>
            <div>
              <dt>Comparison</dt>
              <dd>
                Both sides use potential temperature at 0 dbar (°C). Argo in-situ
                temperature and pressure are converted using TEOS-10 GSW and measured salinity.
                Bilinear native-grid sampling; linear physical-depth interpolation; no extrapolation
                or bridging invalid model cells. Instantaneous Argo vs same-day model mean.
                Reanalysis assimilates in-situ profiles; independence is not established.
              </dd>
            </div>
            <div>
              <dt>Geography</dt>
              <dd>
                Natural Earth public-domain country outlines. Regional
                equirectangular display; schematic water column without
                bathymetry.
              </dd>
            </div>
            <div>
              <dt>Rendering</dt>
              <dd>
                Depth slices and boundary sections of the real 3D field, shown to 1,200 m.
                Vertical scale exaggerated for visibility; not volume raycasting.
                Comparisons use native scientific arrays, not the rendered mesh.
              </dd>
            </div>
          </dl>
          <p><a href="/real-case/manifest.json" target="_blank" rel="noreferrer">Source manifest, processing and SHA-256 checksums</a></p>
          <button className="primary-button" onClick={() => setInfo(false)}>
            Return to the ocean
            <ArrowRight size={17} />
          </button>
        </div>
      </dialog>
    </div>
  );
}
