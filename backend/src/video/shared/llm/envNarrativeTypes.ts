/** 场景包条目（时代线 / 个人线 env-narrative 步共用）。 */
export type EnvNarrativeSegmentPackItem = {
  segmentIndex: number;
  logicalSegmentIndex: number;
  sceneFragmentIndex: number;
  name: string;
  env_time: string;
  env_location: string;
  narrative: string;
  voiceover: string;
  env_event: string;
};
