import fs from "fs";
import path from "path";

const dir = path.join(process.cwd(), "..", "prompts", "create-video");

const SKIP = new Set([
  "_output-locale.md",
  "step-200_visual-expand.md",
  "step-240_text-to-image-direct.md",
]);

const STEP_ONLY = {
  "step-10_material-polish.md":
    "Missing-time marker: `Date unknown: …` when `en`; `日期未知：…` when `zh`. Polished map **keys** stay English section names.",
  "step-10_story-article-to-sections.md":
    "Missing-time / empty-section markers: `Date unknown: …` (`en`) or `日期未知：…` (`zh`). Polished map **keys** stay English section names.",
  "step-20_era-backdrop-segments.md":
    "Era macro snippets use **group-level** voice (not first-person `I`); language still follows `outputLocale`.",
  "step-30_era-subscene-split.md":
    "Era backdrop: **objective** group voice (no first-person `I`); language follows `outputLocale`.",
  "step-40_era-env-narrative-pack.md":
    "Era backdrop: **objective** group voice (no first-person `I`); language follows `outputLocale`.",
  "step-60_classify.md":
    "**No user prose**; output only `segmentKindById` with values `event` or `context`.",
  "step-130_name-unify.md":
    "`{from,to}` pairs unify spellings for the **same person**; do not translate personal names.",
  "step-150_merge-env-and-era-ai.md":
    "**Merge order only** (`kind`, `segmentIndex`); no narrative or scene copy.",
  "step-160_voiceover-post-alignment.md":
    "**QA only**; `reason` follows `outputLocale`; do not rewrite voiceover lines.",
  "step-190_visual-create.md":
    "Keep prefixes `Face close-up:` and `Wardrobe close-up:`; descriptive prose after each follows `outputLocale`.",
  "step-230_geo-signage-reference.md":
    "**`signageLines` always short Chinese** (≤12 chars) for on-image text-to-image, regardless of `outputLocale`.",
};

function localeBlock(stepOnly) {
  let s = `### Output locale

\`PIPELINE_JSON\` includes **\`outputLocale\`** (\`zh\` | \`en\`). JSON examples in this prompt use **en** unless noted; match **\`outputLocale\`** in production.

- **User-facing strings** you generate in this step: natural Chinese when \`zh\`, English when \`en\`; first person「我」 / \`"I"\` where this step uses first person.
- **Canonical structure**: JSON keys, section name keys in maps, \`segmentIndex\`, enum values (\`event\`/\`context\`), and literal person names — copy from input; do not translate keys or rename people for locale.`;
  if (stepOnly) s += `\n- **This step only**: ${stepOnly}`;
  return s;
}

/** Remove scattered locale lines superseded by the standard block. */
function dedupeLocaleLines(content) {
  return content
    .replace(
      /\n3\. \*\*Language\*\*: polished \*\*values\*\* follow[^\n]+\n/g,
      "\n",
    )
    .replace(
      /\n> \*\*Language\*\*: all `envVoiceovers`[^\n]+\n/g,
      "\n",
    )
    .replace(
      /\n- \*\*Language\*\*: each `sceneDescription` follows[^\n]+\n/g,
      "\n",
    )
    .replace(
      / \*\*`optimizedTexts` language follows `outputLocale`\*\*[^\n]+/g,
      "",
    )
    .replace(
      /; \*\*`narrative` language follows `outputLocale`\*\*[^\n]+/g,
      "",
    )
    .replace(
      /; \*\*`narrative` language follows `outputLocale`\*\*\.[^\n]*/g,
      ".",
    )
    .replace(
      / first-person cinematic \(`I` \/ \*\*「我」\*\* per \*\*`outputLocale`\*\*\)/g,
      " first-person cinematic narrative",
    )
    .replace(
      / first-person cinematic \(`I` \/ \*\*「我」\*\* per \*\*`outputLocale`\*\*\)/g,
      " first-person cinematic",
    )
    .replace(
      /; overall \*\*first-person\*\* delivery \(`I` \/ \*\*「我」\*\* per `outputLocale`\)\./,
      "; overall **first-person** delivery.",
    )
    .replace(
      / \*\*`sceneDescription` language follows `outputLocale`\*\* in input\./g,
      ".",
    )
    .replace(
      /; \*\*`narrative` language follows `outputLocale`\*\*\. \*\*Do not\*\*/g,
      "; **Do not**",
    )
    .replace(
      /, `reason` \(short; language follows `outputLocale` when present\)/g,
      ", `reason` (short)",
    )
    .replace(/\n\n\n+/g, "\n\n");
}

for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".md"))) {
  if (SKIP.has(name)) continue;
  const file = path.join(dir, name);
  let c = fs.readFileSync(file, "utf8");
  if (c.includes("### Output locale")) {
    console.log("skip (has block)", name);
    continue;
  }

  const block = localeBlock(STEP_ONLY[name] ?? "");
  let inserted = false;

  if (c.includes("## System")) {
    c = c.replace(/(## System\r?\n\r?\n)/, `$1${block}\n\n`);
    inserted = true;
  } else if (c.includes("## User")) {
    c = c.replace(/(## User\r?\n\r?\n)/, `${block}\n\n---\n\n## User\n\n`);
    inserted = true;
  } else {
    c = `${block}\n\n---\n\n${c}`;
    inserted = true;
  }

  if (inserted) {
    c = dedupeLocaleLines(c);
    // Normalize User line to mention outputLocale once
    if (!c.includes("includes `outputLocale`") && c.includes("{{PIPELINE_JSON}}")) {
      c = c.replace(
        /(\{\{PIPELINE_JSON\}\})/,
        "Read **`PIPELINE_JSON`** (includes **`outputLocale`**).\n\n$1",
      );
    }
    fs.writeFileSync(file, c, "utf8");
    console.log("patched", name);
  }
}

console.log("done");
