import { Lexer, SOFT, VeyError, type Token } from './lexer.ts';
import type { ClassMember, Expr, JsxAttr, JsxChild, ObjProp, Param, Pattern, Pos, Program, Stmt, Type, TypeParams } from './ast.ts';

// Recursive-descent / Pratt parser for Vey. Types are parsed just far enough
// to find where they end and are kept as text.
type Mode = 'code' | 'jsxtag' | 'jsxtext';
const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '|=', '^=', '??=', '||=', '&&=']);
const BIN_PREC: Record<string, number> = {
  '??': 1, '||': 2, 'or': 2, '&&': 3, 'and': 3, '|': 4, '^': 5, '&': 6,
  '==': 7, '!=': 7, '===': 7, '!==': 7, '<': 8, '>': 8, '<=': 8, '>=': 8, 'instanceof': 8, 'in': 8, 'is': 8, 'as': 8, 'satisfies': 8, 'not': 8,
  '<<': 9, '>>': 9, '>>>': 9, '+': 10, '-': 10, '*': 11, '/': 11, '%': 11, '**': 12, '..': 0.5, '..=': 0.5, '|>': 0.4,
};

export class Parser {
  private lx: Lexer;
  private pos = 0;
  private tok!: Token;
  private prevEnd = 0;
  private prevValueLike = false;
  private depth = 0; // > 0 inside (), [], {} of expressions: newlines never end statements there
  private inClassBody = false;
  usesJsx = false;
  helpers = new Set<string>();
  private src: string; private file: string;
  constructor(src: string, file = '', startPos = 0, lexer?: Lexer) {
    this.src = src; this.file = file;
    this.lx = lexer ?? new Lexer(src, file);
    if (!lexer) this.lx.exprParser = pos => {
      // Expressions inside template strings and f-strings are parsed by a sub-parser sharing this lexer.
      const sub = new Parser(src, file, pos, this.lx);
      sub.depth = 1;
      const expr = sub.parseExpression();
      if (sub.usesJsx) this.usesJsx = true;
      sub.helpers.forEach(h => this.helpers.add(h));
      return { expr, end: sub.tok.start };
    };
    this.pos = startPos;
    this.advance();
  }

  // ── token plumbing ──────────────────────────────────────────────────────
  private scan(mode: Mode = 'code') { return this.lx.next(this.pos, mode, !this.prevValueLike); }
  private advance(mode: Mode = 'code') {
    this.prevEnd = this.tok ? this.tok.end : 0;
    if (this.tok) {
      const t = this.tok;
      this.prevValueLike = t.type === 'num' || t.type === 'str' || t.type === 'template' || t.type === 'fstring' || t.type === 'regex'
        || t.type === 'name' || (t.type === 'kw' && ['this', 'super', 'null', 'undefined', 'true', 'false'].includes(t.value))
        || (t.type === 'op' && [')', ']', '}'].includes(t.value));
    }
    this.tok = this.scan(mode);
    this.pos = this.tok.end;
  }
  private save() { return { pos: this.pos, tok: this.tok, prevEnd: this.prevEnd, prevValueLike: this.prevValueLike }; }
  private restore(s: ReturnType<Parser['save']>) { this.pos = s.pos; this.tok = s.tok; this.prevEnd = s.prevEnd; this.prevValueLike = s.prevValueLike; }
  private get p(): Pos { return { line: this.tok.line, col: this.tok.col }; }
  /** The current token, read through a call so TypeScript's narrowing does not carry across advance(). */
  private cur(): Token { return this.tok; }
  private fail(message: string, tok = this.tok): never { throw new VeyError(message, tok.line, tok.col, this.file); }
  private is(value: string, type?: Token['type']) { return this.tok.value === value && (type ? this.tok.type === type : this.tok.type === 'op' || this.tok.type === 'kw'); }
  private isOp(value: string) { return this.tok.type === 'op' && this.tok.value === value; }
  private isKw(value: string) { return this.tok.type === 'kw' && this.tok.value === value; }
  private eat(value: string): boolean { if (this.is(value)) { this.advance(); return true; } return false; }
  private expect(value: string): Token { if (!this.is(value)) this.fail(`Expected "${value}" but found ${this.describe()}`); const t = this.tok; this.advance(); return t; }
  private describe() { return this.tok.type === 'eof' ? 'end of file' : `"${this.tok.raw}"`; }
  /** Identifier, allowing soft keywords. */
  private ident(allowAnyKeyword = false): string {
    if (this.tok.type === 'name' || (this.tok.type === 'kw' && (allowAnyKeyword || SOFT.has(this.tok.value)))) { const v = this.tok.value; this.advance(); return v; }
    this.fail(`Expected a name but found ${this.describe()}`);
  }
  private isIdent() { return this.tok.type === 'name' || (this.tok.type === 'kw' && (SOFT.has(this.tok.value) || (this.tok.value === 'fn' && !this.fnExprAhead()))); }
  private peekAfter(n = 1): Token { const s = this.save(); for (let i = 0; i < n; i++) this.advance(); const t = this.tok; this.restore(s); return t; }
  private endStatement() {
    if (this.eat(';')) return;
    if (this.tok.type === 'eof' || this.isOp('}') || this.tok.nlBefore) return;
    this.fail(`Unexpected ${this.describe()} after statement`);
  }

  // ── program ─────────────────────────────────────────────────────────────
  parseProgram(): Program {
    const body: Stmt[] = [];
    while (this.tok.type !== 'eof') body.push(this.parseStatement());
    return { body, usesJsx: this.usesJsx, helpers: this.helpers };
  }

  private parseBlock(): Stmt[] {
    this.expect('{');
    const saved = this.depth; this.depth = 0;
    const body: Stmt[] = [];
    while (!this.isOp('}')) { if (this.tok.type === 'eof') this.fail('Unexpected end of file inside block'); body.push(this.parseStatement()); }
    this.expect('}');
    this.depth = saved;
    return body;
  }
  private parseBody(): Stmt[] { return this.isOp('{') ? this.parseBlock() : [this.parseStatement()]; }

  parseStatement(): Stmt {
    const pos = this.p;
    const t = this.tok;
    if (t.type === 'op') {
      if (t.value === ';') { this.advance(); return { kind: 'Empty', pos }; }
      if (t.value === '{') return { kind: 'Block', body: this.parseBlock(), pos };
      if (t.value === '@') this.fail('Decorators are not part of Vey');
    }
    if (t.type === 'name' && this.peekAfter().type === 'op' && this.peekAfter().value === ':' && !this.peekAfter().nlBefore) {
      // labeled statement
      const label = this.ident(); this.expect(':');
      return { kind: 'Labeled', label, body: this.parseStatement(), pos };
    }
    if (t.type === 'kw') {
      switch (t.value) {
        case 'import': if (this.peekAfter().type === 'op' && ['(', '.'].includes(this.peekAfter().value)) break; return this.parseImport();
        case 'export': return this.parseExport();
        case 'let': case 'const': case 'var': return this.parseVar(false);
        case 'fn': if (this.fnDeclAhead()) return this.parseFnDecl(false, false, false); break;
        case 'async': if (this.peekAfter().value === 'fn') { this.advance(); return this.parseFnDecl(false, false, true); } break;
        case 'class': return this.parseClass(false, false);
        case 'abstract': if (this.peekAfter().value === 'class') { this.advance(); return { ...this.parseClass(false, false), abstract: true }; } break;
        case 'struct': if (this.peekAfter().type === 'name') return this.parseStruct(false); break;
        case 'enum': if (this.peekAfter().type === 'name') return this.parseEnum(false); break;
        case 'type': if (this.peekAfter().type === 'name' && !this.peekAfter().nlBefore) return this.parseTypeAlias(false); break;
        case 'interface': if (this.peekAfter().type === 'name') return this.parseInterface(false); break;
        case 'declare': if (['global', 'module', 'const', 'let', 'var', 'fn', 'class'].includes(this.peekAfter().value)) return this.parseDeclare(false); break;
        case 'style': if (this.peekAfter().type === 'op' && this.peekAfter().value === '{' || this.peekAfter().type === 'str') return this.parseStyle(false); break;
        case 'if': return this.parseIf();
        case 'for': return this.parseFor();
        case 'while': { this.advance(); const test = this.parseCondition(); return { kind: 'While', test, body: this.parseBody(), pos }; }
        case 'do': { this.advance(); const body = this.parseBody(); if (!this.eat('while')) this.fail('Expected "while" after do block'); const test = this.parseCondition(); this.endStatement(); return { kind: 'DoWhile', test, body, pos }; }
        case 'match': { const s = this.save(); this.advance(); try { const subject = this.parseCondition(); if (this.matchArmsAhead()) return this.parseMatch(subject, pos); } catch (err) { if (!(err instanceof VeyError)) throw err; } this.restore(s); break; }
        case 'switch': return this.parseSwitch();
        case 'try': return this.parseTry();
        case 'return': { this.advance(); let value: Expr | undefined; if (!this.isOp(';') && !this.isOp('}') && this.tok.type !== 'eof' && !this.tok.nlBefore) value = this.parseExpression(); this.endStatement(); return { kind: 'Return', value, pos }; }
        case 'throw': { this.advance(); const value = this.parseExpression(); this.endStatement(); return { kind: 'Throw', value, pos }; }
        case 'break': case 'continue': { this.advance(); let label: string | undefined; if (this.tok.type === 'name' && !this.tok.nlBefore) label = this.ident(); this.endStatement(); return { kind: t.value === 'break' ? 'Break' : 'Continue', label, pos }; }
        case 'pass': if (this.peekAfter().nlBefore || this.peekAfter().value === '}' || this.peekAfter().type === 'eof') { this.advance(); this.endStatement(); return { kind: 'Pass', pos }; } break;
      }
    }
    const expr = this.parseExpression();
    this.endStatement();
    return { kind: 'ExprStmt', expr, pos };
  }

