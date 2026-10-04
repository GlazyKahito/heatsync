import { describe, expect, it } from 'vitest';
import {
  LinkedStack,
  PRECEDENCE,
  compileRule,
  evaluatePostfix,
  evaluateRule,
  infixToPostfix,
  tokenize,
  tokensToString,
  type Token,
} from '../stack';

function postfixOf(expr: string): string {
  const lex = tokenize(expr);
  expect(lex.error).toBeUndefined();
  const r = infixToPostfix(lex.tokens);
  expect(r.result.error).toBeUndefined();
  return tokensToString(r.result.postfix);
}

function conversionError(expr: string): string | undefined {
  return compileRule(expr).error;
}

function evalExpr(expr: string, env: Record<string, number | boolean> = {}) {
  const compiled = compileRule(expr);
  expect(compiled.error).toBeUndefined();
  return evaluatePostfix(compiled.postfix, env);
}

describe('LinkedStack', () => {
  it('is LIFO on top of the linked list', () => {
    const s = new LinkedStack<number>();
    expect(s.isEmpty()).toBe(true);
    const p = s.push(1);
    expect(p.result.id).toBe('n1');
    expect(p.steps.map((x) => x.kind)).toEqual(['push']);
    s.push(2);
    s.push(3);
    expect(s.size).toBe(3);
    expect(s.peek()).toBe(3);
    expect(s.toArray()).toEqual([3, 2, 1]);
    const snap = s.snapshot();
    expect(snap.top).toBe('n3');
    expect(snap.nodes.map((n) => n.value)).toEqual([3, 2, 1]);
    const r = s.pop();
    expect(r.result).toEqual({ ok: true, value: 3 });
    expect(r.steps[0].kind).toBe('pop');
    expect(r.steps[0].snapshot.top).toBe('n2');
    expect(s.pop().result).toEqual({ ok: true, value: 2 });
    expect(s.pop().result).toEqual({ ok: true, value: 1 });
  });

  it('reports underflow', () => {
    const s = new LinkedStack<string>();
    const r = s.pop();
    expect(r.result).toEqual({ ok: false, reason: 'underflow' });
    expect(r.steps[0].kind).toBe('error');
    expect(s.peek()).toBeUndefined();
  });
});

describe('tokenize', () => {
  it('reads identifiers, numbers, operators and parentheses with positions', () => {
    const { tokens, error } = tokenize('tmax_1 >= 40.5 && !(x != .5)');
    expect(error).toBeUndefined();
    expect(tokens.map((t) => [t.type, t.text, t.pos])).toEqual([
      ['ident', 'tmax_1', 0],
      ['op', '>=', 7],
      ['number', '40.5', 10],
      ['op', '&&', 15],
      ['op', '!', 18],
      ['lparen', '(', 19],
      ['ident', 'x', 20],
      ['op', '!=', 22],
      ['number', '.5', 25],
      ['rparen', ')', 27],
    ]);
    expect(tokens[2].value).toBe(40.5);
    expect(tokens[8].value).toBe(0.5);
  });

  it('reads every operator', () => {
    const ops = tokenize('a+b-c*d/e>f<g>=h<=i==j!=k&&l||!m').tokens.filter((t) => t.type === 'op').map((t) => t.text);
    expect(ops).toEqual(['+', '-', '*', '/', '>', '<', '>=', '<=', '==', '!=', '&&', '||', '!']);
  });

  it('reports bad input without throwing', () => {
    expect(tokenize('a = 3').error?.pos).toBe(2);
    expect(tokenize('a = 3').error?.message).toContain("'=='");
    expect(tokenize('a & b').error?.pos).toBe(2);
    expect(tokenize('a | b').error?.message).toContain("'||'");
    expect(tokenize('temp # 3').error?.message).toContain("'#'");
    expect(tokenize('3.').error?.message).toContain('Malformed number');
    expect(tokenize('3x').error?.pos).toBe(1);
    expect(tokenize('1.2.3').error).toBeDefined();
    const partial = tokenize('a + @');
    expect(partial.tokens.map((t) => t.text)).toEqual(['a', '+']);
  });

  it('handles empty input', () => {
    expect(tokenize('   ')).toEqual({ tokens: [] });
  });
});

