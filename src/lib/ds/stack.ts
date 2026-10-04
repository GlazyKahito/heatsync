/**
 * EXP3 - Stack on a singly linked list, and infix to postfix conversion.
 *
 * `LinkedStack` is a dynamic stack whose top is the head of a
 * {@link SinglyLinkedList}: push = insertAtBegin, pop = deleteFirst.
 * The rule compiler tokenizes heatwave criteria such as
 * `tmax >= 40 && (tmax - normal) >= 4.5`, converts them to postfix with the
 * stack (shunting-yard) and evaluates the postfix for a district.
 * Powers the HEATSYNC Rule Compiler.
 */
import { SinglyLinkedList, type ListNodeView } from './linked-list';
import { DEFAULT_MAX_STEPS, Tracer, describeValue, type Step, type TraceOptions, type Traced } from './trace';

// ---------------------------------------------------------------------------
// Linked stack
// ---------------------------------------------------------------------------

/** Immutable view of a {@link LinkedStack}; `nodes` run from top to bottom. */
export interface StackSnapshot<T> {
  top: string | null;
  nodes: ListNodeView<T>[];
}

export type StackPopResult<T> = { ok: true; value: T } | { ok: false; reason: 'underflow' };

export interface LinkedStackOptions<T> {
  /** Step cap per operation (default 5000, 0 disables recording). */
  maxSteps?: number;
  /** Label used for values in step messages. */
  describe?: (value: T) => string;
}

export class LinkedStack<T> {
  /** Step cap per operation; may be changed at any time (0 disables recording). */
  maxSteps: number;
  private readonly list: SinglyLinkedList<T>;
  private readonly describe: (value: T) => string;

  constructor(options: LinkedStackOptions<T> = {}) {
    this.maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
    this.describe = options.describe ?? describeValue;
    this.list = new SinglyLinkedList<T>({ maxSteps: 0, describe: this.describe });
  }

  get size(): number {
    return this.list.size;
  }

  isEmpty(): boolean {
    return this.list.isEmpty();
  }

  /** Top value without removing it. O(1). */
  peek(): T | undefined {
    return this.list.peekFirst();
  }

  /** Pushes via insertAtBegin. O(1). Never overflows (dynamic memory). */
  push(value: T): Traced<{ id: string }, StackSnapshot<T>> {
    const t = this.tracer();
    const below = this.list.headId;
    const { result } = this.list.insertAtBegin(value);
    t.step('push', `Push ${this.describe(value)}: new node ${result.id} points to old top (${below ?? 'NULL'}) and becomes top.`, [result.id]);
    return t.finish(result);
  }

  /** Pops via deleteFirst. O(1). Reports underflow instead of throwing. */
  pop(): Traced<StackPopResult<T>, StackSnapshot<T>> {
    const t = this.tracer();
    const { result } = this.list.deleteFirst();
    if (!result.ok) {
      t.step('error', 'Stack underflow: top is NULL.');
      return t.finish({ ok: false, reason: 'underflow' });
    }
    t.step('pop', `Pop ${this.describe(result.value)}: top moves to ${this.list.headId ?? 'NULL'}, node ${result.id} is freed.`, [result.id]);
    return t.finish({ ok: true, value: result.value });
  }

  /** Values from top to bottom. */
  toArray(): T[] {
    return this.list.toArray();
  }

  /** Deep copy, top first. */
  snapshot(): StackSnapshot<T> {
    const s = this.list.snapshot();
    return { top: s.head, nodes: s.nodes };
  }

