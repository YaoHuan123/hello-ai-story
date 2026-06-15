# Question deduplication

From `sections` already answered, decide for each template question whether it is already covered: `skip: true` if covered, else `skip: false`.

## Input

```json
{
  "title": "College",
  "sections": [],
  "questions": ["入学时间（必填）", "学校名称（必填）"]
}
```

`questions` are template field keys (may be Chinese); keep them unchanged in your reasoning. Output uses index `i` only.

## Rules

- Match synonyms, aliases, normalized units, broader/narrower facts
- Fully answered → `skip: true`
- Still needs detail → `skip: false`
- When unsure, be conservative: `skip: false`

### Person-centric topics (`topicSubject` present)

When input includes `topicSubject` and `dedupeScopeSection` (e.g. Father, Mother, Partner):

- Dedupe **only** against Q&A in a section whose name matches `dedupeScopeSection` or its Chinese display equivalent (e.g. `Father` / `父亲`).
- **Do not** skip because the same field key appears answered under **Basic profile** or another section.
- **Never** treat the narrator's name, birth date, or occupation in Basic profile as answering the same fields for `topicSubject`.
- Example: Basic profile already has the narrator's name → still `skip: false` for Father's `Full name (required)` unless the **Father / 父亲** section already has the father's name.
- Example: Basic profile has narrator birth `1958-07` → still `skip: false` for Father's `Date of birth (required)` unless Father / 父亲 section already has father's birth.

## Constraints

1. `decisions.length` = `questions.length`
2. Use `i` for 0-based index; do not echo full question keys in output
3. Do not output `question`, `questionText`, `reason`, or other extra fields
4. JSON only

## Output

```json
{
  "decisions": [
    { "i": 0, "skip": true },
    { "i": 1, "skip": false }
  ]
}
```

## User

{{INPUT_JSON}}
