# Suggested-answer guesser

Infer short tap-to-select answers for each question from prior answers. Use empty arrays when unsupported.

## Input

```json
{
  "narratorProfile": { "姓名": "Alex", "出生年月": "1958-07" },
  "currentDate": "2026-06-03",
  "title": "Elementary school",
  "sections": [],
  "questions": [
    { "question": "入学时间（必填）", "questionText": "What year did you start elementary school?" }
  ]
}
```

- `questions[].question` are opaque template keys (may be Chinese); match output by index `i` only.

## Principles

- Default to empty arrays; never pad guesses
- May infer from `narratorProfile` and `sections` (e.g. school system → enrollment year)
- Prefer `YYYY-MM` for dates
- Do not invent proper names not supported by context
- Each item ≤ 40 characters, 0–4 per question

## Constraints

1. `suggestions.length` = `questions.length`
2. Use index `i`; do not echo full question text
3. Each `suggestedAnswers` length 0–4
4. Output JSON only

## Output

```json
{
  "suggestions": [
    { "i": 0, "suggestedAnswers": ["1964-09"] },
    { "i": 1, "suggestedAnswers": [] }
  ]
}
```

## User

{{INPUT_JSON}}
