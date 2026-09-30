import { Pause, Play } from "lucide-react";
import { formatDate } from "../data/ocean";

export default function Timeline({
  times,
  time,
  playing,
  onTime,
  onPlay,
}: {
  times: string[];
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
          {formatDate(times[time])} <span>Daily mean · UTC</span>
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
          aria-valuetext={`${formatDate(times[time])}, daily mean 00:00–24:00 UTC`}
          type="range"
          min="0"
          max={times.length - 1}
          step="1"
          value={time}
          onChange={(e) => onTime(Number(e.target.value))}
          style={
            {
              "--range-progress": `${(time / (times.length - 1)) * 100}%`,
            } as React.CSSProperties
          }
        />
      </div>
      <div className="range-labels time-labels">
        <span>{formatDate(times[0])}</span>
        <span>{formatDate(times.at(-1)!)}</span>
      </div>
    </div>
  );
}
