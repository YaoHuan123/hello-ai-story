import { isIosNative } from "./platform";

/** 与后端 APPLE_AUTH_DEV_MOCK 对齐 */
export const APPLE_DEV_MOCK_TOKEN = "dev-apple-mock-token";

function shouldUseDevMock(): boolean {
  if (import.meta.env.VITE_APPLE_DEV_MOCK === "1") return true;
  // Web 本地联调：Account 删号等会调用 Apple 复核，无需真机
  return import.meta.env.DEV && !isIosNative();
}

export async function signInWithAppleNative(): Promise<{ identityToken: string }> {
  if (shouldUseDevMock()) {
    return { identityToken: APPLE_DEV_MOCK_TOKEN };
  }

  if (!isIosNative()) {
    throw new Error("Apple Sign In is only available on iOS");
  }

  const { SignInWithApple } = await import("@capacitor-community/apple-sign-in");
  const clientId = import.meta.env.VITE_APPLE_BUNDLE_ID || "com.hellostory.app";
  const result = await SignInWithApple.authorize({
    clientId,
    redirectURI: "",
    scopes: "email name",
  });
  const identityToken = result.response?.identityToken;
  if (!identityToken) {
    throw new Error("Apple Sign In did not return identityToken");
  }
  return { identityToken };
}
