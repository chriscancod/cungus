// Vey syntax tree. Kept deliberately plain: `kind` plus fields.
export interface Pos { line: number; col: number }
export type Node = Stmt | Expr;

export type Type = { text: string }; // types are carried as source text (erased in JS, kept for TypeScript output)
export interface Param { pattern: Pattern; type?: Type; default?: Expr; rest?: boolean; optional?: boolean; modifier?: string }
export interface TypeParams { text: string }

export type Pattern =
  | { kind: 'Ident'; name: string; pos: Pos }
  | { kind: 'ObjectPattern'; props: { key: string; computed?: Expr; value: Pattern; default?: Expr; rest?: boolean }[]; pos: Pos }
  | { kind: 'ArrayPattern'; items: ({ value: Pattern; default?: Expr; rest?: boolean } | null)[]; pos: Pos }
  | { kind: 'ExprPattern'; expr: Expr; pos: Pos }; // assignment targets like a.b or a[0]

export type Stmt =
  | { kind: 'Var'; decl: 'let' | 'const' | 'var'; items: { pattern: Pattern; type?: Type; init?: Expr; definite?: boolean }[]; exported: boolean; declare?: boolean; pos: Pos }
  | { kind: 'Fn'; name: string; params: Param[]; typeParams?: TypeParams; returns?: Type; body: Stmt[]; async: boolean; generator: boolean; exported: boolean; isDefault: boolean; pos: Pos }
  | { kind: 'Class'; name: string; typeParams?: TypeParams; superClass?: Expr; superTypeArgs?: string; implements?: string; members: ClassMember[]; exported: boolean; isDefault: boolean; abstract?: boolean; pos: Pos }
  | { kind: 'Struct'; name: string; typeParams?: TypeParams; fields: { name: string; type?: Type; default?: Expr }[]; members: ClassMember[]; exported: boolean; pos: Pos }
  | { kind: 'Enum'; name: string; members: { name: string; value?: Expr }[]; exported: boolean; pos: Pos }
  | { kind: 'TypeAlias'; name: string; typeParams?: TypeParams; type: Type; exported: boolean; pos: Pos }
  | { kind: 'Interface'; name: string; text: string; exported: boolean; pos: Pos } // raw source from `interface` to the closing brace
  | { kind: 'Declare'; text: string; exported: boolean; pos: Pos } // `declare global { … }` etc., raw
  | { kind: 'Import'; source: string; default?: string; namespace?: string; named: { name: string; alias?: string; isType: boolean }[]; typeOnly: boolean; sideEffect: boolean; pos: Pos }
  | { kind: 'ExportNamed'; items: { name: string; alias?: string; isType: boolean }[]; source?: string; typeOnly: boolean; pos: Pos }
  | { kind: 'ExportAll'; source: string; alias?: string; pos: Pos }
  | { kind: 'ExportDefault'; expr: Expr; pos: Pos }
  | { kind: 'If'; test: Expr; then: Stmt[]; else?: Stmt[] | Stmt; pos: Pos }
  | { kind: 'ForIn'; decl: 'let' | 'const' | 'var'; pattern: Pattern; iterable: Expr; body: Stmt[]; isKeys: boolean; await: boolean; pos: Pos } // Vey `for x in it` and JS `for (const k in obj)` (isKeys)
  | { kind: 'ForRange'; decl: 'let' | 'const'; name: string; from: Expr; to: Expr; inclusive: boolean; step?: Expr; body: Stmt[]; pos: Pos }
  | { kind: 'ForC'; init?: Stmt; test?: Expr; update?: Expr; body: Stmt[]; pos: Pos }
  | { kind: 'While'; test: Expr; body: Stmt[]; pos: Pos }
  | { kind: 'DoWhile'; test: Expr; body: Stmt[]; pos: Pos }
  | { kind: 'Match'; subject: Expr; arms: { patterns: Expr[]; guard?: Expr; body: Stmt[]; isElse: boolean }[]; pos: Pos }
  | { kind: 'Switch'; subject: Expr; cases: { test?: Expr; body: Stmt[] }[]; pos: Pos }
  | { kind: 'Try'; body: Stmt[]; param?: Pattern; handler?: Stmt[]; finalizer?: Stmt[]; pos: Pos }
  | { kind: 'Return'; value?: Expr; pos: Pos }
  | { kind: 'Throw'; value: Expr; pos: Pos }
  | { kind: 'Break'; label?: string; pos: Pos }
  | { kind: 'Continue'; label?: string; pos: Pos }
  | { kind: 'Labeled'; label: string; body: Stmt; pos: Pos }
  | { kind: 'Block'; body: Stmt[]; pos: Pos }
  | { kind: 'ExprStmt'; expr: Expr; pos: Pos }
  | { kind: 'Style'; name?: string; css: string; exported: boolean; pos: Pos }
  | { kind: 'Pass'; pos: Pos }
  | { kind: 'Empty'; pos: Pos };

export type ClassMember =
  | { kind: 'Field'; name: string; computed?: Expr; type?: Type; value?: Expr; static: boolean; modifiers: string[]; optional?: boolean; definite?: boolean; pos: Pos }
  | { kind: 'Method'; name: string; computed?: Expr; params: Param[]; typeParams?: TypeParams; returns?: Type; body?: Stmt[]; static: boolean; async: boolean; generator: boolean; accessor?: 'get' | 'set'; isConstructor: boolean; modifiers: string[]; pos: Pos }
  | { kind: 'StaticBlock'; body: Stmt[]; pos: Pos }
  | { kind: 'IndexSignature'; text: string; pos: Pos };

