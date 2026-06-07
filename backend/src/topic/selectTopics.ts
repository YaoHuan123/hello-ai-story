import { recommendTier1 } from "./recommendTier1";
import { recommendTier2 } from "./recommendTier2";
import { recommendTier3 } from "./recommendTier3";
import { recommendTier4 } from "./recommendTier4";
import { recommendTier5 } from "./recommendTier5";
import { recommendTier6 } from "./recommendTier6";
import { recommendTier7 } from "./recommendTier7";
import { recommendTier8 } from "./recommendTier8";
import { toPendingRow } from "./pendingPickRow";
import type {
  AnsweredSection,
  GeneratedTopicPick,
  HotTopicPick,
  PendingPickRow,
  TopicRecommendation,
} from "./types";

/** 统一选题入参：按 `tier` 区分可用字段。 */
export type SelectTopicsParams =
  | { tier: 1; sections: AnsweredSection[] }
  | { tier: 2; sections: AnsweredSection[]; maxPicks?: number }
  | { tier: 3; sections: AnsweredSection[]; maxPicks?: number }
  | { tier: 4; sections: AnsweredSection[]; maxPicks?: number }
  | { tier: 5; sections: AnsweredSection[] }
  | { tier: 6; sections: AnsweredSection[] }
  | { tier: 7; sections: AnsweredSection[] }
  | { tier: 8; sections: AnsweredSection[] };

function fromCatalog(tier: 1 | 2, rec: TopicRecommendation): PendingPickRow {
  return toPendingRow({
    tier,
    kind: "catalog",
    title: rec.name,
    reason: rec.reason,
  });
}

function fromGenerated(pick: GeneratedTopicPick): PendingPickRow {
  return toPendingRow(
    {
      tier: 3,
      kind: "generated",
      title: pick.title,
      reason: pick.reason,
    },
    { questions: pick.questions },
  );
}

function fromHotTopic(pick: HotTopicPick): PendingPickRow {
  return toPendingRow(
    {
      tier: 4,
      kind: "hot_topic",
      title: pick.q,
      reason: `Life memory: ${pick.domainName}`,
    },
    {
      suggestedAnswers:
        pick.suggestedAnswers.length > 0 ? pick.suggestedAnswers : undefined,
    },
  );
}

export async function selectTopics(params: SelectTopicsParams): Promise<PendingPickRow[]> {
  switch (params.tier) {
    case 1: {
      const rec = await recommendTier1({ sections: params.sections });
      return [fromCatalog(1, rec)];
    }
    case 2: {
      const recs = await recommendTier2({
        sections: params.sections,
        maxPicks: params.maxPicks,
      });
      return recs.map((r) => fromCatalog(2, r));
    }
    case 3: {
      const picks = await recommendTier3({
        sections: params.sections,
        maxPicks: params.maxPicks,
      });
      return picks.map(fromGenerated);
    }
    case 4: {
      const picks = await recommendTier4({
        sections: params.sections,
        maxPicks: params.maxPicks,
      });
      return picks.map(fromHotTopic);
    }
    case 5:
      return recommendTier5({ sections: params.sections });
    case 6:
      return recommendTier6({ sections: params.sections }).then((picks) =>
        picks.map((p) => toPendingRow(p)),
      );
    case 7:
      return recommendTier7({ sections: params.sections }).then((picks) =>
        picks.map((p) => toPendingRow(p)),
      );
    case 8:
      return recommendTier8({ sections: params.sections }).then((picks) =>
        picks.map((p) => toPendingRow(p)),
      );
    default: {
      const exhaustive: never = params;
      throw new Error(`TOPIC_INVALID_TIER: ${JSON.stringify(exhaustive)}`);
    }
  }
}
