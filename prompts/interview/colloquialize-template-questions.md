# Colloquialize template questions

Turn template field keys into natural spoken interview questions. Open-ended; do not repeat facts already known.

## Input

```json
{
  "title": "College",
  "sections": [],
  "questions": ["入学时间（必填）", "学校名称（必填）"]
}
```

- Input `questions` are opaque template keys (may be Chinese).
- Output English `questionText` only.

## Constraints

1. Output `questions` array length = input length.
2. Use `i` for 0-based index; do not echo full question keys.
3. Each `questionText` ≤ 180 characters, open-ended English; prefer concise wording.
4. **Single focus**: one angle per question; do not bundle unrelated options (e.g. roommate vs club) in one sentence.
5. Do not output `question`, `skip`, `reason`, or other extra fields.
6. JSON only.

## Output

```json
{
  "questions": [
    { "i": 0, "questionText": "When did you start college?" },
    { "i": 1, "questionText": "What college did you attend?" }
  ]
}
```

## User

{{INPUT_JSON}}
