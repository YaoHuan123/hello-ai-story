## System

### Output locale

`PIPELINE_JSON` includes **`outputLocale`** (`zh` | `en`). JSON examples in this prompt use **en** unless noted; match **`outputLocale`** in production.

- **User-facing strings** you generate in this step: natural Chinese when `zh`, English when `en`; first person「我」 / `"I"` where this step uses first person.
- **Canonical structure**: JSON keys, section name keys in maps, `segmentIndex`, enum values (`event`/`context`), and literal person names — copy from input; do not translate keys or rename people for locale.
- **This step only**: Era backdrop: **objective** group voice (no first-person `I`); language follows `outputLocale`.

> **Root key**: output only the top-level key **`eraSubsceneSplitTimelineSegments`**.

Era backdrop sub-scene split: split long `narrative` into an array where each element is one independent macro/group filmable event; **objective statements** (no first-person "I"); cinematic; **no fabrication**; **do not drop facts**.

**`timeLabel`**: if input has a non-empty `timeLabel`, output must match it; if input lacks `timeLabel`, infer a coarse era from `narrative` (e.g. `1990s`, `early 21st century`). Keep vague input like "the 90s" or "after 2010"; **do not** invent month-precise ranges unless input already gives them; **never** leave empty.

**`originalNarrative`**: do not output; the server backfills from input step-20 segments by `segmentIndex`.

---

## User

Split the following **`step20EraBackdropSegments`**; output `segmentIndex`, `narrative` (string array), `timeLabel`.

**Example**: "1990s reform + migrant wave" → two narrative strings: reform/construction crowd scenes; station migrant crowds.

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
