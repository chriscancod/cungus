// Vey lexer. A pull lexer: the parser asks for the next token in a mode
// (normal code, inside a JSX tag, or JSX text) from a position, so the same
// source can be re-scanned when the parser backtracks.
export type TokenType = 'num' | 'str' | 'template' | 'fstring' | 'name' | 'kw' | 'op' | 'regex' | 'jsxtext' | 'eof';
export interface Token {
  type: TokenType;
  value: string;          // identifier/keyword/operator text, or decoded string value
  raw: string;            // exact source slice
  start: number; end: number; line: number; col: number;
  nlBefore: boolean;      // a newline separates this token from the previous one
  parts?: TemplatePart[]; // template / f-string pieces
}
export type TemplatePart = { kind: 'text'; value: string; cooked: string } | { kind: 'expr'; expr: unknown; start: number };

export const KEYWORDS = new Set(['fn', 'let', 'const', 'var', 'if', 'elif', 'else', 'for', 'in', 'of', 'while', 'do', 'break', 'continue', 'return',
  'class', 'struct', 'interface', 'enum', 'type', 'import', 'export', 'from', 'as', 'default', 'new', 'this', 'super', 'null', 'undefined', 'true', 'false',
  'and', 'or', 'not', 'is', 'match', 'case', 'try', 'catch', 'finally', 'throw', 'async', 'await', 'static', 'extends', 'implements', 'get', 'set',
  'typeof', 'instanceof', 'delete', 'void', 'satisfies', 'keyof', 'readonly', 'declare', 'global', 'style', 'switch', 'with', 'yield', 'init',
  'private', 'public', 'protected', 'abstract', 'override', 'print', 'assert', 'pass', 'step']);
// Keywords that may also be used as plain property names / identifiers in most places.
export const SOFT = new Set(['from', 'as', 'of', 'get', 'set', 'type', 'is', 'async', 'static', 'declare', 'global', 'readonly', 'satisfies', 'keyof',
  'style', 'match', 'case', 'init', 'private', 'public', 'protected', 'abstract', 'override', 'print', 'assert', 'pass', 'step', 'struct', 'interface', 'enum', 'implements', 'default', 'with', 'fn']);

const PUNCT = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '..=', '??=', '||=', '&&=', '?.', '??', '=>', '==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>', '|>', '..',
  '{', '}', '(', ')', '[', ']', ';', ',', '<', '>', '+', '-', '*', '/', '%', '&', '|', '^', '!', '~', '?', ':', '=', '.', '@'].sort((a, b) => b.length - a.length);

export class VeyError extends Error {
  line: number; col: number; file: string;
  constructor(message: string, line: number, col: number, file = '') { super(message); this.line = line; this.col = col; this.file = file; }
}

const isIdStart = (c: string) => /[A-Za-z_$À-￿]/.test(c);
const isIdPart = (c: string) => /[A-Za-z0-9_$À-￿]/.test(c);

