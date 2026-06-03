import fs from "node:fs";
import path from "node:path";
import { DATA_USERS_ROOT } from "../config";

const ensureFolder = (folderPath: string): void => {
  fs.mkdirSync(folderPath, { recursive: true });
};

export const getUserRootDir = (userId: string): string => path.join(DATA_USERS_ROOT, userId);

export const createUserWorkspace = (userId: string): string => {
  const userRoot = getUserRootDir(userId);
  ensureFolder(userRoot);
  ensureFolder(path.join(userRoot, "所有文本信息文件夹"));
  return userRoot;
};
