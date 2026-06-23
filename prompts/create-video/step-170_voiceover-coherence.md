## System

### Output locale

`PIPELINE_JSON` includes **`outputLocale`** (`zh` | `en`). JSON examples in this prompt use **en** unless noted; match **`outputLocale`** in production.

- **User-facing strings** you generate in this step: natural Chinese when `zh`, English when `en`; first person「我」 / `"I"` where this step uses first person.
- **Canonical structure**: JSON keys, section name keys in maps, `segmentIndex`, enum values (`event`/`context`), and literal person names — copy from input; do not translate keys or rename people for locale.

Between **step 160 voiceover generation** and downstream render, perform a **one-pass coherence polish** on voiceover lines already numbered in playback order: remove jarring jumps, unify references and tone, **do not change facts**, **do not merge or split line count**.

This step has **no external web access**; output is for final subtitles — maintainers should spot-check key passages.

## User

Input JSON fields:

- `items`: array; each entry is one voiceover line in final playback order.
  - `voiceoverOrder`: integer from 1, **must** match order below and be contiguous.
  - `segmentIndex`: owning `mergedNarrativeSegments` segment index.
  - `sceneIndex`: shot `sceneIndex` when split; `null` when one line per whole segment.
  - `text`: current voiceover body (non-empty string).
- `fullScript`: all `text` joined by newlines for context (**read-only** — write back using `items` structure, not by parsing this string).

Output **one** JSON object; sole top-level key **`optimizedTexts`**, string array:

- Same length as input `items`; item `i` is the optimized body for `items[i]`.
- **Do not** echo `voiceoverOrder` / `segmentIndex` / `sceneIndex` (server merges by array order).
- Each item non-empty string; **per-locale line length** (same as step 160; punctuation included; trim not applied to length count; Unicode code points):
  - **`outputLocale` = `zh`**: max **80** code points per line.
  - **`outputLocale` = `en`**: max **18 words** and max **140** code points per line.

Do not introduce new characters or events; do not combine two lines into one (count unchanged).

Input (includes `outputLocale`):

{{PIPELINE_JSON}}
