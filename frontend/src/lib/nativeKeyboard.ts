import { isNativeApp } from "./platform";

/** iOS 键盘高度 → CSS 变量，供聊天页等贴键盘布局。 */
export async function initNativeKeyboardInset(): Promise<void> {
  if (!isNativeApp()) return;

  const { Keyboard, KeyboardResize } = await import("@capacitor/keyboard");

  await Keyboard.setResizeMode({ mode: KeyboardResize.None });

  let pluginHeight = 0;

  const applyInset = () => {
    let inset = pluginHeight;
    const vv = window.visualViewport;
    if (vv) {
      const vvInset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      inset = Math.max(inset, vvInset);
    }
    document.documentElement.style.setProperty("--keyboard-height", `${inset}px`);
    document.documentElement.classList.toggle("keyboard-open", inset > 0);
  };

  await Keyboard.addListener("keyboardWillShow", (info) => {
    pluginHeight = info.keyboardHeight;
    applyInset();
  });
  await Keyboard.addListener("keyboardDidShow", (info) => {
    pluginHeight = info.keyboardHeight;
    applyInset();
  });
  await Keyboard.addListener("keyboardWillHide", () => {
    pluginHeight = 0;
    applyInset();
  });
  await Keyboard.addListener("keyboardDidHide", () => {
    pluginHeight = 0;
    applyInset();
  });

  window.visualViewport?.addEventListener("resize", applyInset);
  window.visualViewport?.addEventListener("scroll", applyInset);
}
