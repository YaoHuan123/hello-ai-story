/** 302 / doubao_tts_hd 常用 voice_type（须与网关 Key 授权一致） */
export type TtsVoiceOption = {
  id: string;
  name: string;
  note?: string;
};

/** 传记旁白推荐：老项目 302 实测可用 */
export const DEFAULT_BIOGRAPHY_TTS_VOICE = "zh_male_M392_conversation_wvae_bigtts";

export const DEFAULT_STUDIO_HOST_VOICE = "zh_female_tianmeixiaoyuan_moon_bigtts";
export const DEFAULT_STUDIO_GUEST_VOICE = "zh_male_M392_conversation_wvae_bigtts";

export const TTS_VOICE_OPTIONS: TtsVoiceOption[] = [
  { id: DEFAULT_BIOGRAPHY_TTS_VOICE, name: "M392 男声", note: "302 传记旁白推荐" },
  {
    id: DEFAULT_STUDIO_HOST_VOICE,
    name: "甜美小源",
    note: "演播室主持；若 3001 请换 M392 或开通权限",
  },
  { id: DEFAULT_STUDIO_GUEST_VOICE, name: "M392 男声", note: "演播室嘉宾" },
  { id: "zh_female_shuangkuaisisi_moon_bigtts", name: "爽快思思", note: "openspeech 常用" },
];