describe('infixToPostfix', () => {
  it('respects arithmetic precedence and parentheses', () => {
    expect(postfixOf('a + b * c')).toBe('a b c * +');
    expect(postfixOf('(a + b) * c')).toBe('a b + c *');
    expect(postfixOf('a * (b + c) / d')).toBe('a b c + * d /');
    expect(postfixOf('((a))')).toBe('a');
  });

  it('is left-associative for binary operators', () => {
    expect(postfixOf('a - b - c')).toBe('a b - c -');
    expect(postfixOf('a / b * c')).toBe('a b / c *');
    expect(postfixOf('a && b && c')).toBe('a b && c &&');
  });

  it('orders comparison, equality and logical operators', () => {
    expect(postfixOf('tmax >= 40 && dep >= 4.5 || severe')).toBe('tmax 40 >= dep 4.5 >= && severe ||');
    expect(postfixOf('a || b && c')).toBe('a b c && ||');
    expect(postfixOf('a < b == c > d')).toBe('a b < c d > ==');
    expect(postfixOf('a + 1 > b * 2')).toBe('a 1 + b 2 * >');
    expect(postfixOf('x != y && z == 1')).toBe('x y != z 1 == &&');
  });

  it('treats ! as a right-associative unary operator with top precedence', () => {
    expect(postfixOf('!a && b')).toBe('a ! b &&');
    expect(postfixOf('!!a')).toBe('a ! !');
    expect(postfixOf('a == !b')).toBe('a b ! ==');
    expect(postfixOf('!(a || b)')).toBe('a b || !');
    expect(PRECEDENCE['!']).toBeGreaterThan(PRECEDENCE['*']);
  });

  it('detects mismatched parentheses', () => {
    expect(conversionError('(a + b')).toMatch(/Mismatched '\('/);
    expect(conversionError('a + b)')).toMatch(/Mismatched '\)'/);
    expect(conversionError('((a) + b')).toMatch(/Mismatched '\('/);
    expect(compileRule('(a + b').errorPos).toBe(0);
    expect(compileRule('a + b)').errorPos).toBe(5);
  });

  it('detects operator and operand errors', () => {
    expect(conversionError('a b')).toMatch(/Missing operator/);
    expect(conversionError('a (b)')).toMatch(/Missing operator/);
    expect(conversionError('a +')).toMatch(/missing operand/);
    expect(conversionError('* a')).toMatch(/left operand/);
    expect(conversionError('a + * b')).toMatch(/left operand/);
    expect(conversionError('()')).toMatch(/Empty parentheses/);
    expect(conversionError('(a +)')).toMatch(/Missing operand/);
    expect(conversionError('a !')).toMatch(/cannot follow/);
    expect(conversionError('')).toBe('Empty expression');
    expect(conversionError('-5')).toMatch(/left operand/);
  });

  it('returns an empty postfix and an error step on failure', () => {
    const r = infixToPostfix(tokenize('a +').tokens);
    expect(r.result.postfix).toEqual([]);
    expect(r.steps.at(-1)?.kind).toBe('error');
    expect(r.steps.at(-1)?.snapshot.action).toBe('error');
  });

  it('records stack and output snapshots, stack listed top first', () => {
    const r = infixToPostfix(tokenize('a + b * c').tokens);
    const kinds = r.steps.map((s) => s.kind);
    expect(kinds).toEqual(['output', 'push', 'output', 'push', 'output', 'pop', 'pop', 'done']);
    const afterStar = r.steps[3].snapshot;
    expect(afterStar).toEqual({ stack: ['*', '+'], output: ['a', 'b'], token: '*', action: 'push' });
    expect(r.steps[3].focus).toEqual([3]);
    expect(r.steps[5].snapshot.action).toBe('flush');
    expect(r.steps[5].snapshot.token).toBe('');
    expect(r.steps.at(-1)?.snapshot.output).toEqual(['a', 'b', 'c', '*', '+']);
    expect(r.steps.at(-1)?.snapshot.stack).toEqual([]);
  });

  it('records discard steps for parentheses', () => {
    const r = infixToPostfix(tokenize('(a + b) * c').tokens);
    expect(r.steps.map((s) => s.kind)).toContain('discard');
  });
});

