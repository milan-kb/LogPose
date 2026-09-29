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
import { loadOceanData, PALETTE, TIMES } from "./data/ocean";
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
    if (!playing) return;
    const id = window.setInterval(
      () => setTime((t) => (t + 1) % TIMES.length),
      1800,
    );
    return () => clearInterval(id);
  }, [playing]);
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
          Synthetic demo data
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
              <p>Loading local geography and representative temperatures…</p>
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
                    : "Move through depth and time, then select an observation."}
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
                    Temperature <b>°C</b>
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
                <span className="supporting-label">Degrees Celsius · °C</span>
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
                  min="0"
                  max="1200"
                  step="25"
                  value={depth}
                  onChange={(e) => setDepth(Number(e.target.value))}
                  style={
                    {
                      "--range-progress": `${depth / 12}%`,
                    } as React.CSSProperties
                  }
                />
                <div className="range-labels">
                  <span>Surface</span>
                  <span>1,200 m</span>
                </div>
              </div>
              <Timeline
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
          Representative model + synthetic observations. Not live data.
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
              <strong>This is a representative prototype.</strong> Both the
              model field and observation profiles are generated locally. They
              are not live data, actual Argo measurements or an INCOIS product.
            </p>
          </div>
          <dl>
            <div>
              <dt>Model field</dt>
              <dd>
                Deterministic thermocline with moving warm/cold features. 0.25°
                grid, 25 m levels, five daily snapshots.
              </dd>
            </div>
            <div>
              <dt>Profiles</dt>
              <dd>
                Five synthetic Argo-style platforms per snapshot, with 15
                sampled depths. Not measurements of a tracked float.
              </dd>
            </div>
            <div>
              <dt>Comparison</dt>
              <dd>
                Model sampled at the profile position and timestamp. Bilinear
                horizontal and linear depth interpolation. Mean and RMSE use
                equal weight per valid paired sample.
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
                Depth slices and boundary sections of a 3D field. Vertical scale
                exaggerated for visibility; not volume raycasting.
              </dd>
            </div>
          </dl>
          <button className="primary-button" onClick={() => setInfo(false)}>
            Return to the ocean
            <ArrowRight size={17} />
          </button>
        </div>
      </dialog>
    </div>
  );
}
