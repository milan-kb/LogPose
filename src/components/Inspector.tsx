import { ChevronDown, Radio, X } from "lucide-react";
import { compareAtDepth, compareProfile, formatDate } from "../data/ocean";
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
          <p>Argo-style temperature profile · synthetic</p>
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
          <small>Model − observed</small>
        </div>
        <strong data-testid="point-difference">
          {difference}
          <small> °C</small>
        </strong>
      </div>
      <div className="chart-heading">
        <h3>Temperature profile</h3>
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
              {profile.platform} · {profile.name}
            </dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>
              {profile.lat.toFixed(3)}° N, {profile.lon.toFixed(3)}° E
            </dd>
          </div>
          <div>
            <dt>Timestamp</dt>
            <dd>{formatDate(profile.time)} 2024 · 12:00 UTC</dd>
          </div>
          <div>
            <dt>Spatial match</dt>
            <dd>Bilinear at profile location</dd>
          </div>
          <div>
            <dt>Depth match</dt>
            <dd>Linear · no extrapolation</dd>
          </div>
          <div>
            <dt>Time offset</dt>
            <dd>0 h · same demo snapshot</dd>
          </div>
          <div>
            <dt>Quality status</dt>
            <dd>Synthetic · not field QC</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>Bay of Bengal · demo v1</dd>
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
          {comparison.count} equally weighted paired depths. Both curves use the
          same synthetic temperature quantity. Illustrative comparison, not
          independent model validation.
        </p>
      </details>
    </aside>
  );
}