describe('evaluatePostfix', () => {
  it('evaluates arithmetic', () => {
    expect(evalExpr('2 + 3 * 4').result).toEqual({ value: 14 });
    expect(evalExpr('(2 + 3) * 4').result).toEqual({ value: 20 });
    expect(evalExpr('10 - 4 - 3').result).toEqual({ value: 3 });
    expect(evalExpr('8 / 2 / 2').result).toEqual({ value: 2 });
  });

  it('produces booleans from comparisons and combines them', () => {
    const env = { tmax: 41.2, normal: 36.1, coastal: false };
    expect(evalExpr('tmax >= 40', env).result.value).toBe(true);
    expect(evalExpr('tmax - normal >= 4.5', env).result.value).toBe(true);
    expect(evalExpr('tmax >= 40 && tmax - normal >= 6.5', env).result.value).toBe(false);
    expect(evalExpr('tmax >= 45 || tmax - normal >= 4.5', env).result.value).toBe(true);
    expect(evalExpr('!coastal && tmax >= 40', env).result.value).toBe(true);
    expect(evalExpr('tmax == 41.2', env).result.value).toBe(true);
    expect(evalExpr('tmax != 41.2', env).result.value).toBe(false);
    expect(evalExpr('coastal == false_flag', { coastal: false, false_flag: false }).result.value).toBe(true);
    expect(evalExpr('3 < 2', env).result.value).toBe(false);
    expect(evalExpr('2 <= 2', env).result.value).toBe(true);
  });

  it('reports an unknown variable', () => {
    const r = evalExpr('tmax >= 40 && humidity > 50', { tmax: 42 });
    expect(r.result.error).toBe("Unknown variable 'humidity'");
    expect(r.result.value).toBe(false);
    expect(r.steps.at(-1)?.kind).toBe('error');
  });

  it('reports type errors and division by zero', () => {
    expect(evalExpr('1 && 2').result.error).toMatch(/booleans/);
    expect(evalExpr('!5').result.error).toMatch(/boolean/);
    expect(evalExpr('(1 > 0) + 1').result.error).toMatch(/numbers/);
    expect(evalExpr('(1 > 0) == 1').result.error).toMatch(/same type/);
    expect(evalExpr('4 / 0').result.error).toMatch(/Division by zero/);
  });

  it('reports malformed postfix', () => {
    const plus: Token = { type: 'op', text: '+', pos: 0 };
    const one: Token = { type: 'number', text: '1', pos: 0, value: 1 };
    expect(evaluatePostfix([one, plus], {}).result.error).toMatch(/two operands/);
    expect(evaluatePostfix([one, one], {}).result.error).toMatch(/2 values left/);
    expect(evaluatePostfix([], {}).result.error).toBe('Empty expression');
    expect(evaluatePostfix([{ type: 'op', text: '!', pos: 0 }], {}).result.error).toMatch(/one operand/);
    expect(evaluatePostfix([{ type: 'lparen', text: '(', pos: 0 }], {}).result.error).toMatch(/Unexpected/);
  });

  it('steps show the value stack top first', () => {
    const r = evalExpr('a + b * 2', { a: 1, b: 3 });
    expect(r.result.value).toBe(7);
    expect(r.steps.map((s) => s.kind)).toEqual(['push', 'push', 'push', 'apply', 'apply', 'result']);
    expect(r.steps[2].snapshot).toEqual({ stack: [2, 3, 1], token: '2' });
    expect(r.steps[3].snapshot.stack).toEqual([6, 1]);
    expect(r.steps.at(-1)?.snapshot.stack).toEqual([7]);
  });
});

describe('compileRule / evaluateRule', () => {
  it('compiles a rule into tokens, postfix and steps', () => {
    const c = compileRule('tmax >= 40 && (tmax - normal) >= 4.5');
    expect(c.error).toBeUndefined();
    expect(c.tokens).toHaveLength(11);
    expect(tokensToString(c.postfix)).toBe('tmax 40 >= tmax normal - 4.5 >= &&');
    expect(c.steps.at(-1)?.kind).toBe('done');
  });

  it('surfaces tokenizer errors as a single error step', () => {
    const c = compileRule('tmax => 40');
    expect(c.error).toMatch(/Unexpected character '='/);
    expect(c.errorPos).toBe(5);
    expect(c.postfix).toEqual([]);
    expect(c.steps).toHaveLength(1);
    expect(c.steps[0].kind).toBe('error');
  });

  it('records no steps when maxSteps is 0', () => {
    expect(compileRule('a + b', { maxSteps: 0 }).steps).toHaveLength(0);
    expect(compileRule('a +', { maxSteps: 0 }).steps).toHaveLength(0);
  });

  it('evaluates a rule end to end for several districts', () => {
    const rule = 'tmax >= 40 && (tmax - normal >= 4.5 || tmax >= 45)';
    expect(evaluateRule(rule, { tmax: 44, normal: 38 }).value).toBe(true);
    expect(evaluateRule(rule, { tmax: 41, normal: 38 }).value).toBe(false);
    expect(evaluateRule(rule, { tmax: 46, normal: 44 }).value).toBe(true);
    expect(evaluateRule(rule, { tmax: 39, normal: 30 }).value).toBe(false);
    expect(evaluateRule('tmax >=', { tmax: 1 }).error).toBeDefined();
    expect(tokensToString(evaluateRule(rule, { tmax: 44, normal: 38 }).postfix)).toBe('tmax 40 >= tmax normal - 4.5 >= tmax 45 >= || &&');
  });
});
