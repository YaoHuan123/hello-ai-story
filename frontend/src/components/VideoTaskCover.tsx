import { useEffect, useState, type ReactNode } from "react";
import { fetchVideoCoverBlob } from "../api/production";

type Props = {
  interviewId: string;
  taskId: string;
  className?: string;
  fallback?: ReactNode;
};

/** 成片封面：Bearer 拉 blob，供故事墙等无法带 Authorization 的 img 场景。 */
export function VideoTaskCover({ interviewId, taskId, className, fallback = null }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setFailed(false);

    void fetchVideoCoverBlob(interviewId, taskId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [interviewId, taskId]);

  if (url && !failed) {
    return <img className={className} src={url} alt="" loading="lazy" />;
  }
  return <>{fallback}</>;
}