  private tracer(): Tracer<StackSnapshot<T>> {
    return new Tracer(() => this.snapshot(), this.maxSteps);
  }
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

export type TokenType = 'number' | 'ident' | 'op' | 'lparen' | 'rparen';

export interface Token {
  type: TokenType;
  /** Exact source text, e.g. '>=', 'tmax', '4.5'. */
  text: string;
  /** 0-based character offset in the source expression. */
  pos: number;
  /** Numeric value for 'number' tokens. */
  value?: number;
}

export interface TokenizeResult {
  /** Tokens read before any error. */
  tokens: Token[];
  error?: { pos: number; message: string };
}

/**
 * Operator precedence, higher binds tighter.
 * `!` is unary and right-associative; all binary operators are left-associative.
 */
export const PRECEDENCE: Readonly<Record<string, number>> = {
  '!': 7,
  '*': 6,
  '/': 6,
  '+': 5,
  '-': 5,
  '>': 4,
  '>=': 4,
  '<': 4,
  '<=': 4,
  '==': 3,
  '!=': 3,
  '&&': 2,
  '||': 1,
};

const TWO_CHAR_OPS = ['>=', '<=', '==', '!=', '&&', '||'];
const ONE_CHAR_OPS = ['+', '-', '*', '/', '>', '<', '!'];

function isDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}

function isIdentStart(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
}

function isSpace(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r';
}

/**
 * Splits an infix rule into tokens: identifiers `[a-zA-Z_][a-zA-Z0-9_]*`,
 * numbers (`12`, `4.5`, `.5`), operators `+ - * / >= <= > < == != && || !`
 * and parentheses. Never throws; the first bad character is reported in `error`.
 */
export function tokenize(expr: string): TokenizeResult {
  const tokens: Token[] = [];
  const n = expr.length;
  let i = 0;
  while (i < n) {
    const c = expr[i];
    if (isSpace(c)) {
      i++;
      continue;
    }
    if (isIdentStart(c)) {
      const start = i;
      while (i < n && (isIdentStart(expr[i]) || isDigit(expr[i]))) i++;
      tokens.push({ type: 'ident', text: expr.slice(start, i), pos: start });
      continue;
    }
    if (isDigit(c) || (c === '.' && i + 1 < n && isDigit(expr[i + 1]))) {
      const start = i;
      while (i < n && isDigit(expr[i])) i++;
      if (i < n && expr[i] === '.') {
        i++;
        if (i >= n || !isDigit(expr[i])) {
          return { tokens, error: { pos: start, message: `Malformed number '${expr.slice(start, i)}' at position ${start}` } };
        }
        while (i < n && isDigit(expr[i])) i++;
      }
      if (i < n && (isIdentStart(expr[i]) || expr[i] === '.')) {
        return { tokens, error: { pos: i, message: `Unexpected '${expr[i]}' after number at position ${i}` } };
      }
      const text = expr.slice(start, i);
      tokens.push({ type: 'number', text, pos: start, value: Number(text) });
      continue;
    }
    if (c === '(' || c === ')') {
      tokens.push({ type: c === '(' ? 'lparen' : 'rparen', text: c, pos: i });
      i++;
      continue;
    }
    const pair = expr.slice(i, i + 2);
    if (TWO_CHAR_OPS.includes(pair)) {
      tokens.push({ type: 'op', text: pair, pos: i });
      i += 2;
      continue;
    }
    if (ONE_CHAR_OPS.includes(c)) {
      tokens.push({ type: 'op', text: c, pos: i });
      i++;
      continue;
    }
    const hint = c === '=' ? " (use '==' to compare)" : c === '&' ? " (use '&&')" : c === '|' ? " (use '||')" : '';
    return { tokens, error: { pos: i, message: `Unexpected character '${c}' at position ${i}${hint}` } };
  }
  return { tokens };
}

/** Joins token texts with single spaces, e.g. "tmax 40 >=". */
export function tokensToString(tokens: readonly Token[]): string {
  return tokens.map((tk) => tk.text).join(' ');
}

// ---------------------------------------------------------------------------
// Infix to postfix
// ---------------------------------------------------------------------------

