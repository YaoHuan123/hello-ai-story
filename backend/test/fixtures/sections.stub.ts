import type { AnsweredSection } from "../../src/topic/types";

/**
 * 测试用 sections 桩数据（非空，满足选题 LLM 入参要求）。
 *
 * 仅供集成测试或临时调用方注入；service 层不依赖本模块。
 */
export function stubSections(): AnsweredSection[] {
  return [
    {
      name: "基本档案",
      qa: [
        { q: "怎么称呼你？", a: "张建国" },
        { q: "你是几几年几月出生的？", a: "1958-07" },
        { q: "你的最高学历是？", a: "高中" },
        { q: "你现在已婚吗？", a: "是" },
        { q: "你有子女吗？", a: "有" },
        { q: "你出生在哪个城市或地区？", a: "湖南长沙" },
      ],
    },
  ];
}