  /** `fn name`, `fn *name`, `fn<T>` start a function statement; `fn(` is a call to something named fn. */
  private fnDeclAhead(): boolean {
    const next = this.peekAfter();
    return next.type === 'name' || (next.type === 'kw' && SOFT.has(next.value)) || (next.type === 'op' && (next.value === '*' || next.value === '<'));
  }
  /** In expression position: `fn(...)` followed by `{`, `=>` or a return type is a function expression; otherwise a call. */
  private fnExprAhead(): boolean {
    const next = this.peekAfter();
    if (next.type === 'name' || next.type === 'kw' || (next.type === 'op' && (next.value === '*' || next.value === '<'))) return true;
    if (!(next.type === 'op' && next.value === '(')) return false;
    const s = this.save();
    try {
      this.advance(); // fn
      let depth = 0;
      do { if (this.isOp('(')) depth++; else if (this.isOp(')')) depth--; if (this.tok.type === 'eof') return false; this.advance(); } while (depth > 0);
      return this.isOp('{') || this.isOp('=>') || this.isOp(':');
    } finally { this.restore(s); }
  }
  private parseCondition(): Expr {
    // `if x {` : a brace after the expression begins the block, never an object literal.
    const saved = this.depth; this.depth = 0;
    const paren = this.isOp('(');
    const e = this.parseExpression();
    this.depth = saved;
    return paren && e.kind === 'Paren' ? e.expr : e;
  }

  private parseIf(): Stmt {
    const pos = this.p; this.expect('if');
    const test = this.parseCondition();
    const then = this.parseBody();
    let els: Stmt[] | Stmt | undefined;
    if (this.isKw('elif')) { this.tok = { ...this.tok, value: 'if', raw: 'if' }; els = this.parseIf(); }
    else if (this.eat('else')) els = this.isKw('if') ? this.parseIf() : this.parseBody();
    return { kind: 'If', test, then, else: els, pos };
  }

  private parseFor(): Stmt {
    const pos = this.p; this.expect('for');
    const isAwait = this.eat('await');
    if (this.isOp('(')) {
      // JS-style loops: for (init; test; update) / for (const x of it) / for (const k in obj)
      const s = this.save(); this.advance();
      const savedDepth = this.depth; this.depth = 0;
      let init: Stmt | undefined;
      if (!this.isOp(';')) {
        if (['let', 'const', 'var'].includes(this.tok.value) && this.tok.type === 'kw') {
          const decl = this.tok.value as 'let' | 'const' | 'var'; this.advance();
          const pattern = this.parsePattern();
          if (this.isKw('of') || this.isKw('in')) {
            const isKeys = this.isKw('in'); this.advance();
            const iterable = this.parseExpression();
            this.expect(')'); this.depth = savedDepth;
            return { kind: 'ForIn', decl, pattern, iterable, body: this.parseBody(), isKeys, await: isAwait, pos };
          }
          const items = [{ pattern, type: this.eat(':') ? this.parseType() : undefined, init: this.eat('=') ? this.parseAssignment() : undefined }];
          while (this.eat(',')) { const pat = this.parsePattern(); items.push({ pattern: pat, type: this.eat(':') ? this.parseType() : undefined, init: this.eat('=') ? this.parseAssignment() : undefined }); }
          init = { kind: 'Var', decl, items, exported: false, pos };
        } else {
          const e = this.parseExpression();
          if (this.isKw('of') || this.isKw('in')) {
            const isKeys = this.isKw('in'); this.advance();
            const iterable = this.parseExpression();
            this.expect(')'); this.depth = savedDepth;
            return { kind: 'ForIn', decl: 'let', pattern: this.toPattern(e), iterable, body: this.parseBody(), isKeys, await: isAwait, pos };
          }
          init = { kind: 'ExprStmt', expr: e, pos };
        }
      }
      this.expect(';');
      const test = this.isOp(';') ? undefined : this.parseExpression();
      this.expect(';');
      const update = this.isOp(')') ? undefined : this.parseExpression();
      this.expect(')');
      this.depth = savedDepth;
      void s;
      return { kind: 'ForC', init, test, update, body: this.parseBody(), pos };
    }
    // Vey loops: for x in it { } / for i in a..b { } / for i, x in list { } / for k, v in obj { }
    const decl: 'let' | 'const' = this.eat('let') ? 'let' : (this.eat('const'), 'const');
    const first = this.parsePattern();
    let pattern: Pattern = first;
    if (this.eat(',')) {
      const second = this.parsePattern();
      pattern = { kind: 'ArrayPattern', items: [{ value: first }, { value: second }], pos };
      this.expect('in');
      const iterable = this.parseCondition();
      this.helpers.add('__pairs');
      return { kind: 'ForIn', decl, pattern, iterable: { kind: 'Call', callee: { kind: 'Ident', name: '__pairs', pos }, args: [iterable], optional: false, pos }, body: this.parseBody(), isKeys: false, await: isAwait, pos };
    }
    this.expect('in');
    const iterable = this.parseCondition();
    if (iterable.kind === 'Range' && first.kind === 'Ident') return { kind: 'ForRange', decl, name: first.name, from: iterable.from, to: iterable.to, inclusive: iterable.inclusive, step: iterable.step, body: this.parseBody(), pos };
    return { kind: 'ForIn', decl, pattern, iterable, body: this.parseBody(), isKeys: false, await: isAwait, pos };
  }

  /** `match x {` is only a match when the block holds arms (`case …`, `else`, `_`); otherwise `match` is an ordinary name. */
  private matchArmsAhead(): boolean {
    if (!this.isOp('{')) return false;
    const next = this.peekAfter();
    return (next.type === 'kw' && (next.value === 'case' || next.value === 'else')) || (next.type === 'name' && next.value === '_' && ['=>', ':'].includes(this.peekAfter(2).value));
  }
  private parseMatch(subject: Expr, pos: Pos): Stmt {
    this.expect('{');
    const arms: Extract<Stmt, { kind: 'Match' }>['arms'] = [];
    while (!this.isOp('}')) {
      if (this.eat('else') || (this.tok.type === 'name' && this.tok.value === '_' && this.peekAfter().value === ':' && (this.advance(), true))) {
        this.expect(':'); arms.push({ patterns: [], body: this.parseArmBody(), isElse: true }); continue;
      }
      this.expect('case');
      const patterns: Expr[] = [this.parseMatchPattern()];
      while (this.eat('|')) patterns.push(this.parseMatchPattern());
      const guard = this.eat('if') ? this.parseExpression() : undefined;
      this.expect(':');
      arms.push({ patterns, guard, body: this.parseArmBody(), isElse: false });
    }
    this.expect('}');
    return { kind: 'Match', subject, arms, pos };
  }
  /** A match pattern: a value, a type name, `typeof "x"`, or a range; `|` joins alternatives. */
  private parseMatchPattern(): Expr {
    const left = this.parseBinary(5);
    if (this.isOp('..') || this.isOp('..=')) { const inclusive = this.tok.value === '..='; this.advance(); const to = this.parseBinary(5); return { kind: 'Range', from: left, to, inclusive, pos: left.pos }; }
    return left;
  }
  private parseArmBody(): Stmt[] {
    if (this.isOp('{')) return this.parseBlock();
    const body: Stmt[] = [];
    while (!this.isOp('}') && !this.isKw('case') && !this.isKw('else') && !(this.tok.value === '_' && this.peekAfter().value === ':')) body.push(this.parseStatement());
    return body;
  }
  private parseSwitch(): Stmt {
    const pos = this.p; this.expect('switch');
    const subject = this.parseCondition();
    this.expect('{');
    const cases: { test?: Expr; body: Stmt[] }[] = [];
    while (!this.isOp('}')) {
      let test: Expr | undefined;
      if (this.eat('default')) { /* default */ } else { this.expect('case'); test = this.parseExpression(); }
      this.expect(':');
      const body: Stmt[] = [];
      while (!this.isOp('}') && !this.isKw('case') && !this.isKw('default')) body.push(this.parseStatement());
      cases.push({ test, body });
    }
    this.expect('}');
    return { kind: 'Switch', subject, cases, pos };
  }
  private parseTry(): Stmt {
    const pos = this.p; this.expect('try');
    const body = this.parseBlock();
    let param: Pattern | undefined, handler: Stmt[] | undefined, finalizer: Stmt[] | undefined;
    if (this.eat('catch')) {
      if (this.eat('(')) { param = this.parsePattern(); if (this.eat(':')) this.parseType(); this.expect(')'); }
      else if (!this.isOp('{')) { param = this.parsePattern(); }
      handler = this.parseBlock();
    }
    if (this.eat('finally')) finalizer = this.parseBlock();
    if (!handler && !finalizer) this.fail('try needs catch or finally');
    return { kind: 'Try', body, param, handler, finalizer, pos };
  }

