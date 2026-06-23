import type { PluginListenerHandle } from "@capacitor/core";
import { getLocale } from "../i18n";
import { isIosNative } from "./platform";

export type InterviewSpeechError =
  | "unavailable"
  | "permission_denied"
  | "failed";

type SpeechRecognitionExtended = {
  available: (opts?: { language?: string }) => Promise<{ available: boolean }>;
  requestPermissions: () => Promise<{ speechRecognition: string }>;
  start: (opts?: {
    language?: string;
    partialResults?: boolean;
    useOnDeviceRecognition?: boolean;
    addPunctuation?: boolean;
  }) => Promise<{ matches?: string[] }>;
  stop: () => Promise<void>;
  addListener: (
    eventName: "partialResults",
    listener: (event: { matches?: string[] }) => void,
  ) => Promise<PluginListenerHandle>;
  removeAllListeners: () => Promise<void>;
  isOnDeviceRecognitionAvailable?: (opts: {
    language: string;
  }) => Promise<{ available: boolean }>;
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

async function isOnDeviceAvailable(locale: string): Promise<boolean> {
  const sr = await loadSpeechRecognition();
  if (typeof sr.isOnDeviceRecognitionAvailable === "function") {
    const { available } = await sr.isOnDeviceRecognitionAvailable({ language: locale });
    return available;
  }
  const { available } = await sr.available({ language: locale });
  return available;
}

export async function probeInterviewSpeech(): Promise<
  "ready" | InterviewSpeechError
> {
  if (!isIosNative()) return "unavailable";

  try {
    const sr = await loadSpeechRecognition();
    const locale = speechLocale();

    const { available } = await sr.available({ language: locale });
    if (!available) return "unavailable";

    const onDevice = await isOnDeviceAvailable(locale);
    if (!onDevice) return "unavailable";

    const perm = await sr.requestPermissions();
    if (perm.speechRecognition !== "granted") return "permission_denied";

    return "ready";
  } catch {
    return "failed";
  }
}

export function isInterviewSpeechSupported(): boolean {
  return isIosNative();
}

export async function startInterviewSpeech(
  onTranscript: (text: string) => void,
): Promise<InterviewSpeechError | null> {
  if (!isIosNative()) return "unavailable";
  if (listening) return null;

  const sr = await loadSpeechRecognition();
  const locale = speechLocale();

  try {
    const { available } = await sr.available({ language: locale });
    if (!available) return "unavailable";

    const onDevice = await isOnDeviceAvailable(locale);
    if (!onDevice) return "unavailable";

    const perm = await sr.requestPermissions();
    if (perm.speechRecognition !== "granted") return "permission_denied";

    await sr.removeAllListeners();
    partialListener = await sr.addListener("partialResults", (event) => {
      const text = event.matches?.[0]?.trim();
      if (text) onTranscript(text);
    });

    const startOpts: {
      language: string;
      partialResults: boolean;
      addPunctuation: boolean;
      useOnDeviceRecognition?: boolean;
    } = {
      language: locale,
      partialResults: true,
      addPunctuation: true,
    };
    if (typeof sr.isOnDeviceRecognitionAvailable === "function") {
      startOpts.useOnDeviceRecognition = true;
    }

    await sr.start(startOpts);
    listening = true;
    return null;
  } catch {
    await stopInterviewSpeech();
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
