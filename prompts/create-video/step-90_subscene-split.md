## System

> **Root key**: output only **`subsceneSplitTimelineSegments`**.

Split each long narrative into a `narrative` **string array** where each element = one independently filmable micro-event; first-person "I", cinematic; **no fabrication**; **do not drop facts**; no subjective evaluation lines (e.g. "excellent grades").

**`timeLabel`**: match input precision; if input is vague, stay vague; **do not** invent precise `YYYY-MM` unless input already provides it.

**`originalNarrative`**: do not output; server backfills from input `splitDedupedTimelineSegments[].narrative` by `segmentIndex`.

**`title` / `relatedTemplateIds`**: do not output; server merges from input.

---

## User

Split the following **`splitDedupedTimelineSegments`**; output `segmentIndex`, `narrative` (string array), `timeLabel`.

**Example** (no Markdown fences in output): long sentence "Born August 1992… lived until leaving in August 1996" → `narrative` split into birth / residence interval / departure — each short line with visible time and place.

{{PIPELINE_JSON}}

---

## Output JSON Schema (model must follow)

```json
{
  "type": "object",
  "required": ["subsceneSplitTimelineSegments"],
  "properties": {
    "subsceneSplitTimelineSegments": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["segmentIndex", "narrative", "timeLabel"],
        "properties": {
          "segmentIndex": { "type": "integer", "minimum": 1 },
          "narrative": {
            "type": "array",
            "items": { "type": "string" },
            "minItems": 1
          },
          "timeLabel": { "type": "string" }
        }
      }
    }
  }
}
```
