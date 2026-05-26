// Mermaid + Persian helper.
//
// Mermaid's parser is LTR-only; bare Persian inside a label collapses
// RTL chars across the surrounding syntax (arrows, brackets, hashes
// for shape) and renders garbled. Inserting `&lrm;` (left-to-right
// mark, U+200E) between the Mermaid syntax and the Persian label
// text is the conventional fix.
//
// This is a renderer-side helper: the LLM is instructed (in the .fa.md
// templates) to emit Persian labels with `&lrm;` already present. This
// helper is a safety net — if the model forgot, we sweep the diagram
// and inject the marker before label text.

const LRM = "‎";

// Mermaid label shapes we wrap: [text], (text), ((text)), [[text]],
// [/text/], [\text\], {text}, {{text}}. We don't need to recognise
// every shape — only those that contain non-ASCII chars.
const LABEL_RE = /(\[\[|\[\/|\[\\|\(\(|\{\{|\[|\(|\{)\s*([^\]\)\}\\\/]*[؀-ۿ][^\]\)\}\\\/]*)\s*(\\]|\/]|\]\]|\)\)|\}\}|\]|\)|\})/g;

export function ensureLrmInLabels(mermaid: string): string {
  return mermaid.replace(LABEL_RE, (match, open: string, label: string, close: string) => {
    if (label.includes(LRM)) return match;
    return `${open}${LRM}${label}${LRM}${close}`;
  });
}
