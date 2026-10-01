import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SlateApp from "./slate/SlateApp";
import { workspace } from "./slate/core/workspace";
import "./styles.css";
(window as Window & { __slateFlush?: () => Promise<void> }).__slateFlush = () => workspace.flush();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SlateApp />
  </StrictMode>,
);
