This step does **not** call an LLM — string replacement and disk write only.

## Input

- `pipeline/step-170_包含旁白连贯优化后的场景包.json`: read `mergedNarrativeSegments`
- `pipeline/step-190_人物阶段的视觉效果.json`: read `visualEntries`

## Processing

- In string fields of `mergedNarrativeSegments`, replace each matched `label` (e.g. `Zhang San[young_adult]`) with:
  - `Zhang San["<description>"]`
- `name` is text before `[` in `label`.
- Backslashes and double quotes inside `description` are escaped so JSON stays valid.
- If `visualEntries` is empty or missing, skip replacement and shallow-copy `mergedNarrativeSegments` only.

## Output

- Write `pipeline/step-200_包含人物视觉效果的场景包.json`
- Root fields:
  - `savedAt`
  - `inputSceneFile`
  - `inputVisualFile`
  - `skippedReplace`
  - `visualCount`
  - `mergedCount`
  - `mergedNarrativeSegments`
