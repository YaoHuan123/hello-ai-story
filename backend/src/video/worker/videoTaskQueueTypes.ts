/** 成片 worker 队列：`{采访根}/worker-queue/video-queue-{taskId}.json` */

export const VIDEO_QUEUE_DIR = "worker-queue";
export const VIDEO_QUEUE_FILE_PREFIX = "video-queue-";

export type VideoQueueTaskStatus = "queued" | "running" | "success" | "failed";

export type VideoQueueTaskKind = "create_video_biography" | "create_video_studio";

export type VideoQueueTaskRecord = {
  queueTaskId: string;
  userId: string;
  interviewId: string;
  videoTaskId: string;
  kind: VideoQueueTaskKind;
  payload: Record<string, unknown>;
  status: VideoQueueTaskStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  runToken?: string;
  heartbeatAt?: string;
  error?: { code: string; message: string };
  result?: unknown;
};

export type BiographyVideoQueuePayload = {
  ttsVoice: string;
  styleConfigPath?: string;
  /** 覆盖 config/video-styles.json 的 selectedStyleId */
  styleId?: string;
  /** 成片所依据的文本任务 */
  textTaskId?: string;
  polishMode?: "llm" | "stub";
  /** 调试：只跑到该步（含） */
  throughStep?: string;
};

export type StudioVideoQueuePayload = {
  hostVoice: string;
  guestVoice: string;
  qaGranularity?: "hybrid" | "per_event" | "batch";
  textTaskId?: string;
  polishMode?: "llm" | "stub";
  throughStep?: string;
};
