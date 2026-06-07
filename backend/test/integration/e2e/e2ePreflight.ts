/**
 * 非 stub 端到端验收的前置检查（不调用外部 API）。
 */
export type E2ePreflightItem = {
  id: string;
  label: string;
  ok: boolean;
  required: boolean;
  hint?: string;
};

export type E2ePreflightResult = {
  items: E2ePreflightItem[];
  ready: boolean;
  missingRequired: string[];
};

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function truthy(name: string): boolean {
  const v = env(name).toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function clearStubEnv(): void {
  delete process.env.TEXT_ARTICLE_STUB;
  delete process.env.VIDEO_INPUT_STUB;
  delete process.env.VIDEO_PREP_STUB;
  delete process.env.STUDIO_SCRIPT_STUB;
}

export function runE2ePreflight(opts?: { includeVideoRender?: boolean }): E2ePreflightResult {
  const includeVideoRender = opts?.includeVideoRender ?? truthy("E2E_VIDEO_RENDER");

  const llmOk = Boolean(env("OPENAI_API_KEY"));
  const ttsKeyOk = Boolean(env("TTS_API_KEY") || env("OPENAI_API_KEY"));
  const ttsVoiceOk = Boolean(env("TTS_VOICE_ZH_MALE") || env("VIDEO_DEMO_TTS_VOICE"));
  const hostOk = Boolean(
    env("TTS_VOICE_ZH_FEMALE") || env("VIDEO_DEMO_HOST_VOICE") || env("VIDEO_DEMO_TTS_VOICE"),
  );
  const guestOk = Boolean(
    env("TTS_VOICE_ZH_MALE") || env("VIDEO_DEMO_GUEST_VOICE") || env("VIDEO_DEMO_TTS_VOICE"),
  );
  const text2imgOk = Boolean(env("TEXT2IMG_API_KEY") || env("OPENAI_API_KEY"));
  const bioSeedOk = Boolean(env("E2E_BIO_SEED_READY")); // set by caller after fs check
  const studioSeedOk = Boolean(env("E2E_STUDIO_SEED_READY"));

  const items: E2ePreflightItem[] = [
    {
      id: "openai",
      label: "OPENAI_API_KEY（LLM）",
      ok: llmOk,
      required: true,
      hint: "backend/.env 中配置 OPENAI_API_KEY / BASE_URL / MODEL",
    },
    {
      id: "tts_key",
      label: "TTS_API_KEY 或 OPENAI_API_KEY（TTS）",
      ok: ttsKeyOk,
      required: true,
      hint: "传记 step 180 / 演播室 iv_tts 需要",
    },
    {
      id: "tts_voice",
      label: "TTS_VOICE_ZH_MALE（传记旁白 / 演播室嘉宾）",
      ok: ttsVoiceOk,
      required: true,
      hint: "backend/.env 必填；例：zh_male_M392_conversation_wvae_bigtts",
    },
    {
      id: "host_voice",
      label: "TTS_VOICE_ZH_FEMALE（演播室主持）",
      ok: hostOk,
      required: true,
      hint: "例：zh_female_tianmeixiaoyuan_moon_bigtts",
    },
    {
      id: "guest_voice",
      label: "TTS_VOICE_ZH_MALE（演播室嘉宾，与传记男声共用）",
      ok: guestOk,
      required: true,
      hint: "与 TTS_VOICE_ZH_MALE 相同即可",
    },
    {
      id: "bio_seed",
      label: "test/fixtures/video-bio-through-140 seed",
      ok: bioSeedOk,
      required: true,
      hint: "传记 150→230 续跑；无 seed 时设 E2E_BIO_FULL=1 跑全程（耗时长）",
    },
    {
      id: "studio_seed",
      label: "test/fixtures/video-studio-through-iv-script seed",
      ok: studioSeedOk,
      required: true,
      hint: "演播室 iv_tts 续跑；无 seed 时设 E2E_STUDIO_FULL=1",
    },
  ];

  if (includeVideoRender) {
    items.push(
      {
        id: "text2img",
        label: "TEXT2IMG_API_KEY 或 OPENAI_API_KEY（文生图）",
        ok: text2imgOk,
        required: true,
        hint: "传记 step 240 需要",
      },
      {
        id: "ffmpeg",
        label: "ffmpeg 可执行（PATH 或 FFMPEG_PATH）",
        ok: truthy("E2E_FFMPEG_OK"),
        required: true,
        hint: "step 250/260 需要；验收脚本会检测并设置 E2E_FFMPEG_OK",
      },
    );
  }

  const missingRequired = items.filter((i) => i.required && !i.ok).map((i) => i.id);
  return { items, ready: missingRequired.length === 0, missingRequired };
}

export function printPreflight(result: E2ePreflightResult): void {
  console.log("\n=== E2E 前置检查（非 stub）===");
  for (const item of result.items) {
    const mark = item.ok ? "[ok]" : item.required ? "[!!]" : "[--]";
    console.log(`  ${mark} ${item.label}`);
    if (!item.ok && item.hint) console.log(`       → ${item.hint}`);
  }
  if (!result.ready) {
    console.log(`\n缺少必填项：${result.missingRequired.join(", ")}`);
  } else {
    console.log("\n前置检查通过，开始验收…");
  }
}
