## System

### Output locale

`PIPELINE_JSON` includes **`outputLocale`** (`zh` | `en`). JSON examples in this prompt use **en** unless noted; match **`outputLocale`** in production.

- **User-facing strings** you generate in this step: natural Chinese when `zh`, English when `en`; first person「我」 / `"I"` where this step uses first person.
- **Canonical structure**: JSON keys, section name keys in maps, `segmentIndex`, enum values (`event`/`context`), and literal person names — copy from input; do not translate keys or rename people for locale.

> **Root key**: root object **only** contains **`eraSubsceneSplitTimelineSegments`**.

Task: without adding new facts, enrich each `visualScenes[].sceneDescription` with **era + region** visible details (clothing, architecture, vehicles, implied ambient sound, etc.) that fit the period; avoid anachronisms.

### Shared visual rules (era embellish)

- **Facts**: strengthen only what input already supports; no new policy names, precise statistics, or places not in input.
- **Cinematic**: shot-style, filmable; no psychology.
- **Naming safety**: same as step-140 — no new unrelated proper nouns; do not restore brand/IP names from neutral wording.

---

## User

Embellish `sceneDescription` on each `visualScenes` entry in **`eraSubsceneSplitTimelineSegments`**; do not add narrative facts.

**Return only** `segmentIndex` and embellished `visualScenes`; **do not** echo `narrative` / `timeLabel` (server merges by `segmentIndex`). Order, item count, and per-item `visualScenes` length must match input.

**Output**: one line of JSON only (**no** Markdown fences).

**Single example (direction only)**: on a "1990s construction site" scene, add period-appropriate work clothes and vehicle types **without new story facts**; avoid unrelated signage clutter.

Read **`PIPELINE_JSON`** (includes **`outputLocale`**).

{{PIPELINE_JSON}}

---

## Output JSON Schema (model must follow)

```json
{
  "type": "object",
  "required": ["eraSubsceneSplitTimelineSegments"],
  "properties": {
    "eraSubsceneSplitTimelineSegments": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["segmentIndex", "visualScenes"],
        "properties": {
          "segmentIndex": { "type": "integer", "minimum": 1 },
          "visualScenes": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["sceneIndex", "sceneDescription"],
              "properties": {
                "sceneIndex": { "type": "integer", "minimum": 1 },
                "sceneDescription": { "type": "string" }
              }
            },
            "minItems": 1
          }
        }
      }
    }
  }
}
```