/** Frame of the infix-to-postfix conversion. `stack` is listed top first. */
export interface InfixSnapshot {
  stack: string[];
  output: string[];
  /** Token being processed; '' once the input is exhausted. */
  token: string;
  /** What happened: 'output' | 'push' | 'pop' | 'discard' | 'flush' | 'done' | 'error'. */
  action: string;
}

export interface InfixResult {
  /** Postfix tokens; empty when `error` is set. */
  postfix: Token[];
  error?: string;
  /** Source position of the offending token. */
  errorPos?: number;
}

/**
 * Shunting-yard conversion using a {@link LinkedStack} of operators. O(n).
 * Detects mismatched parentheses, missing operands and missing operators.
 * Step `focus` is the index of the current token in `tokens`.
 */
export function infixToPostfix(tokens: readonly Token[], options: TraceOptions = {}): Traced<InfixResult, InfixSnapshot> {
  const stack = new LinkedStack<Token>({ maxSteps: 0 });
  const output: Token[] = [];
  let token = '';
  let action = '';
  const t = new Tracer<InfixSnapshot>(
    () => ({ stack: stack.toArray().map((tk) => tk.text), output: output.map((tk) => tk.text), token, action }),
    options.maxSteps ?? DEFAULT_MAX_STEPS,
  );
  const record = (kind: string, act: string, message: string, focus?: number): void => {
    action = act;
    t.step(kind, message, focus === undefined ? undefined : [focus]);
  };
  const fail = (message: string, pos: number, focus?: number): Traced<InfixResult, InfixSnapshot> => {
    record('error', 'error', message, focus);
    return t.finish({ postfix: [], error: message, errorPos: pos });
  };

  if (tokens.length === 0) return fail('Empty expression', 0);

  let expectOperand = true;
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    token = tk.text;
    if (tk.type === 'number' || tk.type === 'ident') {
      if (!expectOperand) return fail(`Missing operator before '${tk.text}' at position ${tk.pos}`, tk.pos, i);
      output.push(tk);
      record('output', 'output', `Operand ${tk.text} goes straight to the output.`, i);
      expectOperand = false;
    } else if (tk.type === 'lparen') {
      if (!expectOperand) return fail(`Missing operator before '(' at position ${tk.pos}`, tk.pos, i);
      stack.push(tk);
      record('push', 'push', "'(' is pushed onto the stack.", i);
    } else if (tk.type === 'rparen') {
      if (expectOperand) {
        const prev = i > 0 ? tokens[i - 1] : undefined;
        const msg =
          prev !== undefined && prev.type === 'lparen'
            ? `Empty parentheses at position ${prev.pos}`
            : `Missing operand before ')' at position ${tk.pos}`;
        return fail(msg, tk.pos, i);
      }
      let matched = false;
      for (let top = stack.peek(); top !== undefined; top = stack.peek()) {
        stack.pop();
        if (top.type === 'lparen') {
          record('discard', 'discard', "Matching '(' popped and both parentheses discarded.", i);
          matched = true;
          break;
        }
        output.push(top);
        record('pop', 'pop', `')' pops ${top.text} to the output.`, i);
      }
      if (!matched) return fail(`Mismatched ')' at position ${tk.pos}: no matching '('`, tk.pos, i);
    } else if (tk.text === '!') {
      if (!expectOperand) return fail(`'!' at position ${tk.pos} cannot follow an operand`, tk.pos, i);
      stack.push(tk);
      record('push', 'push', "Unary '!' is right-associative: push without popping.", i);
    } else {
      if (expectOperand) return fail(`Operator '${tk.text}' at position ${tk.pos} is missing its left operand`, tk.pos, i);
      const p = PRECEDENCE[tk.text];
      for (let top = stack.peek(); top !== undefined && top.type === 'op'; top = stack.peek()) {
        const tp = PRECEDENCE[top.text];
        if (tp < p) break;
        stack.pop();
        output.push(top);
        record('pop', 'pop', `Top ${top.text} has ${tp > p ? 'higher' : 'equal'} precedence than ${tk.text}: pop it to the output.`, i);
      }
      stack.push(tk);
      record('push', 'push', `Push operator ${tk.text}.`, i);
      expectOperand = true;
    }
  }

  token = '';
  if (expectOperand) {
    const last = tokens[tokens.length - 1];
    return fail(`Expression ends with '${last.text}': missing operand`, last.pos, tokens.length - 1);
  }
  for (let top = stack.peek(); top !== undefined; top = stack.peek()) {
    stack.pop();
    if (top.type === 'lparen') return fail(`Mismatched '(' at position ${top.pos}: it is never closed`, top.pos);
    output.push(top);
    record('pop', 'flush', `End of input: pop ${top.text} to the output.`);
  }
  record('done', 'done', `Postfix: ${tokensToString(output)}`);
  return t.finish({ postfix: output.slice() });
}