export class Lexer {
  src: string; file: string;
  /** Set by the parser: parses one expression starting at `pos` and returns it with the position just after it. */
  exprParser: ((pos: number) => { expr: unknown; end: number }) | null = null;
  constructor(src: string, file = '') { this.src = src; this.file = file; }
  private lineAt(pos: number): [number, number] {
    let line = 1, col = 1;
    for (let i = 0; i < pos; i++) { if (this.src[i] === '\n') { line++; col = 1; } else col++; }
    return [line, col];
  }
  error(message: string, pos: number): never {
    const [line, col] = this.lineAt(pos);
    throw new VeyError(message, line, col, this.file);
  }
  /** Skips whitespace and comments; returns the new position and whether a newline was crossed. */
  skip(pos: number): [number, boolean] {
    const s = this.src; let nl = false;
    for (;;) {
      const c = s[pos];
      if (c === '\n') { nl = true; pos++; }
      else if (c === ' ' || c === '\t' || c === '\r') pos++;
      else if (c === '#') { while (pos < s.length && s[pos] !== '\n') pos++; }
      else if (c === '/' && s[pos + 1] === '/') { while (pos < s.length && s[pos] !== '\n') pos++; }
      else if (c === '/' && s[pos + 1] === '*') { const end = s.indexOf('*/', pos + 2); if (end < 0) this.error('Unterminated block comment', pos); if (s.slice(pos, end).includes('\n')) nl = true; pos = end + 2; }
      else break;
    }
    return [pos, nl];
  }
  /** Scans one token. `regexOk` says whether a `/` here starts a regular expression. */
  next(pos: number, mode: 'code' | 'jsxtag' | 'jsxtext', regexOk: boolean): Token {
    const s = this.src;
    if (mode === 'jsxtext') return this.jsxText(pos);
    const [p, nl] = this.skip(pos);
    pos = p;
    const [line, col] = this.lineAt(pos);
    const tok = (type: TokenType, end: number, value = s.slice(pos, end), extra: Partial<Token> = {}): Token => ({ type, value, raw: s.slice(pos, end), start: pos, end, line, col, nlBefore: nl, ...extra });
    if (pos >= s.length) return tok('eof', pos, '');
    const c = s[pos];
    if (mode === 'jsxtag') {
      // In a tag: names may contain '-' and ':'; strings are attribute values.
      if (isIdStart(c)) { let e = pos + 1; while (e < s.length && (isIdPart(s[e]) || s[e] === '-' || s[e] === ':')) e++; return tok('name', e); }
      if (c === '"' || c === "'") return this.string(pos, tok);
      for (const pn of ['...', '/>', '</', '=', '{', '}', '<', '>', '/', '.']) if (s.startsWith(pn, pos)) return tok('op', pos + pn.length);
      this.error(`Unexpected character "${c}" in tag`, pos);
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[pos + 1]))) return this.number(pos, tok);
    if ((c === 'f' || c === 'F') && (s[pos + 1] === '"' || s[pos + 1] === "'")) return this.fstring(pos, tok);
    if (c === '"' && s.startsWith('"""', pos)) { const end = s.indexOf('"""', pos + 3); if (end < 0) this.error('Unterminated string', pos); return tok('str', end + 3, s.slice(pos + 3, end)); }
    if (c === '"' || c === "'") return this.string(pos, tok);
    if (c === '`') return this.template(pos, tok);
    if (isIdStart(c)) {
      let e = pos + 1; while (e < s.length && isIdPart(s[e])) e++;
      const word = s.slice(pos, e);
      return tok(KEYWORDS.has(word) ? 'kw' : 'name', e);
    }
    if (c === '/' && regexOk) return this.regex(pos, tok);
    for (const pn of PUNCT) if (s.startsWith(pn, pos)) return tok('op', pos + pn.length);
    this.error(`Unexpected character "${c}"`, pos);
  }
  private number(pos: number, tok: (t: TokenType, e: number, v?: string) => Token): Token {
    const s = this.src; let e = pos;
    if (s[e] === '0' && /[xXbBoO]/.test(s[e + 1])) { e += 2; while (/[0-9a-fA-F_]/.test(s[e] ?? '')) e++; }
    else {
      while (/[0-9_]/.test(s[e] ?? '')) e++;
      if (s[e] === '.' && /[0-9]/.test(s[e + 1] ?? '')) { e++; while (/[0-9_]/.test(s[e] ?? '')) e++; }
      if (/[eE]/.test(s[e] ?? '') && /[0-9+-]/.test(s[e + 1] ?? '')) { e += 2; while (/[0-9]/.test(s[e] ?? '')) e++; }
    }
    if (s[e] === 'n') e++;
    return tok('num', e, s.slice(pos, e).replace(/_/g, ''));
  }
  private readEscape(pos: number): [string, number] {
    const s = this.src; const c = s[pos + 1];
    const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '0': '\0', '\\': '\\', '"': '"', "'": "'", '`': '`', '$': '$', '{': '{', '}': '}', '\n': '' };
    if (c === 'u') { if (s[pos + 2] === '{') { const end = s.indexOf('}', pos); return [String.fromCodePoint(parseInt(s.slice(pos + 3, end), 16)), end + 1]; } return [String.fromCharCode(parseInt(s.slice(pos + 2, pos + 6), 16)), pos + 6]; }
    if (c === 'x') return [String.fromCharCode(parseInt(s.slice(pos + 2, pos + 4), 16)), pos + 4];
    if (c in map) return [map[c], pos + 2];
    return [c, pos + 2];
  }
  private string(pos: number, tok: (t: TokenType, e: number, v?: string) => Token): Token {
    const s = this.src; const q = s[pos]; let e = pos + 1; let out = '';
    while (e < s.length && s[e] !== q) {
      if (s[e] === '\n') this.error('Unterminated string', pos);
      if (s[e] === '\\') { const [ch, ne] = this.readEscape(e); out += ch; e = ne; } else out += s[e++];
    }
    if (e >= s.length) this.error('Unterminated string', pos);
    return tok('str', e + 1, out);
  }
  private embedded(pos: number): { expr: unknown; end: number } {
    if (!this.exprParser) this.error('Embedded expressions need a parser', pos);
    const r = this.exprParser(pos);
    const [after] = this.skip(r.end);
    if (this.src[after] !== '}') this.error('Expected "}" after the expression in this string', after);
    return { expr: r.expr, end: after + 1 };
  }
  private template(pos: number, tok: (t: TokenType, e: number, v?: string, x?: Partial<Token>) => Token): Token {
    const s = this.src; let e = pos + 1; const parts: TemplatePart[] = []; let text = ''; let cooked = '';
    const flush = () => { if (text || parts.length === 0) parts.push({ kind: 'text', value: text, cooked }); text = ''; cooked = ''; };
    while (e < s.length && s[e] !== '`') {
      if (s[e] === '\\') { const [ch, ne] = this.readEscape(e); text += s.slice(e, ne); cooked += ch; e = ne; }
      else if (s[e] === '$' && s[e + 1] === '{') { flush(); const r = this.embedded(e + 2); parts.push({ kind: 'expr', expr: r.expr, start: e + 2 }); e = r.end; }
      else { text += s[e]; cooked += s[e]; e++; }
    }
    if (e >= s.length) this.error('Unterminated template string', pos);
    if (text || parts.length === 0 || parts[parts.length - 1].kind === 'expr') parts.push({ kind: 'text', value: text, cooked });
    return tok('template', e + 1, '', { parts });
  }
  private fstring(pos: number, tok: (t: TokenType, e: number, v?: string, x?: Partial<Token>) => Token): Token {
    const s = this.src; const q = s[pos + 1]; let e = pos + 2; const parts: TemplatePart[] = []; let text = '';
    const flush = () => { if (text || parts.length === 0) parts.push({ kind: 'text', value: text, cooked: text }); text = ''; };
    while (e < s.length && s[e] !== q) {
      if (s[e] === '\n') this.error('Unterminated f-string', pos);
      if (s[e] === '\\') { const [ch, ne] = this.readEscape(e); text += ch; e = ne; }
      else if (s[e] === '{' && s[e + 1] === '{') { text += '{'; e += 2; }
      else if (s[e] === '}' && s[e + 1] === '}') { text += '}'; e += 2; }
      else if (s[e] === '{') { flush(); const r = this.embedded(e + 1); parts.push({ kind: 'expr', expr: r.expr, start: e + 1 }); e = r.end; }
      else text += s[e++];
    }
    if (e >= s.length) this.error('Unterminated f-string', pos);
    if (text || parts.length === 0 || parts[parts.length - 1].kind === 'expr') parts.push({ kind: 'text', value: text, cooked: text });
    return tok('fstring', e + 1, '', { parts });
  }
  private regex(pos: number, tok: (t: TokenType, e: number, v?: string) => Token): Token {
    const s = this.src; let e = pos + 1; let inClass = false;
    while (e < s.length) {
      const c = s[e];
      if (c === '\\') { e += 2; continue; }
      if (c === '\n') this.error('Unterminated regular expression', pos);
      if (inClass) { if (c === ']') inClass = false; }
      else if (c === '[') inClass = true;
      else if (c === '/') break;
      e++;
    }
    if (e >= s.length) this.error('Unterminated regular expression', pos);
    e++;
    while (e < s.length && /[a-z]/.test(s[e])) e++;
    return tok('regex', e);
  }
  private jsxText(pos: number): Token {
    const s = this.src; let e = pos;
    while (e < s.length && s[e] !== '<' && s[e] !== '{') e++;
    const [line, col] = this.lineAt(pos);
    return { type: 'jsxtext', value: s.slice(pos, e), raw: s.slice(pos, e), start: pos, end: e, line, col, nlBefore: false };
  }
  /** Raw block capture for `style { … }`: returns the text between the braces and the position after the closing brace. */
  rawBlock(openBrace: number): [string, number] {
    const s = this.src; let depth = 0; let e = openBrace;
    while (e < s.length) {
      const c = s[e];
      if (c === '"' || c === "'") { const q = c; e++; while (e < s.length && s[e] !== q) { if (s[e] === '\\') e++; e++; } }
      else if (c === '/' && s[e + 1] === '*') { e = s.indexOf('*/', e + 2); if (e < 0) this.error('Unterminated comment in style block', openBrace); e++; }
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return [s.slice(openBrace + 1, e), e + 1]; }
      e++;
    }
    this.error('Unterminated style block', openBrace);
  }
}
