import type { ClassMember, Expr, JsxChild, ObjProp, Param, Pattern, Program, Stmt } from './ast.ts';

// Emits JavaScript (types erased) or TypeScript (types kept) from a Vey tree.
export interface EmitOptions {
  target?: 'js' | 'ts';
  /** Module that provides createElement/Fragment for views. Default: react. */
  jsxImport?: string;
  /** Module that provides the runtime helpers. Default: vey/runtime. */
  runtime?: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', mdash: '—', ndash: '–', hellip: '…', times: '×', laquo: '«', raquo: '»', rarr: '→', larr: '←', middot: '·' };
const decodeEntities = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITIES[e] ?? m));

/** Built-in functions available in every Vey file without an import, unless the file declares the same name. */
export const BUILTINS = ['print', 'assert', 'len', 'str', 'int', 'float', 'bool', 'keys', 'values', 'entries', 'range', 'sleep', 'type_of', 'sum', 'min', 'max', 'sorted', 'reversed', 'enumerate', 'zip', 'unique', 'chunk', 'clamp', 'input', 'read_file', 'write_file', 'json'];

const PATTERN_KEYS = new Set(['pattern', 'target', 'param']);
/** Which built-in names a program references without declaring. */
export function usedBuiltins(program: Program): string[] {
  const declared = new Set<string>();
  const referenced = new Set<string>();
  const pattern = (p: unknown) => {
    if (!p || typeof p !== 'object') return;
    const n = p as { kind?: string; name?: string; props?: { value: unknown; default?: unknown }[]; items?: ({ value: unknown; default?: unknown } | null)[]; expr?: unknown };
    if (n.kind === 'Ident' && n.name) declared.add(n.name);
    else if (n.kind === 'ObjectPattern') n.props?.forEach(pr => { pattern(pr.value); walk(pr.default); });
    else if (n.kind === 'ArrayPattern') n.items?.forEach(it => { if (it) { pattern(it.value); walk(it.default); } });
    else if (n.kind === 'ExprPattern') walk(n.expr);
  };
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const n = node as Record<string, unknown> & { kind?: string };
    if (n.kind === 'Ident' && typeof n.name === 'string') { referenced.add(n.name); return; }
    if ((n.kind === 'Fn' || n.kind === 'Class' || n.kind === 'Struct' || n.kind === 'Enum') && typeof n.name === 'string') declared.add(n.name);
    if (n.kind === 'ForRange' && typeof n.name === 'string') declared.add(n.name);
    if (n.kind === 'Import') { if (typeof n.default === 'string') declared.add(n.default); if (typeof n.namespace === 'string') declared.add(n.namespace); (n.named as { name: string; alias?: string }[]).forEach(x => declared.add(x.alias ?? x.name)); }
    for (const [key, value] of Object.entries(n)) {
      if (key === 'kind' || key === 'pos') continue;
      if (PATTERN_KEYS.has(key)) { pattern(value); continue; }
      if (key === 'params' && Array.isArray(value)) { value.forEach(p => { pattern(p.pattern); walk(p.default); }); continue; }
      if (key === 'clauses' && Array.isArray(value)) { value.forEach(c => { pattern(c.pattern); walk(c.iterable); walk(c.conds); }); continue; }
      if (key === 'items' && n.kind === 'Var' && Array.isArray(value)) { value.forEach(i => { pattern(i.pattern); walk(i.init); }); continue; }
      walk(value);
    }
  };
  walk(program.body);
  return BUILTINS.filter(b => referenced.has(b) && !declared.has(b));
}

export class Emitter {
  private out: string[] = [];
  private indent = 0;
  private target: 'js' | 'ts';
  private jsxImport: string;
  private runtime: string;
  private helpers = new Set<string>();
  private program: Program;
  constructor(program: Program, options: EmitOptions = {}) {
    this.program = program;
    this.target = options.target ?? 'js';
    this.jsxImport = options.jsxImport ?? 'react';
    this.runtime = options.runtime ?? 'vey/runtime';
  }
  private get ts() { return this.target === 'ts'; }
  /** Module specifiers: in TypeScript output, .vey files are emitted as .tsx. */
  private source(spec: string) { return JSON.stringify(this.ts ? spec.replace(/\.vey$/, '.tsx') : spec); }
  private line(s: string) { this.out.push('  '.repeat(this.indent) + s); }

