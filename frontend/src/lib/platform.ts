import { Capacitor } from "@capacitor/core";

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function isIosNative(): boolean {
  return Capacitor.getPlatform() === "ios";
}

export function isAndroidNative(): boolean {
  return Capacitor.getPlatform() === "android";
}

export function isWebDev(): boolean {
  return !Capacitor.isNativePlatform();
}

export function clientPlatformHeader(): string {
  if (isIosNative()) return "ios";
  if (isAndroidNative()) return "android";
  return "web";
}
