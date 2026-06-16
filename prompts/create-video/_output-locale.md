# create-video — Output locale convention

All steps that call the LLM via `buildVideoLlmMessages` share this block in the prompt **System** section (copy verbatim; adjust **This step only** when needed).

## Standard block

```markdown
### Output locale

`PIPELINE_JSON` includes **`outputLocale`** (`zh` | `en`). JSON examples in this prompt use **en** unless noted; match **`outputLocale`** in production.

- **User-facing strings** you generate in this step: natural Chinese when `zh`, English when `en`; first person「我」 / `"I"` where this step uses first person.
- **Canonical structure**: JSON keys, section name keys in maps, `segmentIndex`, enum values (`event`/`context`), and literal person names — copy from input; do not translate keys or rename people for locale.
```

Add one bullet when the step is special:

| Step | **This step only** |
|------|---------------------|
| step-10 (both) | Missing-time marker: `Date unknown: …` (`en`) or `日期未知：…` (`zh`). Polished map **keys** stay English section names. |
| step-20 | Era macro snippets: **group-level** voice (not first-person `I`); language still follows `outputLocale`. |
| step-30, 40 | Era backdrop: **objective** group voice (no `I`); language follows `outputLocale`. |
| step-60 | **No user prose**; output only `segmentKindById` with values `event` or `context`. |
| step-130 | `{from,to}` unify spellings for the **same person**; do not translate personal names. |
| step-150 | **Merge order only** (`kind`, `segmentIndex`); no narrative or scene copy. |
| step-160 alignment | **QA only**; `reason` follows `outputLocale`; do not rewrite voiceover. |
| step-190 | Keep prefixes `Face close-up:` and `Wardrobe close-up:`; descriptive prose after each follows `outputLocale`. |
| step-230 | **`signageLines` always short Chinese** (≤12 chars) for on-image text-to-image, regardless of `outputLocale`. |

## Non-LLM steps (no block)

- `step-200_visual-expand.md` — string replace only
- `step-240_text-to-image-direct.md` — no LLM; on-image Chinese is a render rule

## Code

Runtime injection duplicates this in `systemWithOutputLocale` (`interviewOutputLocale.ts`); prompts and code stay in sync by convention.
