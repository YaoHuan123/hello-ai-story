export type VideoProductionMode = "biography_narration" | "interview_studio";
export type VideoTaskStatus = "pending" | "queued" | "running" | "success" | "failed";

export type VideoTaskListItem = {
  taskId: string;
  productionMode: VideoProductionMode;
  status: VideoTaskStatus;
  createdAt: string;
  updatedAt: string;
  completedSteps: string[];
  lastError?: string;
};

export type VideoTaskRequestKind = "create_video_biography" | "create_video_studio";

export type VideoTaskProgress = VideoTaskListItem & {
  heartbeatAt?: string;
};

export type TextProductionMode = "biography_formal_article";
export type TextTaskStatus = "pending" | "running" | "success" | "failed";

export type TextTaskListItem = {
  taskId: string;
  productionMode: TextProductionMode;
  status: TextTaskStatus;
  createdAt: string;
  updatedAt: string;
  completedSteps: string[];
  lastError?: string;
};

export type TextVideoCostEstimate = {
  tierCount: number;
  usdPerTier: number;
  estimatedUsd: number;
  usedLegacyFallback: boolean;
};

export type TextTaskOutputSnapshot = {
  articlePath: string;
  hasArticle: boolean;
  articleLength?: number;
  sectionCount?: number;
  skippedModel?: boolean;
  videoCostEstimate?: TextVideoCostEstimate;
};

export type TextTaskProgress = TextTaskListItem & {
  output: TextTaskOutputSnapshot | null;
};

export type TextArticleResponse = {
  taskId: string;
  savedAt?: string;
  sectionCount?: number;
  skippedModel?: boolean;
  videoCostEstimate?: TextVideoCostEstimate;
  article: string;
};

export type ScheduleVideoTaskResponse = {
  taskId: string;
  kind: VideoTaskRequestKind;
  status: "queued";
};

export type CreateTextTaskResponse = {
  taskId: string;
  status: TextTaskStatus;
  completedSteps: string[];
  articlePath: string;
  progress: TextTaskProgress;
};

export type PolishMode = "llm" | "stub";

export type ScheduleBiographyPayload = {
  styleConfigPath?: string;
  styleId?: string;
  textTaskId?: string;
  polishMode?: PolishMode;
  throughStep?: string;
  taskId?: string;
};

export type ScheduleStudioPayload = {
  qaGranularity?: "hybrid" | "per_event" | "batch";
  textTaskId?: string;
  polishMode?: PolishMode;
  throughStep?: string;
  taskId?: string;
};

export type CreateTextTaskPayload = {
  mode?: PolishMode;
};

export type VideoArtifactKind = "video" | "audio" | "image" | "json" | "other";

export type VideoArtifactItem = {
  kind: VideoArtifactKind;
  relativePath: string;
  sizeBytes: number;
  mimeType: string;
};

export type VideoTaskArtifacts = {
  taskId: string;
  productionMode: VideoProductionMode;
  primaryVideo: {
    available: boolean;
    relativePath?: string;
    sizeBytes?: number;
    mimeType?: string;
  };
  counts: { video: number; audio: number; image: number; json: number; other: number };
  items: VideoArtifactItem[];
};

export type TextTaskArtifacts = {
  taskId: string;
  productionMode: TextProductionMode;
  article: {
    available: boolean;
    relativePath: string;
    sizeBytes?: number;
    articleLength?: number;
    skippedModel?: boolean;
  };
  items: Array<{
    kind: "article";
    relativePath: string;
    sizeBytes: number;
    mimeType: string;
    hasArticle: boolean;
    articleLength?: number;
  }>;
};

export type StoryTextTaskOption = {
  taskId: string;
  createdAt: string;
  articleLength: number;
};

export type ProductionReadiness = {
  sectionCount: number;
  usableSectionCount: number;
  sectionNames: string[];
  ready: boolean;
  hasStoryText: boolean;
  storyTextTasks: StoryTextTaskOption[];
  latestStoryTextTaskId?: string;
  message: string;
  /** 采访展示语言（meta.locale） */
  locale: "zh" | "en";
  biographyTtsVoice: string;
  studioHostVoice: string;
  studioGuestVoice: string;
};

export type PublicVideoStyle = {
  id: string;
  order: number;
  name: string;
  badge: string;
  positioning: string;
  atmosphere: string;
  suitableFor: string;
  detailedDesc: string;
  coverUrl: string | null;
};

export type VideoStylesCatalog = {
  selectedStyleId: string;
  styles: PublicVideoStyle[];
};