  // ── declarations ────────────────────────────────────────────────────────
  private parseVar(exported: boolean, declare = false): Stmt {
    const pos = this.p;
    const decl = this.tok.value as 'let' | 'const' | 'var'; this.advance();
    const items: Extract<Stmt, { kind: 'Var' }>['items'] = [];
    do {
      const pattern = this.parsePattern();
      const definite = this.eat('!');
      const type = this.eat(':') ? this.parseType() : undefined;
      const init = this.eat('=') ? this.parseAssignment() : undefined;
      items.push({ pattern, type, init, definite });
    } while (this.eat(','));
    this.endStatement();
    return { kind: 'Var', decl, items, exported, declare, pos };
  }
  private parseFnDecl(exported: boolean, isDefault: boolean, isAsync: boolean): Stmt {
    const pos = this.p; this.expect('fn');
    const generator = this.eat('*');
    const name = this.isOp('(') || this.isOp('<') ? '' : this.ident();
    if (!name && !isDefault) this.fail('A function statement needs a name');
    const typeParams = this.isOp('<') ? this.parseTypeParams() : undefined;
    const params = this.parseParams();
    const returns = this.eat(':') ? this.parseType() : undefined;
    const body = this.parseBlock();
    return { kind: 'Fn', name, params, typeParams, returns, body, async: isAsync, generator, exported, isDefault, pos };
  }
  private parseParams(): Param[] {
    this.expect('(');
    const saved = this.depth; this.depth++;
    const params: Param[] = [];
    while (!this.isOp(')')) {
      const modifier = ['private', 'public', 'protected', 'readonly'].includes(this.tok.value) && this.tok.type === 'kw' && this.peekAfter().type === 'name' ? this.ident(true) : undefined;
      const rest = this.eat('...');
      const pattern = this.parsePattern();
      const optional = this.eat('?');
      const type = this.eat(':') ? this.parseType() : undefined;
      const def = this.eat('=') ? this.parseAssignment() : undefined;
      params.push({ pattern, type, default: def, rest, optional, modifier });
      if (!this.eat(',')) break;
    }
    this.expect(')');
    this.depth = saved;
    return params;
  }
  private parseClass(exported: boolean, isDefault: boolean): Extract<Stmt, { kind: 'Class' }> {
    const pos = this.p; this.expect('class');
    const name = this.isIdent() ? this.ident() : '';
    const typeParams = this.isOp('<') ? this.parseTypeParams() : undefined;
    let superClass: Expr | undefined, superTypeArgs: string | undefined, impl: string | undefined;
    if (this.eat('extends')) { superClass = this.parseUnaryNoCallOnNewline(); if (this.isOp('<')) superTypeArgs = this.parseTypeArgsText(); }
    if (this.eat('implements')) { const start = this.tok.start; this.parseType(); while (this.eat(',')) this.parseType(); impl = this.src.slice(start, this.prevEnd); }
    const members = this.parseClassBody();
    return { kind: 'Class', name, typeParams, superClass, superTypeArgs, implements: impl, members, exported, isDefault, pos };
  }
  private parseClassBody(): ClassMember[] {
    this.expect('{');
    const saved = this.depth; this.depth = 0;
    const wasClass = this.inClassBody; this.inClassBody = true;
    const members: ClassMember[] = [];
    while (!this.isOp('}')) {
      if (this.eat(';')) continue;
      members.push(this.parseClassMember());
    }
    this.expect('}');
    this.inClassBody = wasClass; this.depth = saved;
    return members;
  }
  private parseClassMember(): ClassMember {
    const pos = this.p;
    const modifiers: string[] = [];
    let isStatic = false, isAsync = false, accessor: 'get' | 'set' | undefined;
    for (;;) {
      const next = this.peekAfter();
      const nextIsNamePos = next.type === 'name' || next.type === 'kw' || (next.type === 'op' && ['[', '*', '{'].includes(next.value)) || next.type === 'str' || next.type === 'num';
      if (this.tok.type === 'kw' && ['private', 'public', 'protected', 'readonly', 'abstract', 'override', 'declare'].includes(this.tok.value) && nextIsNamePos) { modifiers.push(this.tok.value); this.advance(); continue; }
      if (this.isKw('static') && nextIsNamePos) { if (next.type === 'op' && next.value === '{') { this.advance(); return { kind: 'StaticBlock', body: this.parseBlock(), pos }; } isStatic = true; this.advance(); continue; }
      if (this.isKw('async') && nextIsNamePos && !next.nlBefore) { isAsync = true; this.advance(); continue; }
      if ((this.isKw('get') || this.isKw('set')) && nextIsNamePos && !(next.type === 'op' && next.value !== '[')) { accessor = this.tok.value as 'get' | 'set'; this.advance(); continue; }
      break;
    }
    if (this.isOp('[') && this.peekAfter().type === 'name' && this.peekAfter(2).value === ':') {
      const start = this.tok.start; this.expect('['); this.ident(); this.expect(':'); this.parseType(); this.expect(']'); this.expect(':'); this.parseType();
      this.eat(';');
      return { kind: 'IndexSignature', text: this.src.slice(start, this.prevEnd), pos };
    }
    const generator = this.eat('*');
    let name: string, computed: Expr | undefined;
    if (this.eat('[')) { computed = this.parseAssignment(); this.expect(']'); name = ''; }
    else if (this.tok.type === 'str') { name = JSON.stringify(this.tok.value); this.advance(); }
    else if (this.tok.type === 'num') { name = this.tok.raw; this.advance(); }
    else name = this.ident(true);
    const isConstructor = !isStatic && (name === 'init' || name === 'constructor') && this.isOp('(');
    if (this.isOp('(') || this.isOp('<')) {
      const typeParams = this.isOp('<') ? this.parseTypeParams() : undefined;
      const params = this.parseParams();
      const returns = this.eat(':') ? this.parseType() : undefined;
      const body = this.isOp('{') ? this.parseBlock() : (this.endStatement(), undefined);
      return { kind: 'Method', name: isConstructor ? 'constructor' : name, computed, params, typeParams, returns, body, static: isStatic, async: isAsync, generator, accessor, isConstructor, modifiers, pos };
    }
    const optional = this.eat('?');
    const definite = this.eat('!');
    const type = this.eat(':') ? this.parseType() : undefined;
    const value = this.eat('=') ? this.parseAssignment() : undefined;
    this.endStatement();
    return { kind: 'Field', name, computed, type, value, static: isStatic, modifiers, optional, definite, pos };
  }
  private parseStruct(exported: boolean): Stmt {
    const pos = this.p; this.expect('struct');
    const name = this.ident();
    const typeParams = this.isOp('<') ? this.parseTypeParams() : undefined;
    this.expect('{');
    const fields: Extract<Stmt, { kind: 'Struct' }>['fields'] = [];
    const members: ClassMember[] = [];
    while (!this.isOp('}')) {
      if (this.eat(',') || this.eat(';')) continue;
      if (this.isKw('fn') || this.isKw('static') || this.isKw('get') || this.isKw('set') || this.isKw('async')) {
        this.eat('fn');
        members.push(this.parseClassMember());
        continue;
      }
      const fname = this.ident(true);
      const type = this.eat(':') ? this.parseType() : undefined;
      const def = this.eat('=') ? this.parseAssignment() : undefined;
      fields.push({ name: fname, type, default: def });
    }
    this.expect('}');
    return { kind: 'Struct', name, typeParams, fields, members, exported, pos };
  }
  private parseEnum(exported: boolean): Stmt {
    const pos = this.p; this.expect('enum');
    const name = this.ident();
    this.expect('{');
    const members: { name: string; value?: Expr }[] = [];
    while (!this.isOp('}')) {
      const isStr = this.tok.type === 'str';
      const mname = isStr ? this.tok.value : this.ident(true);
      if (isStr) this.advance();
      const value = this.eat('=') ? this.parseAssignment() : undefined;
      members.push({ name: mname, value });
      if (!this.eat(',')) break;
    }
    this.expect('}');
    return { kind: 'Enum', name, members, exported, pos };
  }
  private parseTypeAlias(exported: boolean): Stmt {
    const pos = this.p; this.expect('type');
    const name = this.ident();
    const typeParams = this.isOp('<') ? this.parseTypeParams() : undefined;
    this.expect('=');
    const type = this.parseType();
    this.endStatement();
    return { kind: 'TypeAlias', name, typeParams, type, exported, pos };
  }
  private parseInterface(exported: boolean): Stmt {
    const pos = this.p; const start = this.tok.start; this.expect('interface');
    const name = this.ident();
    if (this.isOp('<')) this.parseTypeParams();
    if (this.eat('extends')) { this.parseType(); while (this.eat(',')) this.parseType(); }
    const [, end] = this.lx.rawBlock(this.tok.start);
    const text = this.src.slice(start, end);
    this.pos = end; this.tok = { ...this.tok, end }; this.advance();
    return { kind: 'Interface', name, text, exported, pos };
  }
  private parseDeclare(exported: boolean): Stmt {
    const pos = this.p; const start = this.tok.start; this.expect('declare');
    if (this.isKw('global') || this.tok.value === 'module') {
      this.advance();
      if (this.tok.type === 'str') this.advance();
      const [, end] = this.lx.rawBlock(this.tok.start);
      this.pos = end; this.tok = { ...this.tok, end }; this.advance();
      return { kind: 'Declare', text: this.src.slice(start, end), exported, pos };
    }
    // declare const/let/var/fn/class: parse normally, mark declare (emitted only for TypeScript output)
    if (['const', 'let', 'var'].includes(this.tok.value)) { const v = this.parseVar(exported, true); return { kind: 'Declare', text: this.src.slice(start, this.prevEnd), exported, pos: v.pos }; }
    this.fail('Unsupported declare form');
  }
  private parseStyle(exported: boolean): Stmt {
    const pos = this.p; this.expect('style');
    const name = this.tok.type === 'str' ? (this.tok.value as string) : undefined;
    if (name !== undefined) this.advance();
    if (!this.isOp('{')) this.fail('style needs a { … } block of CSS');
    const [css, end] = this.lx.rawBlock(this.tok.start);
    this.pos = end; this.tok = { ...this.tok, end }; this.advance();
    this.helpers.add('__css');
    return { kind: 'Style', name, css, exported, pos };
  }

