import { watchCoverUrl } from "../api/watch";
import type { ReactNode } from "react";

type Props = {
  publishId: string;
  className?: string;
  fallback?: ReactNode;
};

export function WatchVideoCover({ publishId, className, fallback = null }: Props) {
  const url = watchCoverUrl(publishId);

  if (url) {
    return <img className={className} src={url} alt="" loading="lazy" />;
  }
  return <>{fallback}</>;
}
