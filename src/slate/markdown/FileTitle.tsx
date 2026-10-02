import { useEffect, useRef } from "react";
const titleObservers = new WeakMap<HTMLElement, ResizeObserver>();
export function disposeTitleEditor(element: HTMLElement) {
  titleObservers.get(element)?.disconnect();
  titleObservers.delete(element);
}

export function titleEditor(
  title: string,
  rename: (value: string) => Promise<void>,
  label = "File title",
) {
  const wrapper = document.createElement("div");
  wrapper.className = "file-title";
  const input =
    label === "File title" ? document.createElement("textarea") : document.createElement("input");
  input.value = title;
  input.maxLength = 200;
  input.setAttribute("aria-label", label);
  if (input instanceof HTMLTextAreaElement) {
    input.rows = 1;
    const fit = () => {
      if (!input.isConnected) return;
      input.style.height = "auto";
      input.style.height = input.scrollHeight + "px";
    };
    let width = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === width) return;
      width = entry.contentRect.width;
      fit();
    });
    observer.observe(input);
    titleObservers.set(wrapper, observer);
    input.addEventListener("input", fit);
  }
  const error = document.createElement("p");
  error.className = "inline-error";
  error.setAttribute("role", "alert");
  error.hidden = true;
  let saved = title,
    busy = false;
  input.onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    }
    if (event.key === "Escape") {
      input.value = saved;
      input.blur();
    }
  };
  input.addEventListener("blur", async () => {
    const value = input.value.trim();
    if (busy || value === saved) return;
    busy = true;
    input.disabled = true;
    error.hidden = true;
    try {
      await rename(value);
      saved = value;
    } catch (reason) {
      input.value = saved;
      error.textContent = reason instanceof Error ? reason.message : "Could not rename this file.";
      error.hidden = false;
    } finally {
      busy = false;
      input.disabled = false;
    }
  });
  if (label === "File title") {
    const heading = document.createElement("h1");
    heading.setAttribute("aria-label", title);
    heading.append(input);
    wrapper.append(heading, error);
  } else wrapper.append(input, error);
  return wrapper;
}

export function FileTitle({
  title,
  rename,
  label,
}: {
  title: string;
  rename(value: string): Promise<void>;
  label?: string;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const callback = useRef(rename);
  callback.current = rename;
  useEffect(() => {
    const editor = titleEditor(title, (value) => callback.current(value), label);
    mount.current?.replaceChildren(editor);
    return () => disposeTitleEditor(editor);
  }, [title, label]);
  return <div ref={mount} className="file-title-mount" />;
}
