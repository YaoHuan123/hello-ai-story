/** 访谈 API 暴露的字段控件类型（与 template-config `control` 映射）。 */
export type InterviewFieldType = "text" | "select" | "yearMonth";

export type TopicFieldMeta = {
  fieldType: InterviewFieldType;
  /** select 时的固定选项（来自 template-config fieldOptions） */
  fieldChoices?: string[];
};

const YEAR_MONTH_CONTROLS = new Set(["partnerBirthMonth", "timeAgePair"]);

/** 称谓类：子类 id → fieldOptions 键 */
const DIRECT_RELATION_OPTIONS_BY_SUB: Record<string, string> = {
  p_2_7: "directRelationTitleSiblings",
  p_2_8: "directRelationTitleGrandparents",
};

const CONTROL_OPTIONS_KEY: Record<string, string> = {
  gender: "gender",
  children: "children",
  married: "married",
  education: "education",
  firstJobNature: "firstJobNature",
  partnerMeetRelation: "partnerMeetRelation",
  meetChannelSelect: "meetChannel",
  firstDateBreakReasonSelect: "firstDateBreakReason",
  friendAgeGapSelect: "friendAgeGap",
  familyFeelingSelect: "familyOverallFeeling",
  personalitySelect: "personality",
  familyIncomeChangeDirectionSelect: "familyIncomeChangeDirection",
  homePurchaseHouseTypeSelect: "homePurchaseHouseType",
};

function optionsKeyForControl(control: string, subCategoryId: string): string | undefined {
  if (control === "directRelationTitleSelect") {
    return DIRECT_RELATION_OPTIONS_BY_SUB[subCategoryId];
  }
  if (control === "linkedChildNameSelect") {
    return undefined;
  }
  return CONTROL_OPTIONS_KEY[control];
}

/**
 * 将 catalog 字段 `control` 解析为访谈 API 的 `fieldType` + `fieldChoices`。
 */
export function resolveFieldMeta(
  control: string,
  subCategoryId: string,
  fieldOptions: Record<string, string[]>,
): TopicFieldMeta {
  if (YEAR_MONTH_CONTROLS.has(control)) {
    return { fieldType: "yearMonth" };
  }

  const optionsKey = optionsKeyForControl(control, subCategoryId);
  if (optionsKey) {
    const choices = fieldOptions[optionsKey];
    if (Array.isArray(choices) && choices.length > 0) {
      return { fieldType: "select", fieldChoices: [...choices] };
    }
  }

  if (fieldOptions[control]?.length) {
    return { fieldType: "select", fieldChoices: [...fieldOptions[control]!] };
  }

  return { fieldType: "text" };
}