// ---------------------------------------------------------------------------
// Postfix evaluation
// ---------------------------------------------------------------------------

export type RuleValue = number | boolean;

/** Frame of postfix evaluation. `stack` is listed top first. */
export interface EvalSnapshot {
  stack: RuleValue[];
  token: string;
}

export interface EvalResult {
  /** Final value; `false` when `error` is set, so a broken rule never fires. */
  value: RuleValue;
  error?: string;
}

type Applied = { ok: true; value: RuleValue } | { ok: false; error: string };

function applyBinary(op: string, a: RuleValue, b: RuleValue): Applied {
  switch (op) {
    case '+':
    case '-':
    case '*':
    case '/': {
      if (typeof a !== 'number' || typeof b !== 'number') return { ok: false, error: `'${op}' needs two numbers, got ${a} and ${b}` };
      if (op === '/' && b === 0) return { ok: false, error: `Division by zero in ${a} / ${b}` };
      return { ok: true, value: op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b };
    }
    case '>':
    case '>=':
    case '<':
    case '<=': {
      if (typeof a !== 'number' || typeof b !== 'number') return { ok: false, error: `'${op}' needs two numbers, got ${a} and ${b}` };
      return { ok: true, value: op === '>' ? a > b : op === '>=' ? a >= b : op === '<' ? a < b : a <= b };
    }
    case '==':
    case '!=':
      if (typeof a !== typeof b) return { ok: false, error: `'${op}' needs two values of the same type, got ${a} and ${b}` };
      return { ok: true, value: op === '==' ? a === b : a !== b };
    case '&&':
    case '||':
      if (typeof a !== 'boolean' || typeof b !== 'boolean') return { ok: false, error: `'${op}' needs two booleans, got ${a} and ${b}` };
      return { ok: true, value: op === '&&' ? a && b : a || b };
    default:
      return { ok: false, error: `Unknown operator '${op}'` };
  }
}

/**
 * Evaluates postfix tokens with a {@link LinkedStack}. O(n).
 * Variables come from `env`; comparisons yield booleans; `&& || !` need booleans,
 * arithmetic and ordering need numbers. Errors: unknown variable, type mismatch,
 * division by zero, too few operands, leftover values.
 */
