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
