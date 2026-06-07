/** Life-memory semantic domains for Tier4 prompt topicMap (canonical English). */
export type HotTopicDomain = {
  domainId: string;
  domainName: string;
  semanticScope: string[];
  memoryAngles: string[];
  tone: string[];
  avoid: string[];
};

const DOMAINS: HotTopicDomain[] = [
  {
    domainId: "daily_life",
    domainName: "Daily life",
    semanticScope: ["food and clothing", "household roles", "daily rhythm", "material conditions"],
    memoryAngles: ["concrete scenes", "era change", "personal feeling", "people interactions"],
    tone: ["natural", "gentle"],
    avoid: ["shaming poverty", "privacy pressure"],
  },
  {
    domainId: "local_customs",
    domainName: "Local customs",
    semanticScope: ["local rituals", "festivals", "life ceremonies", "folk rules"],
    memoryAngles: ["process memory", "who took part", "generational change"],
    tone: ["nostalgic", "respectful"],
    avoid: ["forcing detail", "privacy pressure"],
  },
  {
    domainId: "era_change",
    domainName: "Era and change",
    semanticScope: ["material conditions", "social climate", "education access", "transport and comms"],
    memoryAngles: ["before/after contrast", "personal feeling", "choices and turns"],
    tone: ["gentle", "objective"],
    avoid: ["political baiting", "shaming poverty"],
  },
  {
    domainId: "family",
    domainName: "Family relationships",
    semanticScope: ["parent-child time", "siblings", "elders' influence", "house rules"],
    memoryAngles: ["concrete scenes", "people interactions", "personal feeling"],
    tone: ["gentle", "easy to answer"],
    avoid: ["family conflict pressure", "privacy pressure"],
  },
  {
    domainId: "school_youth",
    domainName: "School and youth",
    semanticScope: ["classmates", "teachers", "clubs and play", "young feelings"],
    memoryAngles: ["concrete scenes", "light anecdotes", "first times"],
    tone: ["light", "natural"],
    avoid: ["minors sensitive content", "privacy pressure"],
  },
  {
    domainId: "work_money",
    domainName: "Work and money",
    semanticScope: ["first income", "spending pressure", "career choice", "financial independence"],
    memoryAngles: ["concrete scenes", "era change", "choices and turns"],
    tone: ["gentle", "non-judgmental"],
    avoid: ["income shaming", "privacy pressure"],
  },
  {
    domainId: "love_marriage",
    domainName: "Love and marriage",
    semanticScope: ["how you met", "subtle expression", "relationship adjustment", "partner stories"],
    memoryAngles: ["light anecdotes", "personal feeling", "concrete scenes"],
    tone: ["light", "allow opt-out"],
    avoid: ["creating pressure", "privacy pressure"],
  },
  {
    domainId: "housing_migration",
    domainName: "Housing and migration",
    semanticScope: ["moving", "urban/rural change", "renting and buying", "neighborhood"],
    memoryAngles: ["concrete scenes", "era change", "personal feeling"],
    tone: ["natural", "gentle"],
    avoid: ["privacy pressure"],
  },
  {
    domainId: "entertainment",
    domainName: "Entertainment and pop culture",
    semanticScope: ["childhood games", "film and music", "fads", "leisure"],
    memoryAngles: ["concrete scenes", "light anecdotes", "era change"],
    tone: ["light", "nostalgic"],
    avoid: ["value judgment"],
  },
  {
    domainId: "body_labor",
    domainName: "Body and labor",
    semanticScope: ["physical work", "household skills", "exercise habits", "hardship"],
    memoryAngles: ["concrete scenes", "personal feeling"],
    tone: ["respectful", "gentle"],
    avoid: ["medical detail", "shaming"],
  },
  {
    domainId: "life_choices",
    domainName: "Life choices and turns",
    semanticScope: ["independent decisions", "risk and opportunity", "proud or regretful choices"],
    memoryAngles: ["choices and turns", "personal feeling", "concrete scenes"],
    tone: ["gentle", "non-judgmental"],
    avoid: ["trial-style questioning"],
  },
];

/** For LLM input topicMap. */
export function hotTopicMapForPrompt(): HotTopicDomain[] {
  return DOMAINS.map(({ domainId, domainName, semanticScope, memoryAngles, tone, avoid }) => ({
    domainId,
    domainName,
    semanticScope,
    memoryAngles,
    tone,
    avoid,
  }));
}

export function allowedHotTopicDomainIds(): Set<string> {
  return new Set(DOMAINS.map((d) => d.domainId));
}

export function hotTopicDomainNameById(domainId: string): string | undefined {
  return DOMAINS.find((d) => d.domainId === domainId)?.domainName;
}

export function hotTopicDomainIdByName(domainName: string): string | undefined {
  const t = domainName.trim();
  if (!t) return undefined;
  return DOMAINS.find((d) => d.domainName === t)?.domainId;
}
