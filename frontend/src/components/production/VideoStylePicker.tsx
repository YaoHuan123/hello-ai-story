import type { PublicVideoStyle } from "../../types/production";

type Props = {
  styles: PublicVideoStyle[];
  selectedStyleId: string;
  onChange: (styleId: string) => void;
  disabled?: boolean;
};

export function VideoStylePicker({ styles, selectedStyleId, onChange, disabled }: Props) {
  const selected = styles.find((s) => s.id === selectedStyleId) ?? styles[0];

  if (styles.length === 0) {
    return <p className="production-muted">暂无可用视频风格配置。</p>;
  }

  return (
    <div className="video-style-picker">
      <label className="production-field">
        画面风格
        <select
          value={selectedStyleId}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="production-select"
        >
          {styles.map((style) => (
            <option key={style.id} value={style.id}>
              {style.name}
              {style.badge ? ` · ${style.badge}` : ""}
            </option>
          ))}
        </select>
      </label>

      {selected && (
        <div className="video-style-picker__card">
          {selected.coverUrl && (
            <img
              src={selected.coverUrl}
              alt=""
              className="video-style-picker__cover"
              loading="lazy"
            />
          )}
          <div className="video-style-picker__meta">
            <div className="video-style-picker__name">
              {selected.name}
              {selected.badge && <span className="video-style-picker__badge">{selected.badge}</span>}
            </div>
            <p className="video-style-picker__desc">{selected.detailedDesc || selected.positioning}</p>
            <p className="video-style-picker__suitable">适合：{selected.suitableFor}</p>
          </div>
        </div>
      )}
    </div>
  );
}
