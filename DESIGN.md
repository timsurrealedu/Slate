---
name: "Slate"
description: "A quiet university study workspace built around an open page and context in reach."
colors:
  primary: "#385775"
  primary-strong: "#2d4863"
  primary-wash: "#eaf0f6"
  canvas: "#f7f8fa"
  rail: "#eff0f3"
  panel: "#ffffff"
  surface: "#f1f3f6"
  hover: "#e7ebf0"
  selection: "#e0e8f1"
  ink: "#253044"
  muted-ink: "#59657a"
  faint-ink: "#748096"
  divider: "#e0e4ea"
  success: "#607d6b"
  danger: "#a4494e"
  dark-primary: "#a6c4e2"
  dark-primary-strong: "#bfd5eb"
  dark-primary-wash: "#26384b"
  dark-canvas: "#191e27"
  dark-rail: "#1e2530"
  dark-panel: "#242c38"
  dark-surface: "#2b3442"
  dark-hover: "#303d4f"
  dark-selection: "#34485f"
  dark-ink: "#e6eaf0"
  dark-muted-ink: "#a3adbd"
  dark-divider: "#34404f"
  dark-success: "#aac4b0"
  dark-danger: "#eda7ac"
  dark-primary-ink: "#192633"
typography:
  ui:
    fontFamily: "'DM Sans Variable', sans-serif"
    fontSize: "14px"
  label:
    fontFamily: "'DM Sans Variable', sans-serif"
    fontSize: "13px"
    fontWeight: 500
  brand:
    fontFamily: "'DM Sans Variable', sans-serif"
    fontSize: "27px"
    fontWeight: 650
    letterSpacing: "-0.04em"
  reading:
    fontFamily: "'Source Serif 4', Georgia, serif"
    fontSize: "18px"
    lineHeight: 1.8
  code:
    fontFamily: "monospace"
  h1:
    fontFamily: "'DM Sans Variable', sans-serif"
    fontSize: "1.8em"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  h2:
    fontFamily: "'DM Sans Variable', sans-serif"
    fontSize: "1.23em"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.025em"
  h3:
    fontFamily: "'DM Sans Variable', sans-serif"
    fontSize: "1.07em"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.025em"
  navigation:
    fontFamily: "'DM Sans Variable', sans-serif"
    fontSize: "13px"
    fontWeight: 550
  mode:
    fontFamily: "'DM Sans Variable', sans-serif"
    fontSize: "10px"
    fontWeight: 550
rounded:
  control: "6px"
  preview: "8px"
  floating: "12px"
  ink: "9px"
  page: "0px"
  mode: "4px"
spacing:
  compact: "8px"
  standard: "12px"
  section: "20px"
  group: "28px"
components:
  primary-action:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.panel}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "34px"
  secondary-action:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "34px"
  quiet-action:
    backgroundColor: "transparent"
    textColor: "{colors.muted-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "34px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    height: "40px"
  icon-action:
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.control}"
    width: "32px"
    height: "32px"
  course-nav:
    backgroundColor: "{colors.selection}"
    textColor: "{colors.primary}"
    typography: "{typography.navigation}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    height: "39px"
  mode-chip:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.primary}"
    typography: "{typography.mode}"
    rounded: "{rounded.mode}"
    padding: "6px 10px"
    height: "29px"
  document-preview:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.preview}"
  reading-column:
    typography: "{typography.reading}"
    width: "850px"
    padding: "40px 50px 90px"
  physical-page:
    rounded: "{rounded.page}"
    width: "794px"
    height: "1123px"
  course-rail:
    backgroundColor: "{colors.rail}"
    width: "228px"
  workspace-bar:
    height: "62px"
  floating-menu:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.floating}"
  ink-toolbar:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.ink}"
---

## Overview

**North Star:** The open study desk

Slate opens a quiet course library into a generous page, with context in reach. Cool neutrals and slate-blue ink give the workspace a calm, local character.

The completed, code-led layout centers physical pages and compact floating tools. Paper grids are functional notebook templates.

**Key Characteristics**

- Cool-neutral surfaces and slate-blue interaction ink.
- Self-hosted DM Sans and Source Serif 4.
- Pages with square corners, quiet separators and compact floating tools.
- Adaptive context around a stable reading column.

## Colors

### Primary

**Ink marks action** — Use the primary family for actions, selected tools and focus. Success and danger communicate status.

### Neutral

**Theme the workspace, preserve the paper** — Use neutral surfaces to separate canvas, rail, panels and controls. Page paper stays independent of the UI theme. Dark faint text shares dark-muted-ink; dark primary actions use dark-primary-ink.

## Typography

**Separate navigation from reading** — Use DM Sans for the interface and prose headings, Source Serif 4 for reading, and genuine monospace for source and code. Reading size responds to preference.

## Layout

**Keep context within reach** — The first viewport pairs a rail and slim bar with a title, recent previews, and folder and document rows. The top bar owns note creation. Context yields before the rail; phone destinations move into a drawer and bottom navigation. Reading-column width, margins, and placement are saved user preferences shared by all Markdown modes; physical-page dimensions are source coordinates that scale to the viewport.

## Elevation & Depth

**Lift transient tools** — Keep panels and previews quietly bordered. Use restrained shadows for floating menus and the compact ink toolbar.

## Shapes

**Square paper, rounded controls** — Keep physical pages square-cornered; use the observed control, preview, menu and ink-toolbar radii for their respective surfaces.

## Components

**Make states visible** — Use filled primary, bordered secondary and muted quiet actions. Action and field heights are minimums; coarse-pointer controls reach 44px square. Preserve focus and disabled states.

**Keep motion out of ink** — Use short interface easing, honor reduced motion, and keep ink sampling and rendering animation-free.

## Do's and Don'ts

### Do

- Use real document content in previews.
- Keep paper grids tied to functional templates.
- Keep reading context within reach.

### Don't

- Apply the workspace theme to page paper.
- Turn document-type metadata into a marketing kicker.
- Animate ink sampling or rendering.
