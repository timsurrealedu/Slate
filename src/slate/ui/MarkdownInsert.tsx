import { useEffect, useRef, useState } from "react";
import type { MathfieldElement } from "mathlive";
import { Modal } from "./shared";
import { tableMarkdown } from "../markdown/tables";

export function TableComposer({
  initial,
  onClose,
  onInsert,
}: {
  initial?: string[][];
  onClose(): void;
  onInsert(text: string): void;
}) {
  const [cells, setCells] = useState(
    initial || [
      ["", "", ""],
      ["", "", ""],
      ["", "", ""],
    ],
  );
  const rows = cells.length,
    columns = cells[0].length;
  function resize(r: number, c: number) {
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 1 || r > 50 || c < 1 || c > 12) return;
    setCells(
      Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => cells[i]?.[j] || "")),
    );
  }
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={initial ? "Edit table" : "Insert table"}
      description="Choose the size, then fill the cells. The first row is the header."
      className="table-composer"
    >
      <div className="composer-dimensions">
        <label>
          Rows{" "}
          <input
            type="number"
            aria-label="Table rows"
            min={1}
            max={50}
            value={rows}
            onChange={(e) => resize(Number(e.target.value), columns)}
          />
        </label>
        <label>
          Columns{" "}
          <input
            type="number"
            aria-label="Table columns"
            min={1}
            max={12}
            value={columns}
            onChange={(e) => resize(rows, Number(e.target.value))}
          />
        </label>
      </div>
      <div className="table-composer-scroll">
        <table>
          <tbody>
            {cells.map((row, r) => (
              <tr key={r}>
                {row.map((value, c) => (
                  <td key={c}>
                    <input
                      aria-label={`Row ${r + 1}, column ${c + 1}`}
                      placeholder={r === 0 ? "Header" : ""}
                      value={value}
                      onChange={(e) =>
                        setCells((previous) =>
                          previous.map((row, i) =>
                            row.map((cell, j) => (i === r && j === c ? e.target.value : cell)),
                          ),
                        )
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="composer-actions">
        <button className="quiet-button" onClick={onClose}>
          Cancel
        </button>
        <button className="primary-button" onClick={() => onInsert(tableMarkdown(cells))}>
          {initial ? "Update table" : "Insert table"}
        </button>
      </div>
    </Modal>
  );
}

export function EquationComposer({
  onClose,
  onInsert,
}: {
  onClose(): void;
  onInsert(text: string): void;
}) {
  const host = useRef<HTMLDivElement>(null),
    field = useRef<MathfieldElement | null>(null);
  const [value, setValue] = useState(""),
    [display, setDisplay] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void import("mathlive")
      .then(({ MathfieldElement }) => {
        if (!live || !host.current) return;
        MathfieldElement.fontsDirectory = "/mathlive-fonts";
        MathfieldElement.soundsDirectory = null;
        const element = new MathfieldElement();
        element.setAttribute("aria-label", "Equation");
        element.mathVirtualKeyboardPolicy = "manual";
        element.addEventListener("input", () => setValue(element.value));
        host.current.replaceChildren(element);
        field.current = element;
        element.focus();
      })
      .catch(() =>
        setError("The equation editor could not open. Reopen this panel and try again."),
      );
    return () => {
      live = false;
      field.current?.remove();
      field.current = null;
    };
  }, []);
  const templates = [
    ["Fraction", "\\frac{#0}{#?}"],
    ["Square root", "\\sqrt{#0}"],
    ["Power", "#0^{#?}"],
    ["Subscript", "#0_{#?}"],
    ["Integral", "\\int_{#?}^{#?}#0\\,dx"],
    ["Sum", "\\sum_{n=#?}^{#?}#0"],
    ["Matrix", "\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}"],
    ["Pi", "\\pi"],
    ["Theta", "\\theta"],
    ["Infinity", "\\infty"],
  ];
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Insert equation"
      description="Type as you would on paper: / makes a fraction, ^ makes a power, and sqrt or pi become symbols. Arrow keys move between slots."
      className="equation-composer"
    >
      <div className="equation-field" ref={host} />
      <div className="equation-templates">
        {templates.map(([name, latex]) => (
          <button
            className="secondary-button"
            key={name}
            onClick={() => {
              field.current?.insert(latex, { focus: true, selectionMode: "placeholder" });
              setValue(field.current?.value || "");
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <label className="composer-checkbox">
        <input type="checkbox" checked={display} onChange={(e) => setDisplay(e.target.checked)} />
        Put the equation on its own line
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="composer-actions">
        <button className="quiet-button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="primary-button"
          disabled={!value.trim()}
          onClick={() => onInsert(display ? "\n\n$$\n" + value + "\n$$\n\n" : "$" + value + "$")}
        >
          Insert equation
        </button>
      </div>
    </Modal>
  );
}
