/** 集成测试读取成片音色：优先 TTS_VOICE_*，兼容旧 VIDEO_DEMO_*。 */
export function testTtsVoiceZhMale(): string {
  return (process.env.TTS_VOICE_ZH_MALE ?? process.env.VIDEO_DEMO_TTS_VOICE ?? "").trim();
}

export function testTtsVoiceZhFemale(): string {
  return (process.env.TTS_VOICE_ZH_FEMALE ?? process.env.VIDEO_DEMO_HOST_VOICE ?? "").trim();
}

export function testTtsVoiceEnMale(): string {
  return (process.env.TTS_VOICE_EN_MALE ?? "").trim();
}

export function testTtsVoiceEnFemale(): string {
  return (process.env.TTS_VOICE_EN_FEMALE ?? "").trim();
}

export function testStudioHostVoice(): string {
  return testTtsVoiceZhFemale() || testTtsVoiceEnFemale();
}

export function testStudioGuestVoice(): string {
  return testTtsVoiceZhMale() || testTtsVoiceEnMale();
}
