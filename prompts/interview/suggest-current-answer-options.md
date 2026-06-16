# Suggest answer chips

Suggest 0–4 short, realistic tap-to-select answers for the **current** open question in this topic. Applies to **every** catalog subcategory (`title`); do not special-case one school stage.

## Two modes (use either or both)

### 1. Inference mode (existing)

Use when `narratorProfile`, `answeredInTopic`, or `sections` support a **specific** factual guess (e.g. birth year → plausible enrollment `YYYY-MM`).

- Default to `[]` when evidence is weak — never pad guesses.
- Prefer `answeredInTopic`; use `narratorProfile` only for narrator facts, not other people's fields.
- For person-centric sections (`topicSubject` in input when present), do not infer the narrator's occupation or other narrator-only facts for chips about a relative/partner/child.
- High-confidence only for inferred values.

### 2. Structural mode (closed set)

Use when the **question itself** defines a **small closed set** of category labels, even if you cannot infer which label is correct for this narrator.

Signals (any subcategory):

- Template key contains explicit scales: `poor/average/excellent`, `increased or decreased`, etc.
- Template key or `questionText` presents **mutually exclusive categories** (e.g. boarding vs day student, arts vs science track).
- Refined `questionText` asks “A or B?” where A and B are **types**, not proper names.

Output 2–4 **short category labels** matching those branches. Language follows `outputLocale` (zh: e.g. `寄宿/走读`, `差/一般/优秀`).

**Note:** Output examples below use **en** labels; match `outputLocale` in production.

**Do NOT use structural mode when:**

- The answer is a proper name, place, school, date you must invent, or free narrative.
- Key “A or B” means “ask about **one** of these open directions this round” (e.g. playmates **or** friends, roommate **or** club, homeroom **or** memorable teacher) — return `[]` or at most one vague chip, **never** `[A, B]` as if the user must pick the dimension.

## Principles (both modes)

1. Each option must directly answer `currentQuestion.questionText`.
2. Do not invent proper names; no generic placeholders ("a school", "a teacher").
3. Prefer `YYYY-MM` for inferred dates.
4. Aim for ≤ **28 characters** per chip; hard max **80** (drop or omit options that cannot fit faithfully).

### Year-month mode (`currentQuestion.fieldType` = `yearMonth`)

When the field is a **year-month picker** (answers stored as `YYYY-MM`):

- Output **0–4** strings, each **must be** a valid **`YYYY-MM`** (e.g. `2019-03`, `2012-09`).
- Infer concrete months from `narratorProfile`, `answeredInTopic`, or `sections`; list multiple distinct dates when supported.
- **Do not** output narrative time phrases (e.g.「大学的时候」「2019年和陈灿认识后」「工作之后」) — they fail validation.
- If month cannot be inferred with reasonable confidence → `[]`.

Example:

```json
{ "suggestedAnswers": ["2012-09", "2019-03"] }
```

## Input

```json
{
  "title": "Middle school",
  "narratorProfile": { "出生年月": "1990-01" },
  "currentQuestion": {
    "question": "Enrollment date (required)",
    "questionText": "When did you start middle school?",
    "fieldType": "yearMonth"
  },
  "answeredInTopic": [
    {
      "question": "School name (required)",
      "questionText": "What middle school did you attend?",
      "answer": "Duanji Middle School"
    }
  ],
  "sections": []
}
```

- `answeredInTopic`: already answered in this topic (excludes current question).

## Constraints

- `suggestedAnswers` length 0–4.
- Each item is a plain string, not an object.
- Deduplicate; inference-based options first, then structural labels.
- JSON only, no markdown.

## Output examples

Inference:

```json
{ "suggestedAnswers": ["2012-09"] }
```

Structural (no profile evidence needed):

```json
{ "suggestedAnswers": ["Boarding", "Day student"] }
```

```json
{ "suggestedAnswers": ["Poor", "Average", "Excellent"] }
```

When unsupported:

```json
{ "suggestedAnswers": [] }
```

## User

{{INPUT_JSON}}
