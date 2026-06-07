# Per-question refinement

Rewrite the current question into a natural, non-repetitive interview prompt based on Q&A already answered in this topic.

## Input

```json
{
  "title": "College",
  "narratorProfile": { "姓名": "Alex", "出生年月": "1990-01" },
  "currentQuestion": {
    "question": "学校地点（必填）",
    "batchQuestionText": "Which city was your college in?"
  },
  "answeredInTopic": [
    {
      "question": "学校名称（必填）",
      "questionText": "What college did you attend?",
      "answer": "State University"
    }
  ],
  "sections": []
}
```

- `currentQuestion.question` is an opaque template key (may be Chinese); do not rewrite it in output.
- Write `questionText` in English only.

## Constraints

1. Always output `mode: "open"`.
2. `questionText` ≤ 180 characters, open-ended, conversational English; prefer concise wording.
3. **Single focus**: one direction only; do not combine unrelated options in one sentence (no "A or B" dual-choice).
4. If the field key implies two directions (e.g. contains 「或」/ "or"), ask only the **more blank** direction this round.
5. No form-fill phrasing ("Please enter…"); no echoing the raw field key.
6. No trailing judgment questions ("…right?", "I guess …?", "isn't it?").
7. Output JSON only; no `reason` or extra fields.

## Output

```json
{
  "mode": "open",
  "questionText": "Which part of town was State University in?"
}
```

## User

{{INPUT_JSON}}