export type Expr =
  | { kind: 'Num'; raw: string; pos: Pos }
  | { kind: 'Str'; value: string; pos: Pos }
  | { kind: 'Template'; parts: ({ kind: 'text'; value: string; cooked: string } | { kind: 'expr'; expr: Expr })[]; tag?: Expr; pos: Pos }
  | { kind: 'Regex'; raw: string; pos: Pos }
  | { kind: 'Ident'; name: string; pos: Pos }
  | { kind: 'This'; pos: Pos }
  | { kind: 'Super'; pos: Pos }
  | { kind: 'Lit'; value: 'null' | 'undefined' | 'true' | 'false'; pos: Pos }
  | { kind: 'Array'; items: (Expr | { kind: 'Spread'; expr: Expr } | null)[]; pos: Pos }
  | { kind: 'Object'; props: ObjProp[]; pos: Pos }
  | { kind: 'Arrow'; params: Param[]; typeParams?: TypeParams; returns?: Type; body: Stmt[] | Expr; async: boolean; pos: Pos }
  | { kind: 'FnExpr'; name?: string; params: Param[]; typeParams?: TypeParams; returns?: Type; body: Stmt[]; async: boolean; generator: boolean; pos: Pos }
  | { kind: 'ClassExpr'; decl: Extract<Stmt, { kind: 'Class' }>; pos: Pos }
  | { kind: 'Unary'; op: string; arg: Expr; pos: Pos }
  | { kind: 'Update'; op: '++' | '--'; prefix: boolean; arg: Expr; pos: Pos }
  | { kind: 'Binary'; op: string; left: Expr; right: Expr; pos: Pos }
  | { kind: 'Logical'; op: '&&' | '||' | '??'; left: Expr; right: Expr; pos: Pos }
  | { kind: 'Assign'; op: string; target: Pattern; value: Expr; pos: Pos }
  | { kind: 'Cond'; test: Expr; then: Expr; else: Expr; pos: Pos }
  | { kind: 'Call'; callee: Expr; args: (Expr | { kind: 'Spread'; expr: Expr })[]; optional: boolean; typeArgs?: string; pos: Pos }
  | { kind: 'New'; callee: Expr; args: (Expr | { kind: 'Spread'; expr: Expr })[]; typeArgs?: string; pos: Pos }
  | { kind: 'Member'; object: Expr; property: string; optional: boolean; pos: Pos }
  | { kind: 'PrivateMember'; object: Expr; property: string; optional: boolean; pos: Pos }
  | { kind: 'Index'; object: Expr; index: Expr; optional: boolean; pos: Pos }
  | { kind: 'Seq'; exprs: Expr[]; pos: Pos }
  | { kind: 'Spread'; expr: Expr; pos: Pos }
  | { kind: 'Await'; arg: Expr; pos: Pos }
  | { kind: 'Yield'; arg?: Expr; delegate: boolean; pos: Pos }
  | { kind: 'As'; expr: Expr; type: Type; pos: Pos }
  | { kind: 'Satisfies'; expr: Expr; type: Type; pos: Pos }
  | { kind: 'NonNull'; expr: Expr; pos: Pos }
  | { kind: 'Paren'; expr: Expr; pos: Pos }
  | { kind: 'Range'; from: Expr; to: Expr; inclusive: boolean; step?: Expr; pos: Pos }
  | { kind: 'In'; item: Expr; container: Expr; negate: boolean; pos: Pos }
  | { kind: 'Comprehension'; kindOf: 'list' | 'dict'; expr: Expr; valueExpr?: Expr; clauses: { pattern: Pattern; iterable: Expr; conds: Expr[] }[]; pos: Pos }
  | { kind: 'Pipe'; left: Expr; right: Expr; pos: Pos }
  | { kind: 'MatchExpr'; subject: Expr; arms: { patterns: Expr[]; guard?: Expr; value: Expr; isElse: boolean }[]; pos: Pos }
  | { kind: 'Jsx'; tag: string | null; attrs: JsxAttr[]; children: JsxChild[]; selfClosing: boolean; pos: Pos }
  | { kind: 'ImportMeta'; pos: Pos }
  | { kind: 'DynamicImport'; source: Expr; pos: Pos }
  | { kind: 'TypeOf'; arg: Expr; pos: Pos };

export type ObjProp =
  | { kind: 'Prop'; key: string; computed?: Expr; value: Expr; shorthand: boolean }
  | { kind: 'Method'; key: string; computed?: Expr; params: Param[]; body: Stmt[]; async: boolean; generator: boolean; accessor?: 'get' | 'set'; returns?: Type; typeParams?: TypeParams }
  | { kind: 'Spread'; expr: Expr };
export type JsxAttr = { kind: 'Attr'; name: string; value?: Expr | string } | { kind: 'Spread'; expr: Expr };
export type JsxChild = { kind: 'Text'; value: string } | { kind: 'Expr'; expr: Expr | null } | { kind: 'Jsx'; node: Extract<Expr, { kind: 'Jsx' }> };

export interface Program { body: Stmt[]; usesJsx: boolean; helpers: Set<string> }
