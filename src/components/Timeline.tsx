import { Pause, Play } from "lucide-react";
import { formatDate, TIMES } from "../data/ocean";

export default function Timeline({
  time,
  playing,
  onTime,
  onPlay,
}: {
  time: number;
  playing: boolean;
  onTime: (time: number) => void;
  onPlay: () => void;
}) {
  return (
    <div className="timeline">
      <div className="control-heading">
        <label className="control-label" htmlFor="time">
          TIME
        </label>
        <strong>
          {formatDate(TIMES[time])} 2024 <span>12:00 UTC</span>
        </strong>
      </div>
      <div className="time-track">
        <button
          className="play-button"
          onClick={onPlay}
          aria-label={playing ? "Pause time playback" : "Play time playback"}
        >
          {playing ? (
            <Pause size={16} fill="currentColor" />
          ) : (
            <Play size={16} fill="currentColor" />
          )}
        </button>
        <input
          id="time"
          aria-label="Ocean time"
          aria-valuetext={`${formatDate(TIMES[time])} 2024, 12:00 UTC`}
          type="range"
          min="0"
          max={TIMES.length - 1}
          step="1"
          value={time}
          onChange={(e) => onTime(Number(e.target.value))}
          style={
            {
              "--range-progress": `${(time / (TIMES.length - 1)) * 100}%`,
            } as React.CSSProperties
          }
        />
      </div>
      <div className="range-labels time-labels">
        <span>15 Sep</span>
        <span>19 Sep</span>
      </div>
    </div>
  );
}
