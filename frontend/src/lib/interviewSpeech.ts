import type { PluginListenerHandle } from "@capacitor/core";
import { getLocale } from "../i18n";
import { isIosNative } from "./platform";

export type InterviewSpeechError =
  | "unavailable"
  | "permission_denied"
  | "failed";

type SpeechRecognitionExtended = {
  requestPermissions: () => Promise<{ speechRecognition: string }>;
  start: (opts?: {
    language?: string;
    partialResults?: boolean;
    addPunctuation?: boolean;
  }) => Promise<{ matches?: string[] }>;
  stop: () => Promise<void>;
  addListener: (
    eventName: "partialResults",
    listener: (event: { matches?: string[] }) => void,
  ) => Promise<PluginListenerHandle>;
  removeAllListeners: () => Promise<void>;
};

let partialListener: PluginListenerHandle | null = null;
let listening = false;

function speechLocale(): string {
  return getLocale() === "zh" ? "zh-CN" : "en-US";
}

async function loadSpeechRecognition(): Promise<SpeechRecognitionExtended> {
  const { SpeechRecognition } = await import("@capgo/capacitor-speech-recognition");
  return SpeechRecognition as unknown as SpeechRecognitionExtended;
}

export function isInterviewSpeechSupported(): boolean {
  return isIosNative();
}

export async function startInterviewSpeech(
  onTranscript: (text: string) => void,
): Promise<InterviewSpeechError | null> {
  if (!isIosNative()) return "unavailable";
  if (listening) return null;

  try {
    const sr = await loadSpeechRecognition();
    const locale = speechLocale();

    const perm = await sr.requestPermissions();
    if (perm.speechRecognition !== "granted") {
      return perm.speechRecognition === "denied" ? "permission_denied" : "failed";
    }

    await sr.removeAllListeners();
    partialListener = await sr.addListener("partialResults", (event) => {
      const text = event.matches?.[0]?.trim();
      if (text) onTranscript(text);
    });

    await sr.start({
      language: locale,
      partialResults: true,
      addPunctuation: true,
    });
    listening = true;
    return null;
  } catch (err) {
    await stopInterviewSpeech();
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    if (msg.includes("not implemented") || msg.includes("unavailable")) {
      return "unavailable";
    }
    if (msg.includes("permission") || msg.includes("denied")) {
      return "permission_denied";
    }
    return "failed";
  }
}

export async function stopInterviewSpeech(): Promise<void> {
  if (!isIosNative()) return;

  try {
    const sr = await loadSpeechRecognition();
    if (listening) {
      await sr.stop();
    }
  } catch {
    // ignore teardown errors
  } finally {
    listening = false;
    if (partialListener) {
      await partialListener.remove().catch(() => undefined);
      partialListener = null;
    }
    try {
      const sr = await loadSpeechRecognition();
      await sr.removeAllListeners();
    } catch {
      // ignore
    }
  }
}

export function isInterviewSpeechListening(): boolean {
  return listening;
}
