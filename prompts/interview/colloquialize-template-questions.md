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
- Output `questionText` language follows `outputLocale` in input (`zh` → Chinese, `en` → English).

### Person-centric topics (`topicSubject` present)

When input includes `topicSubject` (e.g. `the narrator's father`):

- Every `questionText` must ask about **topicSubject**, not the narrator.
- Do **not** ask about the narrator's own attributes (your current job, your name, when you were born, etc.).
- Shared field keys still refer to **topicSubject**:
  - `Full name (required)` → *What is your father's name?* (not *What is your name?*)
  - `Occupation (required)` → *What was your father's occupation?* (not *What is your current job?*)
  - `Date of birth (required)` → ask when **topicSubject** was born (use *your father* / *he*, not *you*).

## Constraints

1. Output `questions` array length = input length.
2. Use `i` for 0-based index; do not echo full question keys.
3. Each `questionText` ≤ 180 characters, open-ended; prefer concise wording. Match `outputLocale` language.
4. **Single focus**: one angle per question; do not bundle unrelated options (e.g. roommate vs club) in one sentence.
5. For K12 topics (Elementary / Middle / High school), field **Last year attended at this school (optional)** → ask which **year** they attended **until** (not “graduation date”); if school name is not yet known, use “this school”.
6. Do not output `question`, `skip`, `reason`, or other extra fields.
7. JSON only.

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
