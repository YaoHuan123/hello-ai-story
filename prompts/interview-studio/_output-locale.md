# interview-studio — Output locale convention

Steps that call the LLM via `buildStudioLlmMessages` share this block in the prompt **System** section.

## Standard block

```markdown
### Output locale

`PIPELINE_JSON` / `TURN_PAYLOAD_JSON` includes **`outputLocale`** (`zh` | `en`). JSON examples use **en** unless noted; match **`outputLocale`** in production.

- **User-facing strings** you generate (`turns[].text` or rewritten `text`): natural Chinese when `zh`, English when `en`.
- **Guest** lines: first person「我」 / `"I"`; **host** lines: interviewer tone (no first-person biography voice).
- **Canonical structure**: JSON keys and `speaker` enum (`host` / `guest`) — copy exactly; do not translate keys or role names.
```

| Step | **This step only** |
|------|---------------------|
| studio-10 | Script generation; at least 6 turns with both speakers; max 120 chars per `text`. |
| studio-20 | Duration-align rewrite only; preserve facts and locale; output sole key `text`. |

## Code

Runtime injection: `buildStudioLlmMessages` + `systemWithOutputLocale` (`interviewOutputLocale.ts`). Pipeline wrapped in `runWithDisplayLocale(getInterviewDisplayLocale(scope))`.
