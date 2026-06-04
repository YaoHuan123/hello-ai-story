import type { InterviewScope } from "../../src/services/interviewWorkspace.service";
import { createInterview } from "../../src/services/interviewWorkspace.service";
import { createUserWorkspace } from "../../src/services/workspace.service";

export function interviewScope(userId: string, interviewId: string): InterviewScope {
  return { userId, interviewId };
}

/** 创建用户工作区并新建一场采访，返回作用域。 */
export function setupUserWithInterview(userId: string, opts?: { title?: string }): InterviewScope {
  createUserWorkspace(userId);
  const meta = createInterview(userId, opts);
  return { userId, interviewId: meta.id };
}
