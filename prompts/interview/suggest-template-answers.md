# Suggested-answer guesser

Infer short tap-to-select answers for **each** template question in this subcategory. Use empty arrays when unsupported. Same **inference + structural** rules as per-question suggest (all catalog `title` values).

## Input

```json
{
  "narratorProfile": { "姓名": "Alex", "出生年月": "1958-07" },
  "currentDate": "2026-06-03",
  "title": "High school",
  "sections": [],
  "questions": [
    { "question": "Enrollment date (required)", "questionText": "When did you start high school?" },
    { "question": "Academic performance (optional, poor/average/excellent)", "questionText": "How were your grades in high school?" }
  ]
}
```

- `questions[].question` are opaque template keys (may be Chinese); match output by index `i` only.

## Principles

### Inference mode

- May infer from `narratorProfile` and `sections` (e.g. school system → enrollment year).
- Default to `[]` when evidence is weak; never pad guesses.
- Do not invent proper names not supported by context.
- Prefer `YYYY-MM` for dates.

### Structural mode

- When a template key or `questionText` defines a **closed category set** (e.g. `poor/average/excellent`, boarding vs day student, arts/science track, income increased/decreased), output 2–4 **short labels** for those categories even without profile evidence. Language follows `outputLocale`.
- **Not** for open “A or B direction” keys (playmates or friends, roommate or club, homeroom or teacher) — those stay `[]` at batch time unless inference applies.
- **Not** for names, places, or free-text fields.

### Length

- Aim ≤ **28 characters** per item; hard max **80** (omit options that cannot fit).

## Constraints

1. `suggestions.length` = `questions.length`
2. Use index `i`; do not echo full question text
3. Each `suggestedAnswers` length 0–4
4. Output JSON only

## Output

```json
{
  "suggestions": [
    { "i": 0, "suggestedAnswers": ["1978-09"] },
    { "i": 1, "suggestedAnswers": ["Poor", "Average", "Excellent"] }
  ]
}
```

## User

{{INPUT_JSON}}