  emit(): string {
    for (const stmt of this.program.body) this.stmt(stmt);
    const head: string[] = [];
    const helpers = new Set([...this.program.helpers, ...this.helpers, ...usedBuiltins(this.program)]);
    if (helpers.size) head.push(`import { ${[...helpers].sort().join(', ')} } from ${JSON.stringify(this.runtime)};`);
    if (this.program.usesJsx && !this.ts) head.push(`import { createElement as __h, Fragment as __F } from ${JSON.stringify(this.jsxImport)};`);
    return [...head, ...this.out].join('\n') + '\n';
  }

  // ── statements ──────────────────────────────────────────────────────────
  private block(body: Stmt[]) {
    this.indent++;
    for (const s of body) this.stmt(s);
    this.indent--;
  }
  private typed(t?: { text: string }) { return this.ts && t ? `: ${t.text}` : ''; }
  private tparams(t?: { text: string }) { return this.ts && t ? t.text : ''; }

  stmt(s: Stmt) {
    switch (s.kind) {
      case 'Empty': return;
      case 'Pass': this.line(';'); return;
      case 'Var': {
        if (s.declare && !this.ts) return;
        const items = s.items.map(i => `${this.pattern(i.pattern)}${this.ts && i.definite ? '!' : ''}${this.typed(i.type)}${i.init ? ` = ${this.expr(i.init)}` : ''}`).join(', ');
        this.line(`${s.exported ? 'export ' : ''}${s.declare ? 'declare ' : ''}${s.decl} ${items};`);
        return;
      }
      case 'Fn': {
        const head = `${s.exported ? 'export ' : ''}${s.isDefault ? 'default ' : ''}${s.async ? 'async ' : ''}function${s.generator ? '*' : ''} ${s.name}${this.tparams(s.typeParams)}(${this.params(s.params)})${this.typed(s.returns)} {`;
        this.line(head); this.block(s.body); this.line('}');
        return;
      }
      case 'Class': this.classDecl(s, `${s.exported ? 'export ' : ''}${s.isDefault ? 'default ' : ''}`); return;
      case 'Struct': this.struct(s); return;
      case 'Enum': {
        const members = s.members.map(m => `${/^[A-Za-z_$][\w$]*$/.test(m.name) ? m.name : JSON.stringify(m.name)}: ${m.value ? this.expr(m.value) : JSON.stringify(m.name)}`);
        this.line(`${s.exported ? 'export ' : ''}const ${s.name} = Object.freeze({ ${members.join(', ')} }${this.ts ? ' as const' : ''});`);
        if (this.ts) this.line(`${s.exported ? 'export ' : ''}type ${s.name} = typeof ${s.name}[keyof typeof ${s.name}];`);
        return;
      }
      case 'TypeAlias': if (this.ts) this.line(`${s.exported ? 'export ' : ''}type ${s.name}${this.tparams(s.typeParams)} = ${s.type.text};`); return;
      case 'Interface': if (this.ts) this.line(`${s.exported ? 'export ' : ''}${s.text}`); return;
      case 'Declare': if (this.ts) this.line(`${s.exported ? 'export ' : ''}${s.text}`); return;
      case 'Import': {
        if (s.sideEffect) { this.line(`import ${this.source(s.source)};`); return; }
        const named = this.ts ? s.named : s.named.filter(n => !n.isType);
        if (s.typeOnly && !this.ts) return;
        if (!s.default && !s.namespace && !named.length) { if (s.named.length) return; this.line(`import ${this.source(s.source)};`); return; }
        const parts: string[] = [];
        if (s.default) parts.push(s.default);
        if (s.namespace) parts.push(`* as ${s.namespace}`);
        if (named.length) parts.push(`{ ${named.map(n => `${this.ts && n.isType ? 'type ' : ''}${n.name}${n.alias ? ` as ${n.alias}` : ''}`).join(', ')} }`);
        this.line(`import ${this.ts && s.typeOnly ? 'type ' : ''}${parts.join(', ')} from ${this.source(s.source)};`);
        return;
      }
      case 'ExportNamed': {
        if (s.typeOnly && !this.ts) return;
        const items = this.ts ? s.items : s.items.filter(i => !i.isType);
        if (!items.length) return;
        this.line(`export ${this.ts && s.typeOnly ? 'type ' : ''}{ ${items.map(i => `${this.ts && i.isType ? 'type ' : ''}${i.name}${i.alias ? ` as ${i.alias}` : ''}`).join(', ')} }${s.source ? ` from ${this.source(s.source)}` : ''};`);
        return;
      }
      case 'ExportAll': this.line(`export *${s.alias ? ` as ${s.alias}` : ''} from ${this.source(s.source)};`); return;
      case 'ExportDefault': this.line(`export default ${this.expr(s.expr)};`); return;
      case 'If': {
        this.line(`if (${this.expr(s.test)}) {`); this.block(s.then);
        let els = s.else;
        while (els) {
          if (!Array.isArray(els) && els.kind === 'If') { this.line(`} else if (${this.expr(els.test)}) {`); this.block(els.then); els = els.else; continue; }
          this.line('} else {'); this.block(Array.isArray(els) ? els : [els]); break;
        }
        this.line('}');
        return;
      }
      case 'ForIn': this.line(`for${s.await ? ' await' : ''} (${s.decl} ${this.pattern(s.pattern)} ${s.isKeys ? 'in' : 'of'} ${this.expr(s.iterable)}) {`); this.block(s.body); this.line('}'); return;
      case 'ForRange': {
        const n = s.name; const to = `__to_${n}`; const step = `__step_${n}`;
        this.helpers.add('__rangeStep');
        this.helpers.add('__rangeNext');
        this.line(`for (let ${n} = ${this.expr(s.from)}, ${to} = ${this.expr(s.to)}, ${step} = __rangeStep(${n}, ${to}, ${s.step ? this.expr(s.step) : '1'}); ${step} > 0 ? ${n} ${s.inclusive ? '<=' : '<'} ${to} : ${n} ${s.inclusive ? '>=' : '>'} ${to}; ${n} = __rangeNext(${n}, ${step})) {`);
        this.block(s.body); this.line('}');
        return;
      }
      case 'ForC': {
        let init = '';
        if (s.init) {
          if (s.init.kind === 'Var') init = `${s.init.decl} ${s.init.items.map(i => `${this.pattern(i.pattern)}${this.typed(i.type)}${i.init ? ` = ${this.expr(i.init)}` : ''}`).join(', ')}`;
          else if (s.init.kind === 'ExprStmt') init = this.expr(s.init.expr);
        }
        this.line(`for (${init}; ${s.test ? this.expr(s.test) : ''}; ${s.update ? this.expr(s.update) : ''}) {`); this.block(s.body); this.line('}');
        return;
      }
      case 'While': this.line(`while (${this.expr(s.test)}) {`); this.block(s.body); this.line('}'); return;
      case 'DoWhile': this.line('do {'); this.block(s.body); this.line(`} while (${this.expr(s.test)});`); return;
      case 'Match': {
        this.line(`{ const __m = ${this.expr(s.subject)};`);
        this.indent++;
        let first = true;
        for (const arm of s.arms) {
          const test = arm.isElse ? 'true' : [arm.patterns.map(p => this.matchTest('__m', p)).join(' || ')].concat(arm.guard ? [`(${this.expr(arm.guard)})`] : []).map(x => `(${x})`).join(' && ');
          this.line(`${first ? '' : 'else '}if (${test}) {`); this.block(arm.body); this.line('}');
          first = false;
        }
        this.indent--;
        this.line('}');
        return;
      }
      case 'Switch': {
        this.line(`switch (${this.expr(s.subject)}) {`);
        this.indent++;
        for (const c of s.cases) { this.line(c.test ? `case ${this.expr(c.test)}: {` : 'default: {'); this.block(c.body); this.line('}'); }
        this.indent--;
        this.line('}');
        return;
      }
      case 'Try': {
        this.line('try {'); this.block(s.body);
        if (s.handler) { this.line(`} catch${s.param ? ` (${this.pattern(s.param)})` : ''} {`); this.block(s.handler); }
        if (s.finalizer) { this.line('} finally {'); this.block(s.finalizer); }
        this.line('}');
        return;
      }
      case 'Return': this.line(`return${s.value ? ` ${this.expr(s.value)}` : ''};`); return;
      case 'Throw': this.line(`throw ${this.expr(s.value)};`); return;
      case 'Break': this.line(`break${s.label ? ` ${s.label}` : ''};`); return;
      case 'Continue': this.line(`continue${s.label ? ` ${s.label}` : ''};`); return;
      case 'Labeled': this.line(`${s.label}:`); this.stmt(s.body); return;
      case 'Block': this.line('{'); this.block(s.body); this.line('}'); return;
      case 'ExprStmt': {
        let text = this.expr(s.expr);
        if (/^(\{|function\b|class\b|let\s*\[)/.test(text)) text = `(${text})`;
        this.line(`${text};`);
        return;
      }
      case 'Style': {
        this.helpers.add('__css');
        const id = s.name ? `${s.name.replace(/[^\w$]/g, '_')}_css` : '';
        const call = `__css(${JSON.stringify(s.css.trim())}${s.name ? `, ${JSON.stringify(s.name)}` : ''})`;
        if (s.name) this.line(`${s.exported ? 'export ' : ''}const ${id} = ${call};`); else this.line(`${call};`);
        return;
      }
    }
  }

  private matchTest(subject: string, p: Expr): string {
    if (p.kind === 'Range') { const inc = p.inclusive ? '<=' : '<'; return `(${subject} >= ${this.expr(p.from)} && ${subject} ${inc} ${this.expr(p.to)})`; }
    if (p.kind === 'Ident' && p.name === '_') return 'true';
    if (p.kind === 'Ident' && /^[A-Z]/.test(p.name) && !['NaN', 'Infinity'].includes(p.name)) return `(${subject} instanceof ${p.name})`;
    if (p.kind === 'Unary' && p.op === 'typeof') return `(typeof ${subject} === ${this.expr(p.arg)})`;
    return `${subject} === ${this.expr(p)}`;
  }

  private classDecl(s: Extract<Stmt, { kind: 'Class' }>, prefix: string, asExpr = false) {
    const head = `${prefix}${this.ts && s.abstract ? 'abstract ' : ''}class${s.name ? ` ${s.name}` : ''}${this.tparams(s.typeParams)}${s.superClass ? ` extends ${this.expr(s.superClass)}${this.ts && s.superTypeArgs ? s.superTypeArgs : ''}` : ''}${this.ts && s.implements ? ` implements ${s.implements}` : ''} {`;
    if (asExpr) this.out.push(head); else this.line(head);
    this.indent++;
    for (const m of s.members) this.member(m);
    this.indent--;
    this.line('}');
  }
  private member(m: ClassMember) {
    const mods = (m.kind === 'Field' || m.kind === 'Method') ? (this.ts ? m.modifiers.filter(x => x !== 'declare').map(x => `${x} `).join('') : '') : '';
    switch (m.kind) {
      case 'IndexSignature': if (this.ts) this.line(`${m.text};`); return;
      case 'StaticBlock': this.line('static {'); this.block(m.body); this.line('}'); return;
      case 'Field': {
        if (!this.ts && m.modifiers.includes('declare')) return;
        const name = m.computed ? `[${this.expr(m.computed)}]` : m.name;
        this.line(`${mods}${m.static ? 'static ' : ''}${name}${this.ts && m.optional ? '?' : ''}${this.ts && m.definite ? '!' : ''}${this.typed(m.type)}${m.value ? ` = ${this.expr(m.value)}` : ''};`);
        return;
      }
      case 'Method': {
        const name = m.computed ? `[${this.expr(m.computed)}]` : m.name;
        const head = `${mods}${m.static ? 'static ' : ''}${m.async ? 'async ' : ''}${m.accessor ? `${m.accessor} ` : ''}${m.generator ? '*' : ''}${name}${this.tparams(m.typeParams)}(${this.params(m.params)})${this.typed(m.returns)}`;
        if (!m.body) { if (this.ts) this.line(`${head};`); return; }
        // TypeScript parameter properties (private x: T) become explicit assignments in JS.
        const props = m.isConstructor ? m.params.filter(p => p.modifier && p.pattern.kind === 'Ident') : [];
        this.line(`${head} {`);
        this.indent++;
        if (!this.ts) for (const p of props) if (p.pattern.kind === 'Ident') this.line(`this.${p.pattern.name} = ${p.pattern.name};`);
        this.indent--;
        this.block(m.body); this.line('}');
        return;
      }
    }
  }
  private struct(s: Extract<Stmt, { kind: 'Struct' }>) {
    // A struct is a class you can call without `new`: Point(1, 2) or Point({ x: 1, y: 2 }).
    const names = s.fields.map(f => f.name);
    const cls = `__${s.name}`;
    const any = this.ts ? ' as any' : '';
    this.line(`class ${cls}${this.tparams(s.typeParams)} {`);
    this.indent++;
    if (this.ts) for (const f of s.fields) this.line(`${f.name}${this.typed(f.type)};`);
    this.line(`static fields = ${JSON.stringify(names)};`);
    this.line(`constructor(${s.fields.map(f => `${f.name}${this.ts ? '?' : ''}${this.typed(f.type)}`).join(', ')}) {`);
    this.indent++;
    const first = names[0] ?? 'undefined';
    this.line(`if (arguments.length === 1 && ${first} && typeof ${first} === 'object' && !Array.isArray(${first}) && ${JSON.stringify(names)}.some(k => k in ${first})) { const o = ${first}${any}; ${s.fields.map(f => `this.${f.name} = o.${f.name}${f.default ? ` ?? ${this.expr(f.default)}` : ''};`).join(' ')} return; }`);
    for (const f of s.fields) this.line(`this.${f.name} = ${f.name}${f.default ? ` ?? ${this.expr(f.default)}` : this.ts ? '!' : ''};`);
    this.indent--;
    this.line('}');
    this.line(`with(patch${this.ts ? `: Partial<${cls}>` : ''}) { return new ${cls}({ ...this, ...patch }${any}); }`);
    this.line(`equals(other${this.ts ? ': unknown' : ''}) { return other instanceof ${cls} && ${cls}.fields.every(k => (this${any})[k] === (other${any})[k]); }`);
    this.line(`toString() { return \`${s.name}(\${${cls}.fields.map(k => \`\${k}=\${String((this${any})[k])}\`).join(', ')})\`; }`);
    for (const m of s.members) this.member(m);
    this.indent--;
    this.line('}');
    this.line(`${s.exported ? 'export ' : ''}const ${s.name} = new Proxy(${cls}, { apply: (target, _self, args) => new target(...${this.ts ? '(args as [])' : 'args'}) })${this.ts ? ` as typeof ${cls} & { (...args: ConstructorParameters<typeof ${cls}>): ${cls}; (fields: Partial<${cls}>): ${cls} }` : ''};`);
    if (this.ts) this.line(`${s.exported ? 'export ' : ''}type ${s.name} = ${cls};`);
  }

  // ── patterns / params ───────────────────────────────────────────────────
  pattern(p: Pattern): string {
    switch (p.kind) {
      case 'Ident': return p.name;
      case 'ExprPattern': return this.expr(p.expr);
      case 'ArrayPattern': return `[${p.items.map(i => i === null ? '' : `${i.rest ? '...' : ''}${this.pattern(i.value)}${i.default ? ` = ${this.expr(i.default)}` : ''}`).join(', ')}]`;
      case 'ObjectPattern': return `{ ${p.props.map(pr => {
        if (pr.rest) return `...${this.pattern(pr.value)}`;
        const key = pr.computed ? `[${this.expr(pr.computed)}]` : pr.key;
        const shorthand = !pr.computed && pr.value.kind === 'Ident' && pr.value.name === pr.key;
        return `${key}${shorthand ? '' : `: ${this.pattern(pr.value)}`}${pr.default ? ` = ${this.expr(pr.default)}` : ''}`;
      }).join(', ')} }`;
    }
  }
  private params(ps: Param[]): string {
    return ps.map(p => `${this.ts && p.modifier ? `${p.modifier} ` : ''}${p.rest ? '...' : ''}${this.pattern(p.pattern)}${this.ts && p.optional ? '?' : ''}${this.typed(p.type)}${p.default ? ` = ${this.expr(p.default)}` : ''}`).join(', ');
  }

  // ── expressions ─────────────────────────────────────────────────────────
  private args(args: (Expr | { kind: 'Spread'; expr: Expr })[]) { return args.map(a => a.kind === 'Spread' ? `...${this.expr(a.expr)}` : this.expr(a)).join(', '); }
  private arrowBody(body: Stmt[] | Expr): string {
    if (!Array.isArray(body)) { const text = this.expr(body); return body.kind === 'Object' || text.startsWith('{') ? `(${text})` : text; }
    const saved = this.out; this.out = [];
    const indent = this.indent; this.indent++;
    for (const s of body) this.stmt(s);
    this.indent = indent;
    const lines = this.out; this.out = saved;
    return `{\n${lines.join('\n')}\n${'  '.repeat(indent)}}`;
  }
  private fnBody(body: Stmt[]): string { return this.arrowBody(body); }

  expr(e: Expr): string {
    switch (e.kind) {
      case 'Num': return e.raw;
      case 'Str': return JSON.stringify(e.value);
      case 'Lit': return e.value;
      case 'Ident': return e.name;
      case 'This': return 'this';
      case 'Super': return 'super';
      case 'Regex': return e.raw;
      case 'Paren': return `(${this.expr(e.expr)})`;
      case 'Template': {
        const body = e.parts.map(p => p.kind === 'text' ? p.value : `\${${this.expr(p.expr)}}`).join('');
        return `${e.tag ? this.expr(e.tag) : ''}\`${body}\``;
      }
      case 'Array': return `[${e.items.map(i => i === null ? '' : i.kind === 'Spread' ? `...${this.expr(i.expr)}` : this.expr(i)).join(', ')}]`;
      case 'Object': return e.props.length ? `{ ${e.props.map(p => this.prop(p)).join(', ')} }` : '{}';
      case 'Arrow': {
        const single = e.params.length === 1 && e.params[0].pattern.kind === 'Ident' && !e.params[0].type && !e.params[0].default && !e.params[0].rest && !e.typeParams && !e.returns;
        const params = single && e.params[0].pattern.kind === 'Ident' ? e.params[0].pattern.name : `${this.tparams(e.typeParams)}(${this.params(e.params)})${this.typed(e.returns)}`;
        return `${e.async ? 'async ' : ''}${params} => ${this.arrowBody(e.body)}`;
      }
      case 'FnExpr': return `${e.async ? 'async ' : ''}function${e.generator ? '*' : ''}${e.name ? ` ${e.name}` : ''}${this.tparams(e.typeParams)}(${this.params(e.params)})${this.typed(e.returns)} ${this.fnBody(e.body)}`;
      case 'ClassExpr': { const saved = this.out; this.out = []; this.classDecl(e.decl, '', true); const lines = this.out; this.out = saved; return `(${lines.join('\n')})`; }
      case 'Unary': return ['typeof', 'void', 'delete'].includes(e.op) ? `${e.op} ${this.expr(e.arg)}` : `${e.op}${this.expr(e.arg)}`;
      case 'Update': return e.prefix ? `${e.op}${this.expr(e.arg)}` : `${this.expr(e.arg)}${e.op}`;
      case 'Binary': return `${this.operand(e.left, e)} ${e.op} ${this.operand(e.right, e)}`;
      case 'Logical': return `${this.operand(e.left, e)} ${e.op} ${this.operand(e.right, e)}`;
      case 'Assign': return `${this.pattern(e.target)} ${e.op} ${this.expr(e.value)}`;
      case 'Cond': return `${this.expr(e.test)} ? ${this.expr(e.then)} : ${this.expr(e.else)}`;
      case 'Call': return `${this.expr(e.callee)}${e.optional ? '?.' : ''}${this.ts && e.typeArgs ? e.typeArgs : ''}(${this.args(e.args)})`;
      case 'New': return `new ${this.expr(e.callee)}${this.ts && e.typeArgs ? e.typeArgs : ''}(${this.args(e.args)})`;
      case 'Member': { const obj = this.expr(e.object); return `${e.object.kind === 'Num' ? `(${obj})` : obj}${e.optional ? '?.' : '.'}${e.property}`; }
      case 'PrivateMember': return `${this.expr(e.object)}${e.optional ? '?.' : '.'}#${e.property}`;
      case 'Index': return `${this.expr(e.object)}${e.optional ? '?.' : ''}[${this.expr(e.index)}]`;
      case 'Seq': return e.exprs.map(x => this.expr(x)).join(', ');
      case 'Spread': return `...${this.expr(e.expr)}`;
      case 'Await': return `await ${this.expr(e.arg)}`;
      case 'Yield': return `yield${e.delegate ? '*' : ''}${e.arg ? ` ${this.expr(e.arg)}` : ''}`;
      case 'As': return this.ts ? `(${this.expr(e.expr)} as ${e.type.text})` : this.expr(e.expr);
      case 'Satisfies': return this.ts ? `(${this.expr(e.expr)} satisfies ${e.type.text})` : this.expr(e.expr);
      case 'NonNull': return this.ts ? `${this.expr(e.expr)}!` : this.expr(e.expr);
      case 'Range': { this.helpers.add('__range'); return `__range(${this.expr(e.from)}, ${this.expr(e.to)}, ${e.step ? this.expr(e.step) : '1'}, ${e.inclusive})`; }
      case 'In': { this.helpers.add('__in'); const call = `__in(${this.expr(e.item)}, ${this.expr(e.container)})`; return e.negate ? `!${call}` : call; }
      case 'Pipe': return e.right.kind === 'Call' ? `${this.expr(e.right.callee)}(${this.expr(e.left)}${e.right.args.length ? `, ${this.args(e.right.args)}` : ''})` : `${this.expr(e.right)}(${this.expr(e.left)})`;
      case 'Comprehension': {
        this.helpers.add('__comp');
        // Nested clauses build from the innermost outwards.
        const inner = e.kindOf === 'list' ? this.expr(e.expr) : `[${this.expr(e.expr)}, ${this.expr(e.valueExpr!)}]`;
        let body = inner;
        for (let i = e.clauses.length - 1; i >= 0; i--) {
          const c = e.clauses[i];
          const param = c.pattern.kind === 'Ident' ? c.pattern.name : `(${this.pattern(c.pattern)})`;
          const cond = c.conds.length ? `${param} => ${c.conds.map(x => `(${this.expr(x)})`).join(' && ')}` : 'null';
          body = `__comp(${this.expr(c.iterable)}, ${cond}, ${param} => ${body}, ${i === e.clauses.length - 1 ? 'false' : 'true'})`;
        }
        return e.kindOf === 'dict' ? `Object.fromEntries(${body})` : body;
      }
      case 'MatchExpr': {
        let out = 'undefined';
        for (let i = e.arms.length - 1; i >= 0; i--) {
          const arm = e.arms[i];
          const test = arm.isElse ? 'true' : [arm.patterns.map(p => this.matchTest('__m', p)).join(' || ')].concat(arm.guard ? [`(${this.expr(arm.guard)})`] : []).map(x => `(${x})`).join(' && ');
          out = arm.isElse ? this.expr(arm.value) : `${test} ? ${this.expr(arm.value)} : ${out}`;
        }
        return `((__m) => ${out})(${this.expr(e.subject)})`;
      }
      case 'ImportMeta': return 'import.meta';
      case 'DynamicImport': return `import(${this.expr(e.source)})`;
      case 'TypeOf': return `typeof ${this.expr(e.arg)}`;
      case 'Jsx': return this.jsx(e);
    }
  }
  private prec(e: Expr): number {
    switch (e.kind) {
      case 'Seq': return 0; case 'Assign': case 'Arrow': case 'Cond': case 'Yield': return 1;
      case 'Logical': return e.op === '??' ? 2 : e.op === '||' ? 2 : 3;
      case 'Binary': return { '|': 4, '^': 5, '&': 6, '===': 7, '!==': 7, '==': 7, '!=': 7, '<': 8, '>': 8, '<=': 8, '>=': 8, instanceof: 8, in: 8, '<<': 9, '>>': 9, '>>>': 9, '+': 10, '-': 10, '*': 11, '/': 11, '%': 11, '**': 12 }[e.op] ?? 8;
      case 'Unary': case 'Await': return 13;
      case 'As': case 'Satisfies': return 13;
      default: return 20;
    }
  }
  private operand(child: Expr, parent: Extract<Expr, { kind: 'Binary' | 'Logical' }>): string {
    const text = this.expr(child);
    const cp = this.prec(child), pp = this.prec(parent);
    const mixedNullish = (parent.kind === 'Logical' && parent.op === '??' && child.kind === 'Logical' && child.op !== '??') || (parent.kind === 'Logical' && parent.op !== '??' && child.kind === 'Logical' && child.op === '??');
    if (cp < pp || mixedNullish || (cp === pp && child === parent.right && parent.kind === 'Binary' && parent.op !== '**') || (cp === pp && child === parent.left && parent.kind === 'Binary' && parent.op === '**')) return `(${text})`;
    return text;
  }
  private prop(p: ObjProp): string {
    switch (p.kind) {
      case 'Spread': return `...${this.expr(p.expr)}`;
      case 'Prop': {
        const key = p.computed ? `[${this.expr(p.computed)}]` : p.key;
        if (p.shorthand && p.value.kind === 'Ident' && p.value.name === p.key) return key;
        if (p.shorthand && p.value.kind === 'Assign') return `${key}: ${this.expr(p.value.value)}`;
        return `${key}: ${this.expr(p.value)}`;
      }
      case 'Method': {
        const key = p.computed ? `[${this.expr(p.computed)}]` : p.key;
        return `${p.async ? 'async ' : ''}${p.accessor ? `${p.accessor} ` : ''}${p.generator ? '*' : ''}${key}${this.tparams(p.typeParams)}(${this.params(p.params)})${this.typed(p.returns)} ${this.fnBody(p.body)}`;
      }
    }
  }
  /** TypeScript output keeps views as JSX so tsc type-checks them against React's element types. */
  private jsxTs(e: Extract<Expr, { kind: 'Jsx' }>): string {
    const attrs = e.attrs.map(a => {
      if (a.kind === 'Spread') return ` {...${this.expr(a.expr)}}`;
      const name = a.name === 'class' ? 'className' : a.name === 'for' ? 'htmlFor' : a.name;
      if (a.value === undefined) return ` ${name}`;
      if (typeof a.value === 'string') return ` ${name}=${JSON.stringify(a.value)}`;
      if (a.value.kind === 'Jsx') return ` ${name}=${this.jsxTs(a.value)}`;
      return ` ${name}={${this.expr(a.value)}}`;
    }).join('');
    const open = e.tag === null ? '<>' : `<${e.tag}${attrs}${e.selfClosing ? ' /' : ''}>`;
    if (e.selfClosing) return open;
    const children = e.children.map(c => c.kind === 'Text' ? c.value : c.kind === 'Expr' ? `{${c.expr ? this.expr(c.expr) : ''}}` : this.jsxTs(c.node)).join('');
    return `${open}${children}${e.tag === null ? '</>' : `</${e.tag}>`}`;
  }
  private jsx(e: Extract<Expr, { kind: 'Jsx' }>): string {
    if (this.ts) return this.jsxTs(e);
    // Lower-case plain names are HTML tags; anything with a dot or a capital is a component.
    const tag = e.tag === null ? '__F' : /^[a-z][\w-]*$/.test(e.tag) ? JSON.stringify(e.tag) : e.tag;
    let props = 'null';
    if (e.attrs.length) {
      const parts = e.attrs.map(a => {
        if (a.kind === 'Spread') return `...${this.expr(a.expr)}`;
        const name = a.name === 'class' ? 'className' : a.name === 'for' ? 'htmlFor' : a.name;
        const key = /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
        if (a.value === undefined) return `${key}: true`;
        if (typeof a.value === 'string') return `${key}: ${JSON.stringify(decodeEntities(a.value))}`;
        return `${key}: ${this.expr(a.value)}`;
      });
      props = `{ ${parts.join(', ')} }`;
    }
    const children = this.jsxChildren(e.children);
    return `__h(${tag}, ${props}${children.length ? `, ${children.join(', ')}` : ''})`;
  }
  private jsxChildren(children: JsxChild[]): string[] {
    const out: string[] = [];
    for (const c of children) {
      if (c.kind === 'Text') {
        // JSX whitespace rules: lines are trimmed; whitespace-only lines vanish; lines are joined with a space.
        const lines = c.value.split('\n');
        const text = lines.map((l, i) => { let s = l; if (i > 0) s = s.replace(/^[ \t]+/, ''); if (i < lines.length - 1) s = s.replace(/[ \t]+$/, ''); return s; }).filter((l, _i, arr) => !(arr.length > 1 && l === '')).join(' ');
        if (text) out.push(JSON.stringify(decodeEntities(text)));
      } else if (c.kind === 'Expr') { if (c.expr) out.push(this.expr(c.expr)); }
      else out.push(this.jsx(c.node));
    }
    return out;
  }
}