  private parseImport(): Stmt {
    const pos = this.p; this.expect('import');
    const typeOnly = this.isKw('type') && (this.peekAfter().value === '{' || this.peekAfter().value === '*' || this.peekAfter().type === 'name') && (this.advance(), true);
    if (this.tok.type === 'str') { const source = this.tok.value; this.advance(); this.endStatement(); return { kind: 'Import', source, named: [], typeOnly: false, sideEffect: true, pos }; }
    let def: string | undefined, namespace: string | undefined;
    const named: { name: string; alias?: string; isType: boolean }[] = [];
    if (this.isIdent()) { def = this.ident(); this.eat(','); }
    if (this.eat('*')) { this.expect('as'); namespace = this.ident(); }
    else if (this.eat('{')) {
      while (!this.isOp('}')) {
        const isType = this.isKw('type') && this.peekAfter().type !== 'op' && !['as', ','].includes(this.peekAfter().value) && (this.advance(), true);
        const isStr = this.cur().type === 'str';
        const name = isStr ? this.cur().value : this.ident(true);
        if (isStr) this.advance();
        const alias = this.eat('as') ? this.ident(true) : undefined;
        named.push({ name, alias, isType: !!isType });
        if (!this.eat(',')) break;
      }
      this.expect('}');
    }
    this.expect('from');
    if (this.cur().type !== 'str') this.fail('Expected a module path');
    const source = this.cur().value; this.advance();
    this.endStatement();
    return { kind: 'Import', source, default: def, namespace, named, typeOnly: !!typeOnly, sideEffect: false, pos };
  }
  private parseExport(): Stmt {
    const pos = this.p; this.expect('export');
    if (this.eat('default')) {
      if (this.isKw('fn')) return this.parseFnDecl(true, true, false);
      if (this.isKw('async') && this.peekAfter().value === 'fn') { this.advance(); return this.parseFnDecl(true, true, true); }
      if (this.isKw('class')) return this.parseClass(true, true);
      const expr = this.parseAssignment(); this.endStatement();
      return { kind: 'ExportDefault', expr, pos };
    }
    if (this.eat('*')) { const alias = this.eat('as') ? this.ident(true) : undefined; this.expect('from'); const source = this.tok.value; this.advance(); this.endStatement(); return { kind: 'ExportAll', source, alias, pos }; }
    const typeOnly = this.isKw('type') && this.peekAfter().value === '{' && (this.advance(), true);
    if (this.eat('{')) {
      const items: { name: string; alias?: string; isType: boolean }[] = [];
      while (!this.isOp('}')) {
        const isType = this.isKw('type') && this.peekAfter().type !== 'op' && (this.advance(), true);
        const name = this.ident(true); const alias = this.eat('as') ? this.ident(true) : undefined;
        items.push({ name, alias, isType: !!isType });
        if (!this.eat(',')) break;
      }
      this.expect('}');
      let source: string | undefined;
      if (this.eat('from')) { source = this.tok.value; this.advance(); }
      this.endStatement();
      return { kind: 'ExportNamed', items, source, typeOnly: !!typeOnly, pos };
    }
    const t = this.tok;
    if (t.type === 'kw') {
      switch (t.value) {
        case 'let': case 'const': case 'var': return this.parseVar(true);
        case 'fn': return this.parseFnDecl(true, false, false);
        case 'async': this.advance(); return this.parseFnDecl(true, false, true);
        case 'class': return this.parseClass(true, false);
        case 'abstract': this.advance(); return { ...this.parseClass(true, false), abstract: true };
        case 'struct': return this.parseStruct(true);
        case 'enum': return this.parseEnum(true);
        case 'type': return this.parseTypeAlias(true);
        case 'interface': return this.parseInterface(true);
        case 'declare': return this.parseDeclare(true);
        case 'style': return this.parseStyle(true);
      }
    }
    this.fail(`Cannot export ${this.describe()}`);
  }

  // ── patterns ────────────────────────────────────────────────────────────
  private parsePattern(): Pattern {
    const pos = this.p;
    if (this.eat('{')) {
      const props: Extract<Pattern, { kind: 'ObjectPattern' }>['props'] = [];
      while (!this.isOp('}')) {
        if (this.eat('...')) { props.push({ key: '', value: this.parsePattern(), rest: true }); if (!this.eat(',')) break; continue; }
        let key: string, computed: Expr | undefined;
        if (this.eat('[')) { computed = this.parseAssignment(); this.expect(']'); key = ''; }
        else if (this.tok.type === 'str') { key = JSON.stringify(this.tok.value); this.advance(); }
        else if (this.tok.type === 'num') { key = this.tok.raw; this.advance(); }
        else key = this.ident(true);
        let value: Pattern = { kind: 'Ident', name: key, pos };
        if (this.eat(':')) value = this.parsePattern();
        const def = this.eat('=') ? this.parseAssignment() : undefined;
        props.push({ key, computed, value, default: def });
        if (!this.eat(',')) break;
      }
      this.expect('}');
      return { kind: 'ObjectPattern', props, pos };
    }
    if (this.eat('[')) {
      const items: Extract<Pattern, { kind: 'ArrayPattern' }>['items'] = [];
      while (!this.isOp(']')) {
        if (this.isOp(',')) { this.advance(); items.push(null); continue; }
        const rest = this.eat('...');
        const value = this.parsePattern();
        const def = this.eat('=') ? this.parseAssignment() : undefined;
        items.push({ value, default: def, rest });
        if (!this.eat(',')) break;
      }
      this.expect(']');
      return { kind: 'ArrayPattern', items, pos };
    }
    return { kind: 'Ident', name: this.ident(true), pos };
  }
  private toPattern(e: Expr): Pattern {
    switch (e.kind) {
      case 'Ident': return { kind: 'Ident', name: e.name, pos: e.pos };
      case 'Paren': return this.toPattern(e.expr);
      case 'Array': return { kind: 'ArrayPattern', pos: e.pos, items: e.items.map(item => !item ? null : item.kind === 'Spread' ? { value: this.toPattern(item.expr), rest: true } : item.kind === 'Assign' && item.op === '=' ? { value: item.target, default: item.value } : { value: this.toPattern(item) }) };
      case 'Object': return { kind: 'ObjectPattern', pos: e.pos, props: e.props.map(p => {
        if (p.kind === 'Spread') return { key: '', value: this.toPattern(p.expr), rest: true };
        if (p.kind === 'Method') this.fail('Invalid assignment target');
        if (p.value.kind === 'Assign' && p.value.op === '=') return { key: p.key, computed: p.computed, value: p.value.target, default: p.value.value };
        return { key: p.key, computed: p.computed, value: p.shorthand ? { kind: 'Ident', name: p.key, pos: e.pos } : this.toPattern(p.value) };
      }) };
      case 'Assign': if (e.op === '=') return e.target; break;
      case 'Member': case 'Index': case 'PrivateMember': case 'NonNull': case 'As': return { kind: 'ExprPattern', expr: e, pos: e.pos };
    }
    this.fail('Invalid assignment target');
  }

