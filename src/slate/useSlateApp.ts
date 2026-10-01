import { useEffect, useRef, useState, createRef } from "react";
import { workspace, useWorkspace } from "./core/workspace";
import { headings, newId, type SlateDocument, type DocumentKind, type Folder } from "./core/model";
import { importFile, exportDocument, loadPdf } from "./documents/files";
import { putAsset } from "./core/storage";
import type { FlexcilReport } from "./import/flexcil/importer";
import type { MarkdownHandle } from "./markdown/MarkdownEditor";
import { bindNative, isNative } from "./platform/native";
import { vault } from "./platform/vault";
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
export function useSlateApp() {
  const data = useWorkspace();
  const nativeBack = useRef<() => boolean>(() => false);
  const [active, setActive] = useState<string | null>(null),
    [tabs, setTabs] = useState<string[]>([]),
    [view, setView] = useState("library"),
    [sidebar, setSidebar] = useState(true),
    [compact, setCompact] = useState(false),
    [context, setContext] = useState(true),
    [dark, setDark] = useState(false),
    [search, setSearch] = useState(false),
    [settings, setSettings] = useState(false);
  const [toast, setToast] = useState<{
      message: string;
      undo?: () => void;
      error?: boolean;
    } | null>(null),
    [folderDialog, setFolderDialog] = useState<{ folder?: Folder } | null>(null),
    [moveDoc, setMoveDoc] = useState<SlateDocument | null>(null),
    [historyDoc, setHistoryDoc] = useState<SlateDocument | null>(null),
    [busy, setBusy] = useState(""),
    [canInstall, setCanInstall] = useState(false),
    [update, setUpdate] = useState<ServiceWorker | null>(null);
  const [flexcilReport, setFlexcilReport] = useState<FlexcilReport | null>(null);
  const importController = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null),
    imageInput = useRef<HTMLInputElement>(null),
    installEvent = useRef<InstallEvent | null>(null),
    editorRefs = useRef(new Map<string, React.RefObject<MarkdownHandle | null>>()),
    toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const selected = data.documents.find((d) => d.id === active && !d.trashedAt) || null;
  nativeBack.current = () => {
    if (document.querySelector('[role="dialog"], [role="menu"]')) {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return true;
    }
    if (compact && sidebar) {
      setSidebar(false);
      return true;
    }
    if (active) {
      goLibrary();
      return true;
    }
    if (view !== "library") {
      goLibrary("library");
      return true;
    }
    return false;
  };
  useEffect(() => {
    if (!isNative()) return;
    let live = true;
    let remove = () => {};
    void bindNative(
      () => nativeBack.current(),
      (message) => notify(message, undefined, true),
    )
      .then((cleanup) => {
        if (live) remove = cleanup;
        else cleanup();
      })
      .catch(() =>
        notify("Slate couldn’t connect to the device controls. Reopen the app.", undefined, true),
      );
    return () => {
      live = false;
      remove();
    };
  }, []);

  function notify(message: string, undo?: () => void, error = false) {
    clearTimeout(toastTimer.current);
    setToast({ message, undo, error });
    toastTimer.current = setTimeout(() => setToast(null), undo ? 12000 : 6000);
  }
  function getEditor(id: string) {
    if (!editorRefs.current.has(id)) editorRefs.current.set(id, createRef<MarkdownHandle>());
    return editorRefs.current.get(id)!;
  }
  useEffect(() => {
    const narrow = matchMedia("(max-width: 960px)"),
      contextWidth = matchMedia("(min-width: 1181px)");
    const adaptContext = () => setContext(contextWidth.matches);
    contextWidth.addEventListener("change", adaptContext);
    const resize = () => {
      setCompact(narrow.matches);
      setSidebar(!narrow.matches);
      setContext(window.innerWidth > 1180);
    };
    resize();
    narrow.addEventListener("change", resize);
    workspace.load().then(() => {
      try {
        const session = JSON.parse(localStorage.getItem("slate-session") || "{}");
        const docs = workspace.get().documents;
        const restored = (session.tabs || []).filter((id: string) =>
          docs.some((d) => d.id === id && !d.trashedAt),
        );
        setTabs(restored);
        const hash = location.hash.match(/^#doc=(.+)$/)?.[1];
        const id = hash || session.active;
        setActive(
          restored.includes(id) || (hash && docs.some((d) => d.id === hash && !d.trashedAt))
            ? id
            : null,
        );
        if (hash && !restored.includes(hash) && docs.some((d) => d.id === hash && !d.trashedAt))
          setTabs([...restored, hash]);
      } catch {}
    });
    const protect = (e: BeforeUnloadEvent) => {
      if (workspace.get().saving) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const flush = () => {
      void workspace.flush().catch(() => {});
    };
    window.addEventListener("beforeunload", protect);
    window.addEventListener("pagehide", flush);
    const prompt = (e: Event) => {
      e.preventDefault();
      installEvent.current = e as InstallEvent;
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", prompt);
    if (!isNative() && "serviceWorker" in navigator && import.meta.env.PROD)
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          if (registration.waiting) setUpdate(registration.waiting);
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller)
                setUpdate(worker);
            });
          });
        })
        .catch(() => {});
    return () => {
      narrow.removeEventListener("change", resize);
      contextWidth.removeEventListener("change", adaptContext);
      window.removeEventListener("beforeunload", protect);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeinstallprompt", prompt);
    };
  }, []);
  useEffect(() => {
    if (data.ready) {
      try {
        localStorage.setItem("slate-session", JSON.stringify({ tabs, active }));
      } catch {}
    }
  }, [tabs, active, data.ready]);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const value =
        data.preferences.theme === "dark" || (data.preferences.theme === "system" && media.matches);
      setDark(value);
      document.documentElement.dataset.theme = value ? "dark" : "light";
      document.documentElement.style.colorScheme = value ? "dark" : "light";
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [data.preferences.theme]);
  function open(doc: SlateDocument) {
    if (doc.trashedAt) return;
    setTabs((current) => (current.includes(doc.id) ? current : [...current, doc.id]));
    setActive(doc.id);
    workspace.update(doc.id, { openedAt: Date.now() });
    if (compact) setSidebar(false);
    history.replaceState(null, "", "#doc=" + doc.id);
  }
  function goLibrary(next = view) {
    setView(next);
    setActive(null);
    if (compact) setSidebar(false);
    history.replaceState(null, "", location.pathname);
  }
  function closeTab(id: string) {
    const i = tabs.indexOf(id),
      next = tabs.filter((t) => t !== id);
    setTabs(next);
    if (active === id) {
      const nextId = next[Math.min(i, next.length - 1)] || null;
      setActive(nextId);
      history.replaceState(null, "", nextId ? "#doc=" + nextId : location.pathname);
    }
  }
  async function create(kind: DocumentKind = "note") {
    try {
      const doc = await workspace.create(kind, view.startsWith("folder:") ? view.slice(7) : null);
      if (kind === "note") workspace.update(doc.id, { content: "# " + doc.title + "\n\n" });
      open(doc);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not create this document.", undefined, true);
    }
  }
  async function openLink(name: string) {
    const [title, anchor] = name.split("#");
    let doc = data.documents.find(
      (d) =>
        !d.trashedAt &&
        (d.title.toLowerCase() === title.trim().toLowerCase() ||
          d.source?.path.replace(/\.[^.]+$/, "").toLowerCase() === title.trim().toLowerCase()),
    );
    if (!doc) {
      try {
        doc = await workspace.create("note", selected?.folderId || null);
        workspace.update(doc.id, { title: title.trim(), content: "# " + title.trim() + "\n\n" });
        doc = { ...doc, title: title.trim(), content: "# " + title.trim() + "\n\n" };
        notify("Created “" + title.trim() + "”");
      } catch (e) {
        notify(
          e instanceof Error ? e.message : "Could not create this linked note.",
          undefined,
          true,
        );
        return;
      }
    }
    open(doc);
    if (anchor) {
      const heading = headings(doc.content).find(
        (h) => h.text.toLowerCase() === anchor.toLowerCase(),
      );
      if (heading) setTimeout(() => getEditor(doc!.id).current?.goToLine(heading.line), 100);
    }
  }
  function star(doc: SlateDocument) {
    workspace.update(doc.id, { starred: !doc.starred });
  }
  function trash(doc: SlateDocument) {
    workspace.update(doc.id, { trashedAt: Date.now() });
    closeTab(doc.id);
    notify("“" + doc.title + "” moved to Trash", () =>
      workspace.update(doc.id, { trashedAt: null }),
    );
  }
  function restoreDoc(doc: SlateDocument) {
    workspace.update(doc.id, { trashedAt: null });
    notify("Document restored");
  }
  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      setBusy(file.name);
      try {
        if (/\.(flex|flx)$/i.test(file.name)) {
          await workspace.flush();
          importController.current = new AbortController();
          const { importFlexcil } = await import("./import/flexcil/importer");
          const report = await importFlexcil(file, {
            signal: importController.current.signal,
            vaultId: data.vault?.id,
            onProgress: setBusy,
            pdfPages: async (blob) => {
              const pdf = await loadPdf(blob);
              try {
                return await Promise.all(
                  Array.from({ length: pdf.numPages }, async (_, i) => {
                    const page = await pdf.getPage(i + 1);
                    const size = page.getViewport({ scale: 1 });
                    return { width: size.width, height: size.height };
                  }),
                );
              } finally {
                await pdf.destroy();
              }
            },
          });
          await workspace.flush();
          await workspace.load();
          setFlexcilReport(report);
          continue;
        }
        const doc = await importFile(file, view.startsWith("folder:") ? view.slice(7) : null);
        open(doc);
        notify("Imported “" + doc.title + "”");
      } catch (e) {
        if (/\.(flex|flx)$/i.test(file.name)) {
          await workspace.flush().catch(() => {});
          await workspace.load();
        }
        notify(e instanceof Error ? e.message : "Could not import this file.", undefined, true);
      } finally {
        importController.current = null;
      }
    }
    setBusy("");
    if (fileInput.current) fileInput.current.value = "";
  }
  async function importImage(file?: File) {
    if (!file || !selected) return;
    try {
      if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type) || file.size > 10 * 1024 * 1024)
        throw new Error("Choose a PNG, JPEG, WebP or GIF smaller than 10 MB.");
      const id = newId();
      await putAsset(id, file);
      getEditor(selected.id).current?.insert(
        "![" + file.name.replace(/[\[\]()]/g, "") + "](attachment:" + id + ")",
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not import the image.", undefined, true);
    }
    if (imageInput.current) imageInput.current.value = "";
  }
  async function exportSelected(annotated = false) {
    if (!selected) return;
    try {
      const destination = await exportDocument(selected, annotated);
      if (destination !== "cancelled")
        notify(destination === "saved" ? "Copy saved outside Slate" : "Document exported");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not export this document.", undefined, true);
    }
  }
  function theme() {
    void workspace.preferences({ theme: dark ? "light" : "dark" });
  }
  async function openVault(local = false, refresh = false) {
    try {
      const connection = local ? null : refresh ? data.vault : await vault.pick();
      if (!local && !connection) return;
      setBusy("Opening vault");
      await workspace.openVault(connection);
      setTabs([]);
      setActive(null);
      setView("library");
      editorRefs.current.clear();
      history.replaceState(null, "", location.pathname);
      notify(connection ? "Opened “" + connection.name + "”" : "Opened your local workspace");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Could not open this vault.",
        undefined,
        true,
      );
    } finally {
      setBusy("");
    }
  }
  async function install() {
    await installEvent.current?.prompt();
    setCanInstall(false);
    installEvent.current = null;
  }
  async function activateUpdate() {
    try {
      await workspace.flush();
      update?.postMessage({ type: "ACTIVATE" });
      navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), {
        once: true,
      });
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Save your changes before updating.",
        undefined,
        true,
      );
    }
  }
  const actions = useRef({ create, goLibrary, open, closeTab, setSearch, setSidebar });
  actions.current = { create, goLibrary, open, closeTab, setSearch, setSidebar };
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch(true);
      }
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        void actions.current.create(e.shiftKey ? "notebook" : "note");
      }
      if (e.key.toLowerCase() === "b") {
        if (
          workspace.get().preferences.vim &&
          (e.target as HTMLElement).closest(".markdown-surface")
        )
          return;
        e.preventDefault();
        setSidebar((value) => !value);
      }
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        workspace
          .flush()
          .then(() => notify("All changes saved"))
          .catch((error) => notify(error.message, undefined, true));
      }
    };
    window.addEventListener("keydown", listener, { capture: true });
    return () => window.removeEventListener("keydown", listener, { capture: true });
  }, []);
  return {
    ...data,
    selected,
    active,
    setActive,
    tabs,
    view,
    sidebar,
    setSidebar,
    compact,
    context,
    setContext,
    dark,
    search,
    setSearch,
    settings,
    setSettings,
    toast,
    setToast,
    folderDialog,
    setFolderDialog,
    moveDoc,
    setMoveDoc,
    historyDoc,
    setHistoryDoc,
    busy,
    canInstall,
    update,
    fileInput,
    imageInput,
    notify,
    getEditor,
    open,
    goLibrary,
    closeTab,
    create,
    openLink,
    star,
    trash,
    restoreDoc,
    importFiles,
    importImage,
    exportSelected,
    theme,
    install,
    activateUpdate,
    openVault,
    flexcilReport,
    setFlexcilReport,
    cancelImport: () => importController.current?.abort(),
    canCancelImport: !!importController.current,
  };
}
