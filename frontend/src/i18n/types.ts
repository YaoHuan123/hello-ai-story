export type Locale = "zh" | "en";

export type MessageTree = {
  [key: string]: string | MessageTree;
};