  // ── types (kept as text) ────────────────────────────────────────────────
  private parseTypeParams(): TypeParams {
    const start = this.tok.start; this.expect('<');
    const saved = this.depth; this.depth++;
    while (!this.isOp('>')) {
      this.eat('const'); this.ident(true);
      if (this.eat('extends')) this.parseType();
      if (this.eat('=')) this.parseType();
      if (!this.eat(',')) break;
    }
    this.expect('>'); this.depth = saved;
    return { text: this.src.slice(start, this.prevEnd) };
  }
  private parseTypeArgsText(): string {
    const start = this.tok.start; this.expect('<');
    const saved = this.depth; this.depth++;
    while (!this.isOp('>')) { this.parseType(); if (!this.eat(',')) break; }
    if (this.isOp('>>')) { this.tok = { ...this.tok, value: '>', raw: '>', end: this.tok.start + 1 }; this.pos = this.tok.end; }
    if (this.isOp('>>>')) { this.tok = { ...this.tok, value: '>', raw: '>', end: this.tok.start + 1 }; this.pos = this.tok.end; }
    this.expect('>'); this.depth = saved;
    return this.src.slice(start, this.prevEnd);
  }
  parseType(): Type {
    const start = this.tok.start;
    this.typeConditional();
    return { text: stripComments(this.src.slice(start, this.prevEnd)).replace(/\s+/g, ' ') };
  }
  private typeConditional() {
    this.typeUnion();
    if (this.isKw('extends') && !this.tok.nlBefore) { this.advance(); this.typeUnion(); this.expect('?'); this.typeConditional(); this.expect(':'); this.typeConditional(); }
  }
  private typeUnion() {
    this.eat('|'); this.typeIntersection();
    while (this.isOp('|')) { this.advance(); this.typeIntersection(); }
  }
  private typeIntersection() {
    this.eat('&'); this.typePostfix();
    while (this.isOp('&')) { this.advance(); this.typePostfix(); }
  }
  private typePostfix() {
    this.typePrimary();
    for (;;) {
      if (this.isOp('[') && !this.tok.nlBefore) { this.advance(); if (!this.isOp(']')) this.typeConditional(); this.expect(']'); continue; }
      if (this.isOp('.') && this.peekAfter().type !== 'op') { this.advance(); this.ident(true); if (this.isOp('<')) this.parseTypeArgsText(); continue; }
      break;
    }
  }
  private typePrimary() {
    const t = this.tok;
    if (t.type === 'op') {
      if (t.value === '(') {
        // function type or parenthesized type
        const s = this.save();
        if (this.tryFunctionType()) return;
        this.restore(s);
        this.advance(); this.typeConditional(); this.expect(')'); return;
      }
      if (t.value === '[') { this.advance(); while (!this.isOp(']')) { this.eat('...'); if (this.isIdent() && this.peekAfter().value === ':' || (this.isIdent() && this.peekAfter().value === '?' && this.peekAfter(2).value === ':')) { this.ident(true); this.eat('?'); this.expect(':'); } this.typeConditional(); this.eat('?'); if (!this.eat(',')) break; } this.expect(']'); return; }
      if (t.value === '{') { this.typeObject(); return; }
      if (t.value === '<') { this.parseTypeParams(); this.tryFunctionType(); return; }
      if (t.value === '-') { this.advance(); if (this.tok.type !== 'num') this.fail('Expected a number'); this.advance(); return; }
    }
    if (t.type === 'str' || t.type === 'num') { this.advance(); return; }
    if (t.type === 'template') { this.advance(); return; }
    if (t.type === 'kw') {
      if (['null', 'undefined', 'true', 'false', 'this', 'void'].includes(t.value)) { this.advance(); return; }
      if (t.value === 'typeof') { this.advance(); this.ident(true); while (this.isOp('.')) { this.advance(); this.ident(true); } if (this.isOp('<') && !this.tok.nlBefore) this.parseTypeArgsText(); return; }
      if (t.value === 'keyof' || t.value === 'readonly' || t.value === 'unique' || t.value === 'asserts') { this.advance(); this.typePostfix(); return; }
      if (t.value === 'new' || t.value === 'abstract') { this.advance(); this.eat('new'); this.tryFunctionType(); return; }
      if (t.value === 'import') { this.advance(); this.expect('('); this.advance(); this.expect(')'); while (this.eat('.')) this.ident(true); if (this.isOp('<')) this.parseTypeArgsText(); return; }
      if (t.value === 'infer') { this.advance(); this.ident(true); if (this.eat('extends')) this.typePostfix(); return; }
    }
    if (this.isIdent() || t.type === 'kw') {
      this.ident(true);
      if (this.isKw('is') && !this.tok.nlBefore) { this.advance(); this.typeConditional(); return; }
      if (this.isOp('<') && !this.tok.nlBefore) this.parseTypeArgsText();
      return;
    }
    this.fail(`Expected a type but found ${this.describe()}`);
  }
  private tryFunctionType(): boolean {
    // ( params ) => type
    if (!this.isOp('(')) return false;
    const s = this.save();
    try {
      this.advance();
      const saved = this.depth; this.depth++;
      while (!this.isOp(')')) {
        this.eat('...');
        if (this.isOp('{') || this.isOp('[')) this.parsePattern(); else this.ident(true);
        this.eat('?');
        if (this.eat(':')) this.typeConditional();
        if (!this.eat(',')) break;
      }
      this.expect(')'); this.depth = saved;
      if (!this.isOp('=>')) { this.restore(s); return false; }
      this.advance(); this.typeConditional();
      return true;
    } catch { this.restore(s); return false; }
  }
  private typeObject() {
    this.expect('{');
    const saved = this.depth; this.depth++;
    while (!this.isOp('}')) {
      if (this.eat(';') || this.eat(',')) continue;
      if (this.isOp('[')) {
        this.advance();
        if (this.isIdent() && this.peekAfter().value === ':') { this.ident(true); this.expect(':'); this.typeConditional(); this.expect(']'); }
        else if (this.isIdent() && this.peekAfter().value === 'in') { this.ident(true); this.expect('in'); this.typeConditional(); if (this.eat('as')) this.typeConditional(); this.expect(']'); this.eat('?'); this.eat('-'); this.eat('?'); }
        else { this.typeConditional(); this.expect(']'); }
      } else {
        this.eat('readonly'); if (this.isKw('get') || this.isKw('set')) { if (this.peekAfter().type !== 'op') this.advance(); }
        if (this.tok.type === 'str') this.advance(); else this.ident(true);
        this.eat('?');
      }
      if (this.isOp('<') || this.isOp('(')) { if (this.isOp('<')) this.parseTypeParams(); const inner = this.tryFunctionType(); if (!inner) { this.parseParams(); } }
      if (this.eat(':')) this.typeConditional();
    }
    this.expect('}'); this.depth = saved;
  }

