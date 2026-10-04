/**
 * A small regex tokenizer for C source, good enough for lab programs: comments, strings, preprocessor directives,
 * numbers, keywords, types, macros and function calls. Output is split into lines for a numbered viewer.
 */

export type CTokenKind = 'comment' | 'string' | 'preproc' | 'number' | 'keyword' | 'type' | 'macro' | 'func' | 'punct' | 'plain';

export interface CToken {
  text: string;
  kind: CTokenKind;
}

const KEYWORDS = new Set([
  'if', 'else', 'while', 'for', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'goto',
  'sizeof', 'typedef', 'struct', 'union', 'enum', 'static', 'const', 'extern', 'volatile', 'register', 'inline',
]);

const TYPES = new Set([
  'int', 'float', 'double', 'char', 'void', 'long', 'short', 'unsigned', 'signed', 'size_t', 'FILE', 'bool',
  'uint8_t', 'uint16_t', 'uint32_t', 'int32_t', 'int64_t', 'uint64_t',
]);

// 1 comment · 2 string/char · 3 preprocessor (directive + first argument) · 4 number · 5 identifier · 6 punctuation
const TOKEN_RE =
  /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(^[ \t]*#[ \t]*\w+(?:[ \t]+(?:<[^>\n]*>|"[^"\n]*"|\w+))?)|(\b(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[fFuUlL]*)\b)|([A-Za-z_]\w*)|([{}()[\];,.<>=!+\-*/%&|^~?:])/gm;

export function tokenizeC(src: string): CToken[] {
  const out: CToken[] = [];
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  for (let m = TOKEN_RE.exec(src); m !== null; m = TOKEN_RE.exec(src)) {
    if (m.index > last) out.push({ text: src.slice(last, m.index), kind: 'plain' });
    const text = m[0];
    let kind: CTokenKind = 'plain';
    if (m[1] !== undefined) kind = 'comment';
    else if (m[2] !== undefined) kind = 'string';
    else if (m[3] !== undefined) kind = 'preproc';
    else if (m[4] !== undefined) kind = 'number';
    else if (m[5] !== undefined) {
      if (KEYWORDS.has(text)) kind = 'keyword';
      else if (TYPES.has(text)) kind = 'type';
      else if (text === 'NULL' || (text.length > 1 && /^[A-Z][A-Z0-9_]*$/.test(text))) kind = 'macro';
      else if (src[TOKEN_RE.lastIndex] === '(') kind = 'func';
    } else if (m[6] !== undefined) kind = 'punct';
    out.push({ text, kind });
    last = TOKEN_RE.lastIndex;
    if (text.length === 0) TOKEN_RE.lastIndex++;
  }
  if (last < src.length) out.push({ text: src.slice(last), kind: 'plain' });
  return out;
}

/** Tokens regrouped per source line (multi-line comments are split across lines). */
export function highlightLines(src: string): CToken[][] {
  const lines: CToken[][] = [[]];
  for (const tk of tokenizeC(src.replace(/\r\n?/g, '\n'))) {
    const parts = tk.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, kind: tk.kind });
    });
  }
  if (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop();
  return lines;
}

export const C_TOKEN_CLASS: Record<CTokenKind, string> = {
  comment: 'italic text-fg-subtle',
  string: 'text-[#a9bfd1]',
  preproc: 'text-silver/80',
  number: 'text-white',
  keyword: 'font-semibold text-cloud',
  type: 'text-silver',
  macro: 'text-[#d6dfe6]',
  func: 'text-cloud',
  punct: 'text-fg-subtle',
  plain: 'text-fg-muted',
};
