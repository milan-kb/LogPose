import { ChevronDown, Radio, X } from "lucide-react";
import { compareAtDepth, compareProfile, formatTimestamp } from "../data/ocean";
import type { OceanData, Profile } from "../data/ocean";
import ProfileChart from "./ProfileChart";

export default function Inspector({
  data,
  profile,
  depth,
  onDepth,
  onClose,
}: {
  data: OceanData;
  profile: Profile;
  depth: number;
  onDepth: (depth: number) => void;
  onClose: () => void;
}) {
  const comparison = compareProfile(data, profile);
  const sample = compareAtDepth(data, profile, depth);
  const difference =
    sample.difference === null
      ? "—"
      : `${sample.difference >= 0 ? "+" : "−"}${Math.abs(sample.difference).toFixed(2)}`;

  return (
    <aside
      className="inspector"
      aria-label="Observation inspector"
      id="profile-inspector"
    >
      <header className="inspector-heading">
        <div>
          <span className="selected-profile-label">
            <Radio size={16} />
            SELECTED OBSERVATION
          </span>
          <h2>Observation {profile.platform}</h2>
          <p>Argo cycle {profile.cycle} · delayed mode · QC 1</p>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close profile"
        >
          <X size={21} />
        </button>
      </header>
      <div className="comparison-depth">
        At the selected depth ·{" "}
        <strong>{sample.depth.toLocaleString()} m below surface</strong>
        <small>Potential temperature · 0 dbar reference</small>
        {sample.difference === null && <small>No valid paired value at this depth; no extrapolation.</small>}
      </div>
      <div className="point-values">
        <div>
          <span className="model-text">
            <i />
            MODEL
          </span>
          <strong data-testid="model-value">
            {sample.model?.toFixed(2) ?? "—"}
            <small> °C</small>
          </strong>
        </div>
        <div>
          <span className="observed-text">
            <i />
            OBSERVED
          </span>
          <strong data-testid="observed-value">
            {sample.observed !== null ? sample.observed.toFixed(2) : "—"}
            <small> °C</small>
          </strong>
        </div>
      </div>
      <div className="primary-difference">
        <div>
          <span>Difference</span>
          <small>Model − observed · before rounding</small>
        </div>
        <strong data-testid="point-difference">
          {difference}
          <small> °C</small>
        </strong>
      </div>
      <div className="chart-heading">
        <h3>Potential temperature profile</h3>
        <span>°C</span>
      </div>
      <div className="chart-legend">
        <span>
          <i className="model-line" />
          Model
        </span>
        <span>
          <i className="observed-line" />
          Observed
        </span>
        <small>Depth increases ↓</small>
      </div>
      <ProfileChart
        data={data}
        profile={profile}
        depth={depth}
        onDepth={onDepth}
      />
      <details className="match-details">
        <summary>
          Comparison details
          <ChevronDown size={16} />
        </summary>
        <dl>
          <div>
            <dt>Profile</dt>
            <dd>
              {profile.platform} · cycle {profile.cycle}
            </dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>
              {profile.lat.toFixed(3)}° N, {profile.lon.toFixed(3)}° E
            </dd>
          </div>
          <div>
            <dt>Observation time</dt>
            <dd>{formatTimestamp(profile.time)}</dd>
          </div>
          <div>
            <dt>Model time</dt>
            <dd>{sample.match.modelTime ? formatTimestamp(sample.match.modelTime) : "No match"} · daily mean</dd>
          </div>
          <div>
            <dt>Spatial match</dt>
            <dd>Bilinear native 1/12° grid; valid corners only</dd>
          </div>
          <div>
            <dt>Depth match</dt>
            <dd>Linear physical depths · no extrapolation · observed gaps ≤100 m</dd>
          </div>
          <div>
            <dt>Time offset</dt>
            <dd>{sample.match.offsetHours?.toFixed(2) ?? "—"} h after mean centre; same UTC day</dd>
          </div>
          <div>
            <dt>Quality status</dt>
            <dd>Mode {profile.dataMode} · adjusted PRES/TEMP/PSAL QC 1; position/time QC 1</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>GLORYS12V1 · GLOBAL_MULTIYEAR_PHY_001_030; Argo GDAC / CSIO</dd>
          </div>
          <div>
            <dt>Conversion</dt>
            <dd>TEOS-10: pressure → depth; adjusted in-situ temperature → potential temperature at 0 dbar</dd>
          </div>
          <div>
            <dt>Mean difference</dt>
            <dd data-testid="mean-difference">
              {comparison.bias?.toFixed(2) ?? "—"} °C
            </dd>
          </div>
          <div>
            <dt>RMSE</dt>
            <dd>{comparison.rmse?.toFixed(2) ?? "—"} °C</dd>
          </div>
        </dl>
        <p>
          Differences use unrounded values. Summary metrics use{" "}
          {comparison.count} equally weighted paired observation depths within the 0–1,200 m column.
          Instantaneous Argo vs daily model mean. Reanalysis assimilates in-situ profiles;
          independence is not established. A discrepancy alone does not establish model error.
        </p>
        <p><a href="/real-case/manifest.json" target="_blank" rel="noreferrer">Source manifest &amp; checksums</a></p>
      </details>
    </aside>
  );
}
