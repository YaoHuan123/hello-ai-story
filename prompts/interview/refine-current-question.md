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
- Write `questionText` in the language of `outputLocale` (`zh` → Chinese, `en` → English).

### Person-centric topics (`topicSubject` present)

When input includes `topicSubject` (e.g. `the narrator's father`):

- Refine must keep the question about **topicSubject**, not the narrator.
- Do **not** rewrite into narrator-centric phrasing (your current job, your name, when you were born).
- Shared keys like `Occupation (required)` / `Full name (required)` refer to **topicSubject** in this section.

## Constraints

1. Always output `mode: "open"`.
2. `questionText` ≤ 180 characters, open-ended, conversational; language follows `outputLocale`; prefer concise wording.
3. **Single focus**: one direction only; do not combine unrelated options in one sentence (no "A or B" dual-choice).
4. If the field key implies two directions (e.g. contains 「或」/ "or"), ask only the **more blank** direction this round.
5. For K12 topics (Elementary / Middle / High school), when refining **Last year attended at this school (optional)** and `answeredInTopic` includes the school name, ask: **“What year did you attend [School Name] until?”** (year only, not graduation month).
6. No form-fill phrasing ("Please enter…"); no echoing the raw field key.
7. No trailing judgment questions ("…right?", "I guess …?", "isn't it?").
8. Output JSON only; no `reason` or extra fields.

## Output

```json
{
  "mode": "open",
  "questionText": "Which part of town was State University in?"
}
```

## User

{{INPUT_JSON}}
