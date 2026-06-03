/** 生活记忆热点语义域（供 Tier4 提示词 topicMap，不含具体例题）。 */
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
    domainName: "日常生活",
    semanticScope: ["衣食住行", "家庭分工", "生活节奏", "物资条件"],
    memoryAngles: ["具体场景", "时代变化", "个人感受", "人物互动"],
    tone: ["自然", "温和"],
    avoid: ["羞辱贫困", "逼问隐私"],
  },
  {
    domainId: "local_customs",
    domainName: "地方与风俗",
    semanticScope: ["地方礼俗", "节庆活动", "人生仪式", "乡土规矩"],
    memoryAngles: ["流程记忆", "人物参与", "代际变化"],
    tone: ["怀旧", "尊重"],
    avoid: ["强迫细节", "隐私逼问"],
  },
  {
    domainId: "era_change",
    domainName: "时代变化",
    semanticScope: ["物质条件", "社会风气", "教育机会", "交通通信"],
    memoryAngles: ["变化对比", "个人感受", "选择与转折"],
    tone: ["温和", "客观"],
    avoid: ["政治立场诱导", "羞辱贫困"],
  },
  {
    domainId: "family",
    domainName: "家庭关系",
    semanticScope: ["亲子相处", "兄弟姐妹", "长辈影响", "家中规矩"],
    memoryAngles: ["具体场景", "人物互动", "个人感受"],
    tone: ["温和", "可轻松回答"],
    avoid: ["家庭矛盾逼问", "隐私逼问"],
  },
  {
    domainId: "school_youth",
    domainName: "校园与青春",
    semanticScope: ["同学关系", "老师印象", "课外活动", "青春期情感"],
    memoryAngles: ["具体场景", "轻松趣事", "第一次经历"],
    tone: ["轻松", "自然"],
    avoid: ["未成年人敏感内容", "隐私逼问"],
  },
  {
    domainId: "work_money",
    domainName: "工作与钱",
    semanticScope: ["第一份收入", "消费压力", "职业选择", "经济独立"],
    memoryAngles: ["具体场景", "时代变化", "选择与转折"],
    tone: ["温和", "不评判"],
    avoid: ["收入羞辱", "隐私逼问"],
  },
  {
    domainId: "love_marriage",
    domainName: "情感与婚恋",
    semanticScope: ["相识相处", "含蓄表达", "关系磨合", "伴侣趣事"],
    memoryAngles: ["轻松趣事", "个人感受", "具体场景"],
    tone: ["轻松", "允许回避"],
    avoid: ["制造压力", "隐私逼问"],
  },
  {
    domainId: "housing_migration",
    domainName: "居住与迁移",
    semanticScope: ["搬家", "城乡变化", "租房买房", "邻里环境"],
    memoryAngles: ["具体场景", "时代变化", "个人感受"],
    tone: ["自然", "温和"],
    avoid: ["隐私逼问"],
  },
  {
    domainId: "entertainment",
    domainName: "娱乐与流行",
    semanticScope: ["童年游戏", "影视音乐", "流行物", "休闲活动"],
    memoryAngles: ["具体场景", "轻松趣事", "时代变化"],
    tone: ["轻松", "怀旧"],
    avoid: ["价值评判"],
  },
  {
    domainId: "body_labor",
    domainName: "身体与劳动",
    semanticScope: ["体力劳动", "家务技能", "运动习惯", "辛苦经历"],
    memoryAngles: ["具体场景", "个人感受"],
    tone: ["尊重", "温和"],
    avoid: ["病情细节", "羞辱"],
  },
  {
    domainId: "life_choices",
    domainName: "人生选择与转折",
    semanticScope: ["独立决定", "风险与机会", "后悔或骄傲的选择"],
    memoryAngles: ["选择与转折", "个人感受", "具体场景"],
    tone: ["温和", "不评判"],
    avoid: ["审判式问法"],
  },
];

/** 供 LLM 输入的 topicMap（与 {@link HotTopicDomain} 字段一致）。 */
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

/** 合法 domainId 集合，用于校验模型输出。 */
export function allowedHotTopicDomainIds(): Set<string> {
  return new Set(DOMAINS.map((d) => d.domainId));
}

/** domainId → domainName（模型漏填 domainName 时回填）。 */
export function hotTopicDomainNameById(domainId: string): string | undefined {
  return DOMAINS.find((d) => d.domainId === domainId)?.domainName;
}
