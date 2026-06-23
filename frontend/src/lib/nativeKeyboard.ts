import { isNativeApp } from "./platform";

/** iOS 键盘高度 → CSS 变量，供聊天页等贴键盘布局。 */
export async function initNativeKeyboardInset(): Promise<void> {
  if (!isNativeApp()) return;

  const { Keyboard, KeyboardResize } = await import("@capacitor/keyboard");

  await Keyboard.setResizeMode({ mode: KeyboardResize.None });

  const applyHeight = (height: number) => {
    document.documentElement.style.setProperty("--keyboard-height", `${height}px`);
    if (height > 0) {
      document.documentElement.classList.add("keyboard-open");
    } else {
      document.documentElement.classList.remove("keyboard-open");
    }
  };

  await Keyboard.addListener("keyboardWillShow", (info) => {
    applyHeight(info.keyboardHeight);
  });
  await Keyboard.addListener("keyboardWillHide", () => {
    applyHeight(0);
  });

  const syncVisualViewport = () => {
    const vv = window.visualViewport;
    if (!vv) return;
    const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    if (inset > 0) applyHeight(inset);
  };

  window.visualViewport?.addEventListener("resize", syncVisualViewport);
  window.visualViewport?.addEventListener("scroll", syncVisualViewport);
}