  // ── expressions ─────────────────────────────────────────────────────────
  parseExpression(): Expr {
    const first = this.parseAssignment();
    if (!this.isOp(',') || this.depth === 0 && this.inStatementTop) return first;
    const exprs = [first];
    while (this.eat(',')) exprs.push(this.parseAssignment());
    return { kind: 'Seq', exprs, pos: first.pos };
  }
  private inStatementTop = false;
  parseAssignment(): Expr {
    const pos = this.p;
    if (this.isKw('async') && this.peekAfter().value === 'fn') { this.advance(); return this.parseFnExpr(true); }
    if (this.isKw('async') && !this.peekAfter().nlBefore && (this.peekAfter().value === '(' || this.peekAfter().type === 'name' || this.peekAfter().value === '<')) {
      const s = this.save(); this.advance();
      const arrow = this.tryArrow(true);
      if (arrow) return arrow;
      this.restore(s);
    }
    if (this.isOp('(') || this.isIdent() || this.isOp('<')) { const arrow = this.tryArrow(false); if (arrow) return arrow; }
    if (this.isKw('yield')) { this.advance(); const delegate = this.eat('*'); const arg = this.isOp(')') || this.isOp(']') || this.isOp('}') || this.isOp(',') || this.isOp(';') || this.tok.nlBefore ? undefined : this.parseAssignment(); return { kind: 'Yield', arg, delegate, pos }; }
    const left = this.parseConditional();
    if (this.tok.type === 'op' && ASSIGN_OPS.has(this.tok.value)) {
      const op = this.tok.value; this.advance();
      const value = this.parseAssignment();
      return { kind: 'Assign', op, target: this.toPattern(left), value, pos };
    }
    return left;
  }
  private tryArrow(isAsync: boolean): Expr | null {
    const s = this.save(); const pos = this.p;
    let typeParams: TypeParams | undefined;
    let params: Param[];
    let returns: Type | undefined;
    try {
      if (this.isOp('<')) typeParams = this.parseTypeParams();
      if (this.isOp('(')) {
        params = this.parseParams();
      } else if (this.isIdent()) {
        params = [{ pattern: { kind: 'Ident', name: this.ident(), pos } }];
        if (!this.isOp('=>')) { this.restore(s); return null; }
      } else { this.restore(s); return null; }
      if (this.isOp(':') && !this.tok.nlBefore) { this.advance(); returns = this.parseType(); }
      if (!this.isOp('=>') || this.tok.nlBefore) { this.restore(s); return null; }
    } catch (err) {
      if (err instanceof VeyError) { this.restore(s); return null; }
      throw err;
    }
    // From here on this is definitely an arrow function: errors in the body are real errors.
    this.advance();
    const body = this.isOp('{') ? this.parseBlock() : this.parseAssignment();
    return { kind: 'Arrow', params, typeParams, returns, body, async: isAsync, pos };
  }
  private parseConditional(): Expr {
    const pos = this.p;
    const test = this.parseBinary(0);
    if (this.isOp('?') && !(this.tok.nlBefore && this.depth === 0 && false)) {
      this.advance();
      const saved = this.depth; this.depth++;
      const then = this.parseAssignment();
      this.expect(':');
      this.depth = saved;
      const els = this.parseAssignment();
      return { kind: 'Cond', test, then, else: els, pos };
    }
    return test;
  }
  private binOp(): string | null {
    const t = this.tok;
    if (t.type === 'op' && t.value in BIN_PREC) return t.value;
    if (t.type === 'kw' && ['and', 'or', 'instanceof', 'in', 'is', 'as', 'satisfies'].includes(t.value)) return t.value;
    if (t.type === 'kw' && t.value === 'not' && this.peekAfter().value === 'in') return 'not';
    return null;
  }
  parseBinary(minPrec: number): Expr {
    let left = this.parseUnary();
    for (;;) {
      const op = this.binOp();
      if (!op) break;
      const prec = BIN_PREC[op];
      if (prec < minPrec || prec === undefined) break;
      // `as`/`satisfies`/`is` bind a type, not an expression
      if (op === 'as' || op === 'satisfies') { this.advance(); if (op === 'as' && this.isKw('const')) { this.advance(); left = { kind: 'As', expr: left, type: { text: 'const' }, pos: left.pos }; continue; } const type = this.parseType(); left = { kind: op === 'as' ? 'As' : 'Satisfies', expr: left, type, pos: left.pos }; continue; }
      if (op === 'is' && this.depth === 0 && this.tok.nlBefore) break;
      const pos = left.pos;
      this.advance();
      if (op === 'not') { this.expect('in'); const right = this.parseBinary(prec + 1); left = { kind: 'In', item: left, container: right, negate: true, pos }; this.helpers.add('__in'); continue; }
      if (op === 'in') { const right = this.parseBinary(prec + 1); left = { kind: 'In', item: left, container: right, negate: false, pos }; this.helpers.add('__in'); continue; }
      if (op === 'is') { const right = this.parseBinary(prec + 1); left = { kind: 'Binary', op: '===', left, right, pos }; continue; }
      if (op === '..' || op === '..=') { const to = this.parseBinary(prec + 1); let step: Expr | undefined; if (this.isKw('step')) { this.advance(); step = this.parseBinary(prec + 1); } left = { kind: 'Range', from: left, to, inclusive: op === '..=', step, pos }; continue; }
      if (op === '|>') { const right = this.parseBinary(prec + 1); left = { kind: 'Pipe', left, right, pos }; continue; }
      const right = op === '**' ? this.parseBinary(prec) : this.parseBinary(prec + 1); // ** is right-associative
      if (op === '&&' || op === 'and') left = { kind: 'Logical', op: '&&', left, right, pos };
      else if (op === '||' || op === 'or') left = { kind: 'Logical', op: '||', left, right, pos };
      else if (op === '??') left = { kind: 'Logical', op: '??', left, right, pos };
      else left = { kind: 'Binary', op: op === '==' ? '===' : op === '!=' ? '!==' : op, left, right, pos };
    }
    return left;
  }
  private parseUnary(): Expr {
    const pos = this.p; const t = this.tok;
    if (t.type === 'op' && ['!', '-', '+', '~'].includes(t.value)) { this.advance(); return { kind: 'Unary', op: t.value, arg: this.parseUnary(), pos }; }
    if (t.type === 'op' && (t.value === '++' || t.value === '--')) { this.advance(); return { kind: 'Update', op: t.value as '++' | '--', prefix: true, arg: this.parseUnary(), pos }; }
    if (t.type === 'kw') {
      if (t.value === 'not') { this.advance(); return { kind: 'Unary', op: '!', arg: this.parseUnary(), pos }; }
      if (t.value === 'typeof' || t.value === 'void' || t.value === 'delete') { this.advance(); return { kind: 'Unary', op: t.value, arg: this.parseUnary(), pos }; }
      if (t.value === 'await') { this.advance(); return { kind: 'Await', arg: this.parseUnary(), pos }; }
    }
    if (t.type === 'op' && t.value === '<' && this.looksLikeJsx()) { const node = this.parseJsx(); this.advance('code'); return this.parsePostfixOps(node); }
    return this.parsePostfix();
  }
  private parseUnaryNoCallOnNewline(): Expr { return this.parsePostfix(); }
  private looksLikeJsx(): boolean {
    const next = this.peekAfter();
    return next.type === 'name' || (next.type === 'op' && next.value === '>') || (next.type === 'kw');
  }
  private parsePostfix(): Expr {
    const pos = this.p;
    let e = this.parsePrimary();
    e = this.parsePostfixOps(e);
    if (this.tok.type === 'op' && (this.tok.value === '++' || this.tok.value === '--') && !this.tok.nlBefore) { const op = this.tok.value as '++' | '--'; this.advance(); e = { kind: 'Update', op, prefix: false, arg: e, pos }; }
    return e;
  }
  private parseArgs(): (Expr | { kind: 'Spread'; expr: Expr })[] {
    this.expect('(');
    const saved = this.depth; this.depth++;
    const args: (Expr | { kind: 'Spread'; expr: Expr })[] = [];
    while (!this.isOp(')')) {
      if (this.eat('...')) args.push({ kind: 'Spread', expr: this.parseAssignment() });
      else args.push(this.parseAssignment());
      if (!this.eat(',')) break;
    }
    this.expect(')'); this.depth = saved;
    return args;
  }
  private parsePostfixOps(e: Expr): Expr {
    for (;;) {
      const t = this.tok; const pos = e.pos;
      if (t.type === 'op') {
        if (t.value === '.') { this.advance(); e = { kind: 'Member', object: e, property: this.ident(true), optional: false, pos }; continue; }
        if (t.value === '?.') {
          this.advance();
          if (this.isOp('(')) { e = { kind: 'Call', callee: e, args: this.parseArgs(), optional: true, pos }; continue; }
          if (this.isOp('[')) { this.advance(); const saved = this.depth; this.depth++; const index = this.parseExpression(); this.depth = saved; this.expect(']'); e = { kind: 'Index', object: e, index, optional: true, pos }; continue; }
          e = { kind: 'Member', object: e, property: this.ident(true), optional: true, pos }; continue;
        }
        if (t.value === '(' && !(t.nlBefore && this.depth === 0)) { e = { kind: 'Call', callee: e, args: this.parseArgs(), optional: false, pos }; continue; }
        if (t.value === '[' && !(t.nlBefore && this.depth === 0)) { this.advance(); const saved = this.depth; this.depth++; const index = this.parseExpression(); this.depth = saved; this.expect(']'); e = { kind: 'Index', object: e, index, optional: false, pos }; continue; }
        if (t.value === '!' && !t.nlBefore) { this.advance(); e = { kind: 'NonNull', expr: e, pos }; continue; }
        if (t.value === '<' && !t.nlBefore) {
          // generic call: f<T>(x)
          const s = this.save();
          try {
            const typeArgs = this.parseTypeArgsText();
            if (this.isOp('(')) { e = { kind: 'Call', callee: e, args: this.parseArgs(), optional: false, typeArgs, pos }; continue; }
            if (this.tok.type === 'template') { const tpl = this.parseTemplate(); e = { ...tpl, tag: e }; continue; }
          } catch (err) { if (!(err instanceof VeyError)) throw err; }
          this.restore(s);
        }
      }
      if (t.type === 'template' && !t.nlBefore) { const tpl = this.parseTemplate(); e = { ...tpl, tag: e }; continue; }
      break;
    }
    return e;
  }
  private parseTemplate(): Extract<Expr, { kind: 'Template' }> {
    const t = this.tok; const pos = this.p;
    const parts = (t.parts ?? []).map(part => part.kind === 'text' ? part : { kind: 'expr' as const, expr: part.expr as Expr });
    this.advance();
    return { kind: 'Template', parts, pos };
  }
  private parsePrimary(): Expr {
    const t = this.tok; const pos = this.p;
    switch (t.type) {
      case 'num': this.advance(); return { kind: 'Num', raw: t.value, pos };
      case 'str': this.advance(); return { kind: 'Str', value: t.value, pos };
      case 'regex': this.advance(); return { kind: 'Regex', raw: t.raw, pos };
      case 'template': return this.parseTemplate();
      case 'fstring': { const tpl = this.parseTemplate(); return { ...tpl, parts: tpl.parts.map(p => p.kind === 'text' ? { kind: 'text' as const, value: p.value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${'), cooked: p.cooked } : p) }; }
      case 'name': this.advance(); return { kind: 'Ident', name: t.value, pos };
      case 'eof': this.fail('Unexpected end of file');
    }
    if (t.type === 'kw') {
      switch (t.value) {
        case 'this': this.advance(); return { kind: 'This', pos };
        case 'super': this.advance(); return { kind: 'Super', pos };
        case 'null': case 'undefined': case 'true': case 'false': this.advance(); return { kind: 'Lit', value: t.value, pos };
        case 'fn': if (this.fnExprAhead()) return this.parseFnExpr(false); this.advance(); return { kind: 'Ident', name: 'fn', pos };
        case 'class': return { kind: 'ClassExpr', decl: this.parseClass(false, false), pos };
        case 'new': {
          this.advance();
          if (this.isOp('.')) { this.advance(); this.ident(true); return { kind: 'Ident', name: 'new.target', pos }; }
          let callee = this.parsePrimary();
          for (;;) { if (this.isOp('.')) { this.advance(); callee = { kind: 'Member', object: callee, property: this.ident(true), optional: false, pos }; } else if (this.isOp('[')) { this.advance(); const index = this.parseExpression(); this.expect(']'); callee = { kind: 'Index', object: callee, index, optional: false, pos }; } else break; }
          let typeArgs: string | undefined; if (this.isOp('<') && !this.tok.nlBefore) typeArgs = this.parseTypeArgsText();
          const args = this.isOp('(') && !this.tok.nlBefore ? this.parseArgs() : [];
          return { kind: 'New', callee, args, typeArgs, pos };
        }
        case 'import': { this.advance(); if (this.eat('.')) { this.ident(true); return { kind: 'ImportMeta', pos }; } this.expect('('); const source = this.parseAssignment(); this.eat(','); if (!this.isOp(')')) this.parseAssignment(); this.expect(')'); return { kind: 'DynamicImport', source, pos }; }
        case 'match': {
          const s = this.save(); this.advance();
          try { const subject = this.parseCondition(); if (this.matchArmsAhead()) return this.parseMatchExpr(subject, pos); } catch (err) { if (!(err instanceof VeyError)) throw err; }
          this.restore(s); this.advance();
          return { kind: 'Ident', name: 'match', pos };
        }
        case 'print': case 'assert': this.advance(); return { kind: 'Ident', name: t.value, pos };
        case 'async': this.advance(); return this.parseFnExpr(true);
      }
      if (SOFT.has(t.value)) { this.advance(); return { kind: 'Ident', name: t.value, pos }; }
    }
    if (t.type === 'op') {
      if (t.value === '(') {
        this.advance();
        const saved = this.depth; this.depth++;
        const e = this.parseExpression();
        this.depth = saved;
        this.expect(')');
        return { kind: 'Paren', expr: e, pos };
      }
      if (t.value === '[') return this.parseArrayOrComprehension();
      if (t.value === '{') return this.parseObjectOrComprehension();
    }
    this.fail(`Unexpected ${this.describe()}`);
  }
  private parseFnExpr(isAsync: boolean): Expr {
    const pos = this.p; this.expect('fn');
    const generator = this.eat('*');
    const name = this.isIdent() ? this.ident() : undefined;
    const typeParams = this.isOp('<') ? this.parseTypeParams() : undefined;
    const params = this.parseParams();
    const returns = this.eat(':') ? this.parseType() : undefined;
    if (this.isOp('=>')) { this.advance(); const body = this.isOp('{') ? this.parseBlock() : this.parseAssignment(); return { kind: 'Arrow', params, typeParams, returns, body, async: isAsync, pos }; }
    const body = this.parseBlock();
    return { kind: 'FnExpr', name, params, typeParams, returns, body, async: isAsync, generator, pos };
  }
  private parseMatchExpr(subject: Expr, pos: Pos): Expr {
    this.expect('{');
    const saved = this.depth; this.depth++;
    const arms: Extract<Expr, { kind: 'MatchExpr' }>['arms'] = [];
    while (!this.isOp('}')) {
      if (this.eat('else') || (this.tok.value === '_' && this.peekAfter().value === '=>' && (this.advance(), true))) { this.expect('=>'); arms.push({ patterns: [], value: this.parseAssignment(), isElse: true }); this.eat(','); continue; }
      this.eat('case');
      const patterns: Expr[] = [this.parseMatchPattern()];
      while (this.eat('|')) patterns.push(this.parseMatchPattern());
      const guard = this.eat('if') ? this.parseBinary(0) : undefined;
      this.expect('=>');
      arms.push({ patterns, guard, value: this.parseAssignment(), isElse: false });
      this.eat(',');
    }
    this.expect('}'); this.depth = saved;
    return { kind: 'MatchExpr', subject, arms, pos };
  }
  private parseComprehensionClauses(): { pattern: Pattern; iterable: Expr; conds: Expr[] }[] {
    const clauses: { pattern: Pattern; iterable: Expr; conds: Expr[] }[] = [];
    while (this.isKw('for')) {
      this.advance();
      let pattern = this.parsePattern();
      let pairs = false;
      if (this.eat(',')) { const second = this.parsePattern(); pattern = { kind: 'ArrayPattern', items: [{ value: pattern }, { value: second }], pos: this.p }; pairs = true; }
      this.expect('in');
      let iterable = this.parseBinary(0.5);
      if (pairs) { this.helpers.add('__pairs'); iterable = { kind: 'Call', callee: { kind: 'Ident', name: '__pairs', pos: iterable.pos }, args: [iterable], optional: false, pos: iterable.pos }; }
      const conds: Expr[] = [];
      while (this.isKw('if')) { this.advance(); conds.push(this.parseBinary(1)); }
      clauses.push({ pattern, iterable, conds });
    }
    return clauses;
  }
  private parseArrayOrComprehension(): Expr {
    const pos = this.p; this.expect('[');
    const saved = this.depth; this.depth++;
    const items: Extract<Expr, { kind: 'Array' }>['items'] = [];
    while (!this.isOp(']')) {
      if (this.isOp(',')) { this.advance(); items.push(null); continue; }
      if (this.eat('...')) items.push({ kind: 'Spread', expr: this.parseAssignment() });
      else {
        const e = this.parseAssignment();
        if (items.length === 0 && this.isKw('for')) {
          const clauses = this.parseComprehensionClauses();
          this.expect(']'); this.depth = saved; this.helpers.add('__comp');
          return { kind: 'Comprehension', kindOf: 'list', expr: e, clauses, pos };
        }
        items.push(e);
      }
      if (!this.eat(',')) break;
    }
    this.expect(']'); this.depth = saved;
    return { kind: 'Array', items, pos };
  }
  private parseObjectOrComprehension(): Expr {
    const pos = this.p; this.expect('{');
    const saved = this.depth; this.depth++;
    // Dict comprehension first: `{ keyExpr: valueExpr for … }`, where the key is any expression.
    const mark = this.save();
    try {
      if (!this.isOp('}') && !this.isOp('...')) {
        const keyExpr = this.parseAssignment();
        if (this.eat(':')) {
          const value = this.parseAssignment();
          if (this.isKw('for')) {
            const clauses = this.parseComprehensionClauses();
            this.expect('}'); this.depth = saved; this.helpers.add('__comp');
            return { kind: 'Comprehension', kindOf: 'dict', expr: keyExpr, valueExpr: value, clauses, pos };
          }
        }
      }
    } catch (err) { if (!(err instanceof VeyError)) throw err; }
    this.restore(mark);
    const props: ObjProp[] = [];
    while (!this.isOp('}')) {
      if (this.eat('...')) { props.push({ kind: 'Spread', expr: this.parseAssignment() }); if (!this.eat(',')) break; continue; }
      let isAsync = false, generator = false, accessor: 'get' | 'set' | undefined;
      if (this.isKw('async') && !['(', ':', ',', '}'].includes(this.peekAfter().value)) { isAsync = true; this.advance(); }
      if ((this.isKw('get') || this.isKw('set')) && !['(', ':', ',', '}', '<'].includes(this.peekAfter().value)) { accessor = this.tok.value as 'get' | 'set'; this.advance(); }
      if (this.eat('*')) generator = true;
      let key: string, computed: Expr | undefined;
      if (this.eat('[')) { computed = this.parseAssignment(); this.expect(']'); key = ''; }
      else if (this.tok.type === 'str') { key = JSON.stringify(this.tok.value); this.advance(); }
      else if (this.tok.type === 'num') { key = this.tok.raw; this.advance(); }
      else key = this.ident(true);
      if (this.isOp('(') || this.isOp('<')) {
        const typeParams = this.isOp('<') ? this.parseTypeParams() : undefined;
        const params = this.parseParams();
        const returns = this.eat(':') ? this.parseType() : undefined;
        const body = this.parseBlock();
        props.push({ kind: 'Method', key, computed, params, body, async: isAsync, generator, accessor, returns, typeParams });
      } else if (this.eat(':')) {
        const value = this.parseAssignment();
        props.push({ kind: 'Prop', key, computed, value, shorthand: false });
      } else {
        // shorthand, possibly with default (only meaningful as a pattern)
        let value: Expr = { kind: 'Ident', name: key, pos };
        if (this.isOp('=')) { this.advance(); const def = this.parseAssignment(); value = { kind: 'Assign', op: '=', target: { kind: 'Ident', name: key, pos }, value: def, pos }; }
        props.push({ kind: 'Prop', key, value, shorthand: true });
      }
      if (!this.eat(',')) break;
    }
    this.expect('}'); this.depth = saved;
    return { kind: 'Object', props, pos };
  }

  // ── JSX (views) ─────────────────────────────────────────────────────────
  private parseJsx(): Extract<Expr, { kind: 'Jsx' }> {
    this.usesJsx = true;
    const pos = this.p;
    // We are at '<' scanned in code mode; re-scan from its start in tag mode.
    const start = this.tok.start;
    this.pos = start; this.tok = { ...this.tok, end: start }; this.advance('jsxtag');
    this.expect('<');
    let tag: string | null = null;
    if (this.isOp('>')) { this.advance('jsxtext'); return this.parseJsxChildren(null, [], pos); }
    tag = this.tok.value; this.advance('jsxtag');
    while (this.isOp('.')) { this.advance('jsxtag'); tag += '.' + this.tok.value; this.advance('jsxtag'); }
    const attrs: JsxAttr[] = [];
    for (;;) {
      if (this.isOp('/>')) { this.pos = this.tok.end; this.tok = { ...this.tok, end: this.tok.end }; return { kind: 'Jsx', tag, attrs, children: [], selfClosing: true, pos }; }
      if (this.isOp('>')) { this.advance('jsxtext'); return this.parseJsxChildren(tag, attrs, pos); }
      if (this.isOp('{')) { this.advance('code'); this.expect('...'); const saved = this.depth; this.depth++; const expr = this.parseAssignment(); this.depth = saved; if (!this.isOp('}')) this.fail('Expected "}"'); this.advance('jsxtag'); attrs.push({ kind: 'Spread', expr }); continue; }
      if (this.tok.type !== 'name') this.fail(`Unexpected ${this.describe()} in tag`);
      const name = this.tok.value; this.advance('jsxtag');
      if (this.isOp('=')) {
        this.advance(this.peekRawIs('{') ? 'code' : 'jsxtag');
        const valueTok = this.tok;
        if (valueTok.type === 'str') { attrs.push({ kind: 'Attr', name, value: valueTok.value }); this.advance('jsxtag'); }
        else if (this.isOp('{')) { this.advance('code'); const saved = this.depth; this.depth++; const expr = this.parseAssignment(); this.depth = saved; if (!this.isOp('}')) this.fail('Expected "}" after attribute value'); this.advance('jsxtag'); attrs.push({ kind: 'Attr', name, value: expr }); }
        else if (this.isOp('<')) { const node = this.parseJsx(); this.advance('jsxtag'); attrs.push({ kind: 'Attr', name, value: node }); }
        else this.fail('Expected an attribute value');
      } else attrs.push({ kind: 'Attr', name });
    }
  }
  private peekRawIs(ch: string): boolean { const [p] = this.lx.skip(this.pos); return this.src[p] === ch; }
  private parseJsxChildren(tag: string | null, attrs: JsxAttr[], pos: Pos): Extract<Expr, { kind: 'Jsx' }> {
    const children: JsxChild[] = [];
    for (;;) {
      if (this.tok.type === 'jsxtext') { if (this.tok.value) children.push({ kind: 'Text', value: this.tok.value }); this.pos = this.tok.end; this.tok = { ...this.tok, end: this.tok.end }; this.advance('jsxtag'); continue; }
      if (this.isOp('{')) {
        this.advance('code');
        if (this.isOp('}')) { this.advance('jsxtext'); children.push({ kind: 'Expr', expr: null }); continue; }
        const saved = this.depth; this.depth++;
        const expr = this.eat('...') ? { kind: 'Spread' as const, expr: this.parseAssignment(), pos: this.p } : this.parseAssignment();
        this.depth = saved;
        if (!this.isOp('}')) this.fail(`Expected "}" but found ${this.describe()}`);
        this.advance('jsxtext');
        children.push({ kind: 'Expr', expr });
        continue;
      }
      if (this.isOp('</')) {
        this.advance('jsxtag');
        if (tag === null) { if (!this.isOp('>')) this.fail('Expected "</>" to close the fragment'); }
        else {
          let closing = this.tok.value; this.advance('jsxtag');
          while (this.isOp('.')) { this.advance('jsxtag'); closing += '.' + this.tok.value; this.advance('jsxtag'); }
          if (closing !== tag) this.fail(`Expected </${tag}> but found </${closing}>`);
        }
        if (!this.isOp('>')) this.fail('Expected ">"');
        this.pos = this.tok.end; this.tok = { ...this.tok, end: this.tok.end };
        return { kind: 'Jsx', tag, attrs, children, selfClosing: false, pos };
      }
      if (this.isOp('<')) { const node = this.parseJsx(); this.advance('jsxtext'); children.push({ kind: 'Jsx', node }); continue; }
      if (this.tok.type === 'eof') this.fail(`Unclosed <${tag ?? ''}>`);
      this.fail(`Unexpected ${this.describe()} in view`);
    }
  }
}

/** Removes `//`, `#` and block comments from a slice of source, leaving string literals alone. */
export function stripComments(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') { const q = c; out += c; i++; while (i < text.length && text[i] !== q) { if (text[i] === '\\') { out += text[i]; i++; } out += text[i]; i++; } out += text[i] ?? ''; continue; }
    if (c === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); i = end < 0 ? text.length : end + 1; out += ' '; continue; }
    if ((c === '/' && text[i + 1] === '/') || c === '#') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; continue; }
    out += c;
  }
  return out;
}

export function parse(src: string, file = ''): Program { return new Parser(src, file).parseProgram(); }
