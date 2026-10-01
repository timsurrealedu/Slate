import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import appCss from "../styles.css?url";
import meta from "../app-meta.json";
declare const __HF_DESIGN_INSPECTOR__: boolean;
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width,initial-scale=1,viewport-fit=cover" },
      { title: meta.og_title || "Slate · A space for your ideas" },
      {
        name: "description",
        content:
          meta.og_description || "Your notes, pages and ideas, together in one local workspace.",
      },
      { name: "theme-color", content: "#385775" },
      { property: "og:title", content: meta.og_title || "Slate" },
      {
        property: "og:description",
        content: meta.og_description || "A local study and knowledge workspace.",
      },
      { property: "og:image", content: meta.og_image_url || "/assets/slate-cover.svg" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/icons/slate.svg" },
      { rel: "apple-touch-icon", href: "/icons/slate-192.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: ({ children }: { children: ReactNode }) => (
    <html lang="en" data-theme="light">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  ),
  component: Root,
  notFoundComponent: () => (
    <div className="empty-state">
      <h1>This page isn’t here</h1>
      <p>Your workspace is just one step away.</p>
      <a href="/">Open Slate</a>
    </div>
  ),
  errorComponent: ({ reset }: { reset: () => void }) => (
    <div className="empty-state">
      <h1>Slate couldn’t open this view</h1>
      <p>Your local documents haven’t been removed. Try opening the workspace again.</p>
      <button className="primary-button" onClick={reset}>
        Try again
      </button>
    </div>
  ),
});
function Root() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    if (__HF_DESIGN_INSPECTOR__)
      void import("../module/design-inspector/runtime")
        .then((module) => module.installHiggsfieldDesignInspector())
        .catch(() => {});
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
