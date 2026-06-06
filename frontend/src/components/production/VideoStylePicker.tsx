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
    <label className="production-field video-style-picker">
      画面风格
      <select
        value={selected?.id ?? selectedStyleId}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="production-select"
      >
        {styles.map((style) => (
          <option key={style.id} value={style.id}>
            {style.name}
          </option>
        ))}
      </select>
    </label>
  );
}
