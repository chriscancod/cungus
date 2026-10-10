import { Parser } from './parser.ts';
import { Emitter, type EmitOptions } from './emit.ts';
import { VeyError } from './lexer.ts';

export interface CompileOptions extends EmitOptions { file?: string }
export interface Diagnostic { message: string; line: number; col: number; file: string }
export type CompileResult = { ok: true; code: string; usesJsx: boolean } | { ok: false; diagnostics: Diagnostic[] };

/** Compiles Vey source to JavaScript (default) or TypeScript. Never throws for syntax errors; returns diagnostics. */
export function compile(source: string, options: CompileOptions = {}): CompileResult {
  const file = options.file ?? '<vey>';
  try {
    const program = new Parser(source, file).parseProgram();
    const code = new Emitter(program, options).emit();
    return { ok: true, code, usesJsx: program.usesJsx };
  } catch (err) {
    if (err instanceof VeyError) return { ok: false, diagnostics: [{ message: err.message, line: err.line, col: err.col, file }] };
    throw err;
  }
}

/** Like compile() but throws a VeyError with the first diagnostic. */
export function compileOrThrow(source: string, options: CompileOptions = {}): string {
  const r = compile(source, options);
  if (r.ok) return r.code;
  const d = r.diagnostics[0];
  throw new VeyError(d.message, d.line, d.col, d.file);
}

export { VeyError };
