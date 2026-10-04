import { Capacitor } from "@capacitor/core";
import { workspace } from "../core/workspace";
import type { NativeBackEvent } from "../ui/useNavigationMotion";
export const isNative = () => Capacitor.isNativePlatform();
export const isLocalApplication = () =>
  isNative() ||
  (typeof navigator !== "undefined" && navigator.userAgent.includes("Electron/")) ||
  (typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches);
export async function bindNative(onBack: () => boolean, onError: (message: string) => void) {
  const [{ App }, { Browser }] = await Promise.all([
    import("@capacitor/app"),
    import("@capacitor/browser"),
  ]);
  let live = true;
  const back = async (event: Event) => {
    const detail = (event as CustomEvent<NativeBackEvent>).detail;
    if (!live) return;
    if (detail.phase !== "commit") return;
    if (!live || onBack()) return;
    try {
      await workspace.flush();
      await App.minimizeApp();
    } catch {
      onError("Your latest edits need saving. Keep Slate open and export a backup.");
    }
  };
  window.addEventListener("slate-native-back", back);
  const state = await App.addListener("appStateChange", ({ isActive }) => {
    if (live && !isActive)
      void workspace
        .flush()
        .catch(() => onError("Slate couldn’t finish saving. Export a backup before closing."));
  });
  const click = (event: MouseEvent) => {
    if (event.defaultPrevented || !(event.target instanceof Element)) return;
    const anchor = event.target.closest("a[href]") as HTMLAnchorElement | null;
    if (!anchor) return;
    const url = new URL(anchor.href, location.href);
    if (!/^https?:$/.test(url.protocol) || url.origin === location.origin) return;
    event.preventDefault();
    void Browser.open({ url: url.href }).catch(() =>
      onError("This link couldn’t open. Try it again."),
    );
  };
  document.addEventListener("click", click);
  return () => {
    live = false;
    window.removeEventListener("slate-native-back", back);
    void state.remove();
    document.removeEventListener("click", click);
  };
}