export function evaluatePostfix(
  postfix: readonly Token[],
  env: Readonly<Record<string, RuleValue>>,
  options: TraceOptions = {},
): Traced<EvalResult, EvalSnapshot> {
  const stack = new LinkedStack<RuleValue>({ maxSteps: 0 });
  let token = '';
  const t = new Tracer<EvalSnapshot>(() => ({ stack: stack.toArray(), token }), options.maxSteps ?? DEFAULT_MAX_STEPS);
  const fail = (message: string, focus?: number): Traced<EvalResult, EvalSnapshot> => {
    t.step('error', message, focus === undefined ? undefined : [focus]);
    return t.finish({ value: false, error: message });
  };
  const popValue = (): RuleValue | undefined => {
    const v = stack.peek();
    if (v !== undefined) stack.pop();
    return v;
  };

  if (postfix.length === 0) return fail('Empty expression');
  for (let i = 0; i < postfix.length; i++) {
    const tk = postfix[i];
    token = tk.text;
    if (tk.type === 'number') {
      const v = tk.value ?? Number(tk.text);
      stack.push(v);
      t.step('push', `Number ${tk.text}: push it.`, [i]);
    } else if (tk.type === 'ident') {
      if (!Object.prototype.hasOwnProperty.call(env, tk.text)) return fail(`Unknown variable '${tk.text}'`, i);
      const v = env[tk.text];
      if (typeof v !== 'number' && typeof v !== 'boolean') return fail(`Variable '${tk.text}' is not a number or boolean`, i);
      stack.push(v);
      t.step('push', `Variable ${tk.text} = ${v}: push it.`, [i]);
    } else if (tk.type !== 'op') {
      return fail(`Unexpected '${tk.text}' in postfix`, i);
    } else if (tk.text === '!') {
      const a = popValue();
      if (a === undefined) return fail("'!' needs one operand", i);
      if (typeof a !== 'boolean') return fail(`'!' needs a boolean, got ${a}`, i);
      stack.push(!a);
      t.step('apply', `Pop ${a}, compute !${a} = ${!a}, push it.`, [i]);
    } else {
      const b = popValue();
      const a = popValue();
      if (a === undefined || b === undefined) return fail(`Operator '${tk.text}' needs two operands`, i);
      const r = applyBinary(tk.text, a, b);
      if (!r.ok) return fail(r.error, i);
      stack.push(r.value);
      t.step('apply', `Pop ${a} and ${b}, compute ${a} ${tk.text} ${b} = ${r.value}, push it.`, [i]);
    }
  }
  token = '';
  if (stack.size !== 1) return fail(`Malformed expression: ${stack.size} values left on the stack`);
  const value = stack.peek() as RuleValue;
  t.step('result', `The single value left on the stack is the result: ${value}.`);
  return t.finish({ value });
}

// ---------------------------------------------------------------------------
// Convenience
// ---------------------------------------------------------------------------

export interface CompiledRule {
  tokens: Token[];
  /** Empty when `error` is set. */
  postfix: Token[];
  /** Conversion steps (a single 'error' step for tokenizer errors). */
  steps: Step<InfixSnapshot>[];
  error?: string;
  errorPos?: number;
}

/** tokenize + infixToPostfix in one call. */
export function compileRule(expr: string, options: TraceOptions = {}): CompiledRule {
  const lex = tokenize(expr);
  if (lex.error !== undefined) {
    const err = lex.error;
    const t = new Tracer<InfixSnapshot>(
      () => ({ stack: [], output: [], token: expr.slice(err.pos, err.pos + 1), action: 'error' }),
      options.maxSteps ?? DEFAULT_MAX_STEPS,
    );
    t.step('error', err.message, [err.pos]);
    return { tokens: lex.tokens, postfix: [], steps: t.steps, error: err.message, errorPos: err.pos };
  }
  const conv = infixToPostfix(lex.tokens, options);
  const out: CompiledRule = { tokens: lex.tokens, postfix: conv.result.postfix, steps: conv.steps };
  if (conv.result.error !== undefined) {
    out.error = conv.result.error;
    out.errorPos = conv.result.errorPos;
  }
  return out;
}

/** Compiles and evaluates a rule without recording steps. */
export function evaluateRule(expr: string, env: Readonly<Record<string, RuleValue>>): EvalResult & { postfix: Token[] } {
  const compiled = compileRule(expr, { maxSteps: 0 });
  if (compiled.error !== undefined) return { value: false, error: compiled.error, postfix: [] };
  const evaluated = evaluatePostfix(compiled.postfix, env, { maxSteps: 0 }).result;
  return { ...evaluated, postfix: compiled.postfix };
}
