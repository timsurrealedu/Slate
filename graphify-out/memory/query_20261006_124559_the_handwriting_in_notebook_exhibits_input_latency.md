---
type: "query"
date: "2026-10-06T12:45:59.947217+00:00"
question: "The handwriting in notebook exhibits input latency, rendering, and gesture-conflict issues. I want you to address and fix them accordingly"
contributor: "graphify"
outcome: "useful"
source_nodes: ["InkSurface.tsx", "Notebook.tsx", "render.ts"]
---

# Q: The handwriting in notebook exhibits input latency, rendering, and gesture-conflict issues. I want you to address and fix them accordingly

## Answer

Expanded from the graph vocabulary: ink, surface, touch, render, notebook, canvas, gesture, stroke. Graph sources locate the shared input and gesture handler in src/slate/ink/InkSurface.tsx, notebook viewport and pinch handling in src/slate/ui/Notebook.tsx, and stroke geometry in src/slate/ink/render.ts. Current source was inspected directly before changes because the graph predates the recent performance edits.

## Outcome

- Signal: useful

## Source Nodes

- InkSurface.tsx
- Notebook.tsx
- render.ts