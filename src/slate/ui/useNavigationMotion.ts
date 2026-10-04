import { useLayoutEffect, useRef } from "react";
import { flushSync } from "react-dom";

export interface NativeBackEvent {
  phase: "start" | "progress" | "cancel" | "commit";
  progress: number;
  edge: number;
}

const easing = "cubic-bezier(0.16, 1, 0.3, 1)";
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useNavigationMotion(active: string | null) {
  const previous = useRef(active);
  const runtime = useRef({
    animations: [] as Animation[],
    generation: 0,
    preview: false,
    direction: 1,
  });
  const gestureHandler = useRef(backGesture);
  gestureHandler.current = backGesture;
  function cancel() {
    const state = runtime.current;
    state.generation++;
    for (const animation of state.animations) animation.cancel();
    state.animations = [];
    state.preview = false;
    document.querySelector(".navigation-stack")?.classList.remove("back-preview");
    const shell = document.querySelector<HTMLElement>(".document-shell");
    if (shell) {
      delete shell.dataset.leaving;
      shell.style.removeProperty("transform");
      shell.style.removeProperty("border-radius");
    }
  }
  function animate(element: Element, frames: Keyframe[], duration: number) {
    const animation = element.animate(frames, { duration, easing, fill: "both" });
    runtime.current.animations.push(animation);
    return animation;
  }
  useLayoutEffect(() => {
    if (previous.current === active) return;
    const entering = !!active;
    previous.current = active;
    cancel();
    const element = document.querySelector(entering ? ".document-shell" : ".library-pane");
    if (!element || reducedMotion()) return;
    const animation = animate(
      element,
      [
        {
          opacity: entering ? 0.35 : 0.7,
          transform: entering ? "translateX(24px)" : "scale(0.985)",
        },
        { opacity: 1, transform: "none" },
      ],
      entering ? 240 : 180,
    );
    void animation.finished.then(() => animation.cancel()).catch(() => {});
  }, [active]);
  useLayoutEffect(() => {
    const listener = (event: Event) =>
      gestureHandler.current((event as CustomEvent<NativeBackEvent>).detail);
    window.addEventListener("slate-native-back", listener);
    return () => {
      window.removeEventListener("slate-native-back", listener);
      cancel();
    };
  }, []);

  function backGesture(event: NativeBackEvent) {
    const shell = document.querySelector<HTMLElement>(".document-shell:not([hidden])");
    if (event.phase === "start") {
      cancel();
      if (!shell || reducedMotion() || document.querySelector('[role="dialog"],[role="menu"]'))
        return;
      runtime.current.preview = true;
      runtime.current.direction = event.edge === 1 ? -1 : 1;
      document.querySelector(".navigation-stack")?.classList.add("back-preview");
    }
    if (!runtime.current.preview || !shell) return;
    if (event.phase === "start" || event.phase === "progress") {
      const p = Math.max(0, Math.min(1, event.progress));
      shell.style.transform = `translateX(${runtime.current.direction * p * 32}px) scale(${1 - p * 0.08})`;
      shell.style.borderRadius = `${p * 16}px`;
    } else if (event.phase === "cancel") {
      const generation = runtime.current.generation;
      const animation = animate(
        shell,
        [
          { transform: getComputedStyle(shell).transform, borderRadius: shell.style.borderRadius },
          { transform: "none", borderRadius: "0px" },
        ],
        180,
      );
      void animation.finished
        .then(() => {
          if (runtime.current.generation === generation) cancel();
        })
        .catch(() => {});
    }
  }
  function leave(update: () => void) {
    const shell = document.querySelector<HTMLElement>(".document-shell:not([hidden])");
    if (!shell || reducedMotion()) {
      cancel();
      update();
      return;
    }
    // Repeated Back presses share the current departure rather than restarting it.
    if (shell.dataset.leaving === "true") return;
    shell.dataset.leaving = "true";
    document.querySelector(".navigation-stack")?.classList.add("back-preview");
    const state = runtime.current;
    const generation = ++state.generation;
    const animation = animate(
      shell,
      [
        { opacity: 1, transform: getComputedStyle(shell).transform },
        { opacity: 0, transform: `translateX(${state.direction * 64}px) scale(0.94)` },
      ],
      180,
    );
    void animation.finished
      .then(() => {
        if (state.generation !== generation) return;
        delete shell.dataset.leaving;
        flushSync(update);
        cancel();
      })
      .catch(() => {
        delete shell.dataset.leaving;
      });
  }
  return { cancel, leave };
}
