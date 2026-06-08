## System

> **Root key**: output **only** `{ "subsceneSplitTimelineSegments": [ ... ] }`. No other top-level keys.

Split each input segment's long `narrative` into a **`narrative` string array** where each element = one independently filmable micro-event; first-person "I", cinematic; **no fabrication**; **do not drop facts**; no subjective evaluation lines (e.g. "excellent grades").

**`timeLabel`**: copy from the matching input `splitDedupedTimelineSegments[]` row (same `segmentIndex`); match input precision; if input is vague, stay vague; **do not** invent precise `YYYY-MM` unless input already provides it.

**`originalNarrative` / `title` / `relatedTemplateIds`**: **do not output**; server backfills from input by `segmentIndex`.

### Output shape (strict — invalid JSON will fail the pipeline)

1. Top level = **one JSON object** with the single key `subsceneSplitTimelineSegments`.
2. Value = **array of objects** — **every** item must be `{ segmentIndex, narrative, timeLabel }`.
3. `narrative` = **JSON array of strings** (`["line1", "line2"]`), never a single string.
4. `segmentIndex` = **integer** matching the input segment you split (same index as in `splitDedupedTimelineSegments`).
5. One input segment → **one output object** (put all split lines inside that object's `narrative` array). Do **not** emit one output object per split line unless you also split into separate input segments (you do not — keep one object per input `segmentIndex`).

**Forbidden** (will be rejected):

- Top-level array, or key `splitDedupedTimelineSegments` (step 80 name).
- `subsceneSplitTimelineSegments` items that are **plain strings** or **bare string arrays** — the split lines must live inside `narrative` on an **object**.
- Missing `segmentIndex`, `timeLabel`, or empty `narrative` array.
- `narrative` as a single string instead of string array.

**Bad** (array items are strings — invalid):

```json
{
  "subsceneSplitTimelineSegments": [
    "I was born in Chengdu.",
    "I attended primary school."
  ]
}
```

**Bad** (bare string array as item — invalid):

```json
{
  "subsceneSplitTimelineSegments": [
    ["I was born in Chengdu.", "I lived there until 1996."]
  ]
}
```

**Good**:

```json
{
  "subsceneSplitTimelineSegments": [
    {
      "segmentIndex": 1,
      "narrative": [
        "I was born in Chengdu.",
        "I lived there with my parents until leaving in August 1996."
      ],
      "timeLabel": "1992-08 to 1996-08"
    }
  ]
}
```

---

## User

For **each** row in input `splitDedupedTimelineSegments`, output **exactly one** object in `subsceneSplitTimelineSegments` with the same `segmentIndex`, a non-empty `narrative` string array (split micro-events), and `timeLabel` copied from that input row.

Return JSON only. No Markdown fences.

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
