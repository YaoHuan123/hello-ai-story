This step runs **before text-to-image (step 240)**. From each `visualScenes[].sceneDescription` in `pipeline/step-220_包含视频风格的展开后的场景包.json`, compile **verifiable China place/road/campus names** that may appear on signs — merged into the text-to-image API prompt downstream.

**Important**: **no live web search** — model knowledge only; **do not** invent specific road or institution names you are unsure exist. When uncertain, leave arrays empty and note briefly in `uncertaintyNote`. Maintainers should spot-check; for hard verification use a separate retrieval product path.

## User

You receive JSON: `inputScenes` is an array; each item has `segmentIndex`, `sceneIndex`, `sceneDescription` (string). Output **one** `geoDetails` record per input item; **array order matches `inputScenes` 1:1** (item i ↔ `inputScenes[i]`).

**Do not** echo `segmentIndex` / `sceneIndex` (server merges by array index).

Per scene, from region, era, occupation, and activity:

- `primaryLocation`: most relevant place summary (city/district/town or park level; may be `""`).
- `roadNames`: local road names you **confidently believe are real**; else `[]`.
- `landmarks`: real landmarks, districts, scenic spots, stations; else `[]`.
- `workplaceOrCampus`: real office parks, software parks, university campuses, major company campuses (e.g. Hangzhou developer scene → "Paradise Software Park", "Alibaba Xixi Campus" **only when confident and scene-consistent**); else `[]`.
- `signageLines`: 1–5 **short Chinese phrases** (≤12 chars each) suitable for road/station signs — pick from fields above or reasonable combinations; if no credible names, `[]`. *(On-image signage in China stays Chinese for text-to-image readability.)*
- `uncertaintyNote`: optional; when most fields empty, explain (e.g. "description too generic", "region unclear").

**Do not** output place names that conflict with `sceneDescription`; **do not** invent door-number-level fake addresses.

Output **only** one JSON object; top-level key **`geoDetails`**, array value; length equals `inputScenes`.

Input JSON:

{{PIPELINE_JSON}}
