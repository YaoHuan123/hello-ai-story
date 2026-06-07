import { useCallback, useEffect, useRef } from "react";

type Props = {
  open: boolean;
  src: string | null;
  loading?: boolean;
  title?: string;
  onClose: () => void;
};

/** 成片预览：应用内全屏黑底弹层，不新开浏览器窗口。 */
export function VideoPreviewModal({ open, src, loading = false, title = "成片预览", onClose }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    rootRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={rootRef}
      className="prod-video-preview-modal"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <button type="button" className="prod-video-preview-modal__backdrop" aria-label="关闭预览" onClick={onClose} />
      <div className="prod-video-preview-modal__body">
        <button type="button" className="prod-video-preview-modal__close" onClick={onClose}>
          关闭
        </button>
        {loading ? (
          <p className="prod-video-preview-modal__loading">加载中…</p>
        ) : src ? (
          <video
            className="prod-video-preview-modal__video"
            src={src}
            controls
            autoPlay
            playsInline
            preload="metadata"
          />
        ) : (
          <p className="prod-video-preview-modal__loading">无法加载视频</p>
        )}
      </div>
    </div>
  );
}
