This step does **not** call an LLM for rewriting. It uses `mergedNarrativeSegments[].visualScenes[].sceneDescription` directly as the image prompt source.

## Input

- `pipeline/step-220_包含视频风格的展开后的场景包.json`
- Field: `mergedNarrativeSegments` (array); each `visualScenes[].sceneDescription` is one frame source (aligned with `textToImage230.service`).

If **`pipeline/step-230_实景路名与地标参考.json`** exists in the same directory (step 230 output), append the matching entry's real-world text reference to the text-to-image API `prompt` for each `segmentIndex` + `sceneIndex` (fixed prefix "实景文字参考…") — no extra LLM call.

## Prompt assembly (direct template)

Per `sceneDescription`, use as main description and wrap with fixed constraints:

1. Keep subject, time, place, and action — no new facts;
2. Strengthen single-frame visual language; avoid abstract concepts;
3. Add baseline quality: cinematic, sharp detail, natural light;
4. Prefer **legible Chinese on-screen text** for region cues (road signs, station boards, shop fronts, door plates, place indicators) consistent with scene clues;
5. Text must be clear, no garbling, moderate length; if region clues are thin, use neutral placeholders (e.g. "XX路", "XX站") — no facts that conflict with the story;
6. Negative constraints: avoid logos, watermarks, malformed limbs, blur/low resolution.

## Config

- `TEXT2IMG_SIZE`: API request `size` field — **not** pixel dimensions in the natural-language prompt (avoids conflict with API params).
  - Default **`2848x1600`** (lowercase `x`; Volcano/Doubao expects `WIDTHxHEIGHT` or `2k` / `3k`, not `*`);
  - Override in `backend/.env`, e.g. `2k`, `3k`, or vendor-supported `WxH`.

- `TEXT2IMG_REGION_TEXT_MODE=on|off`
  - `on` (default): emphasize regional on-screen text;
  - `off`: do not force regional text display.

## Output

- Image files: `媒体/图片文件夹/segment-xxxx.png`
- Index: `pipeline/step-240_包含图片位置的场景包.json`
- Index fields:
  - `segmentIndex`
  - `relativePath`
  - `prompt`
