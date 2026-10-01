import { makeDocument, newPage, type SlateDocument, type Folder, type Stroke } from "./model";
export function seedWorkspace() {
  const folders: Folder[] = [
    { id: "physics", name: "Physics II", color: "#7693ad" },
    { id: "algebra", name: "Linear algebra", color: "#8d9e87" },
    { id: "reading", name: "Research & reading", color: "#b39d86" },
    { id: "getting-started", name: "Getting started", color: "#9295ae" },
  ];
  const create = (title: string, kind: "note" | "notebook", folderId: string, content = "") => {
    const doc = makeDocument(kind, title, folderId);
    doc.content = content;
    doc.example = true;
    doc.revision = 1;
    return doc;
  };
  const waves = create(
    "Oscillations & waves",
    "note",
    "physics",
    String.raw`# Oscillations & waves

A recurring idea in physics: a simple system can describe a surprisingly complex world.

> These are example notes. Make them your own, or move them to Trash.

## Simple harmonic motion

When the restoring force is proportional to displacement, the motion is **simple harmonic**. The mass moves around its equilibrium position with a constant angular frequency.

$$
m\frac{d^2x}{dt^2} = -kx
$$

The general solution is:

$$
x(t) = A\cos(\omega t + \phi), \qquad \omega = \sqrt{\frac{k}{m}}
$$

Here, $A$ is the amplitude and $\phi$ is the initial phase. The period is $T = 2\pi/\omega$.

### What to remember

- The restoring force always points toward equilibrium.
- A larger mass means a slower oscillation.
- Energy moves between kinetic and potential forms.

## Energy in the system

| Quantity | Expression | Maximum at |
| --- | --- | --- |
| Kinetic energy | $\frac{1}{2}mv^2$ | Equilibrium |
| Potential energy | $\frac{1}{2}kx^2$ | Turning points |
| Total energy | $\frac{1}{2}kA^2$ | Constant |

## Connections

The same mathematics appears in [[Linear transformations]] and wave superposition. Work through the examples in [[Problem set 03]].

## Before the next lecture

- [x] Review the equation of motion
- [ ] Derive the total energy
- [ ] Sketch position and velocity on the same axes
- [ ] Read the section on damped oscillation
`,
  );
  waves.starred = true;
  const transformations = create(
    "Linear transformations",
    "note",
    "algebra",
    String.raw`# Linear transformations

A linear transformation is a rule that preserves addition and scalar multiplication.

$$
T(u + v) = T(u) + T(v), \qquad T(cv) = cT(v)
$$

## Thinking geometrically

A matrix tells us where the **basis vectors** end up. The rest of the space follows.

- A rotation changes direction while preserving length.
- A stretch changes lengths along selected directions.
- A projection reduces the dimension of the output.

## Eigenvectors

Some vectors keep their direction after a transformation:

$$
Av = \lambda v
$$

The scalar $\lambda$ is the eigenvalue. Eigenvectors help describe [[Oscillations & waves]] in coupled systems.

## Matrix example

| Transformation | Determinant | Interpretation |
| --- | --- | --- |
| Rotation | 1 | Area is preserved |
| Scale by 2 | 4 | Area grows fourfold |
| Projection | 0 | Space collapses |

## Next steps

- [ ] Practice finding eigenvalues
- [ ] Draw the transformed basis
- [ ] Work through [[Problem set 03]]
`,
  );
  const problems = create("Problem set 03", "notebook", "physics");
  problems.starred = true;
  problems.pages = [
    {
      ...newPage({ style: "grid", color: "#fffefb", lineColor: "#dce3e8", spacing: 24 }),
      strokes: exampleInk(),
    },
    newPage({ style: "lined", color: "#fffefb", lineColor: "#e0e5e9", spacing: 30 }),
    newPage({ style: "blank", color: "#fffefb", lineColor: "#dce3e8", spacing: 24 }),
  ];
  const ideas = create("Lecture notebook", "notebook", "algebra");
  ideas.pages = [
    newPage({ style: "lined", color: "#eef4f8", lineColor: "#cfdae5", spacing: 30 }),
    newPage(),
  ];
  const reading = create(
    "Reading list",
    "note",
    "reading",
    String.raw`# Reading list

A working list for the semester. Add a thought after each reading and connect it to a lecture note.

## This week

- [ ] Chapter 4: oscillations and energy
- [ ] Chapter 6: eigenvectors and diagonalization
- [ ] Review your notes on [[Linear transformations]]

## A useful reading habit

Write a short summary from memory before looking back at the text. Link the idea to something you already understand.

## References

| Topic | Start here |
| --- | --- |
| Mechanics | Your course textbook, chapter 4 |
| Linear algebra | Your course textbook, chapter 6 |
| Study method | Active recall and spaced practice |
`,
  );
  const welcome = create(
    "Welcome to Slate",
    "note",
    "getting-started",
    String.raw`# Welcome to Slate

Your notes, pages and ideas, together in one quiet workspace.

These documents are **editable examples**. Use them to explore, or move them to Trash and start fresh.

## Make a little space

Choose **New note ? Markdown** for typed notes or **New note ? Notebook** for handwriting. Notebooks remember your last paper style and color. Open an existing folder from **Open vault**.

## Three ways to write

- **Live preview** keeps Markdown editable and renders formatting around the cursor.
- **Source** shows every character of your Markdown.
- **Reading** gives you a clean, focused document.

Type two opening brackets to connect a note, like [[Oscillations & waves]]. Backlinks appear in the document’s context panel.

## A real notebook

Notebooks have individual pages. Add, duplicate, move or change the paper without changing your ink.

Write with a mouse or stylus. Touch pans by default; turn on touch drawing in the ink toolbar if you want to write with your finger.

## Your work stays here

Slate saves on this device. Use **Settings → Export workspace** to keep a portable backup with your notes and original files.

Deleting moves a document to Trash. Previous saved versions are available from the document menu.

## Keyboard essentials

| Action | Shortcut |
| --- | --- |
| Find a note or command | Ctrl + K |
| New Markdown | Ctrl + N |
| New notebook | Ctrl + Shift + N |
| Undo / redo | Ctrl + Z / Ctrl + Shift + Z |
| Toggle library | Ctrl + B |
| Save | Ctrl + S |

On macOS, use Command in place of Control.
`,
  );
  const docs = [waves, transformations, problems, ideas, reading, welcome];
  docs.forEach((d, i) => {
    d.updatedAt -= i * 7200000;
    d.openedAt = d.updatedAt;
    d.createdAt -= 86400000 * 3;
  });
  return { documents: docs, folders };
}
// Geometric ink examples are stored as real, selectable, editable strokes.
function exampleInk(): Stroke[] {
  const strokes: Stroke[] = [];
  const add = (points: [number, number][], width = 2.2, color = "#385775") =>
    strokes.push({
      id: "example-" + strokes.length,
      tool: "pen",
      color,
      width,
      points: points.map(([x, y], i) => ({ x, y, p: 0.55, t: i * 10 })),
    });
  add(
    [
      [98, 354],
      [650, 354],
    ],
    1.6,
    "#7c8899",
  );
  add(
    [
      [370, 186],
      [370, 528],
    ],
    1.6,
    "#7c8899",
  );
  add(
    Array.from(
      { length: 220 },
      (_, i) => [100 + i * 2.5, 354 - 113 * Math.sin((i * Math.PI) / 70)] as [number, number],
    ),
    3,
  );
  add(
    [
      [370, 354],
      [385, 370],
      [410, 337],
    ],
    3,
    "#839d82",
  );
  add(
    [
      [100, 577],
      [650, 577],
    ],
    1.2,
    "#a5b5c4",
  );
  return strokes;
}
