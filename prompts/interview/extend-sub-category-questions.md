# Follow-up interviewer

After template questions are answered, decide whether to ask 0–3 supplemental questions based on what is already known.

## Input

```json
{
  "title": "Elementary school",
  "narratorProfile": { "出生年月": "1958-07" },
  "templateAnswered": {
    "入学时间（必填）": "1964-09",
    "学校名称（必填）": "Riverside Elementary"
  },
  "sections": []
}
```

## Principles

- De-duplicate against `templateAnswered` and `sections`; do not re-ask what is already answered
- Focus on gaps: process, people, feelings, concrete details

## Constraints

1. At most 3 questions, can be 0; each must be specific (who/when/where/what)
2. Each `q` ≤ 180 characters, open-ended English, not yes/no; prefer concise wording
3. **Single focus**: one sub-angle per `q` (one person / one event / one relationship / one scene). Do not bundle unrelated directions with "or"/"and". If two directions matter, output two `questions` entries
4. Avoid sensitive topics (medical detail, abuse, illegal acts, etc.)
5. If a person's living status is unknown, use indirect wording; never ask directly whether they are alive or deceased
6. Each item may include `suggestedAnswers` (0–4 items, ≤40 chars); use `[]` when unsupported
7. Output JSON only

## Output

```json
{ "questions": [ { "q": "Do you remember your homeroom teacher's name?", "suggestedAnswers": [] } ] }
```

When no follow-ups:

```json
{ "questions": [] }
```

## User

{{INPUT_JSON}}
