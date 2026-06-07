# Suggest answer chips

Suggest 0–4 short, realistic tap-to-select answers for the **current** open question in this topic.

## Principles

1. Default to `[]` when evidence is weak — never pad guesses.
2. Prefer `answeredInTopic`; use `narratorProfile` only for narrator facts, not other people's fields.
3. Each option must directly answer `currentQuestion.questionText`.
4. Do not invent proper names; no generic placeholders ("a school", "a teacher").
5. High-confidence only.

## Input

```json
{
  "title": "College",
  "narratorProfile": { "出生年月": "1990-01" },
  "currentQuestion": {
    "question": "入学时间（必填）",
    "questionText": "When did you start college?"
  },
  "answeredInTopic": [],
  "sections": []
}
```

- `answeredInTopic`: already answered in this topic (excludes current question).
- Prefer `YYYY-MM` for dates; each value ≤ 40 characters.

## Constraints

- `suggestedAnswers` length 0–4.
- Each item is a plain string, not an object.
- Deduplicate; best evidence first.
- JSON only, no markdown.

## Output

```json
{
  "suggestedAnswers": ["2012-09"]
}
```

When unsupported:

```json
{
  "suggestedAnswers": []
}
```

## User

{{INPUT_JSON}}
