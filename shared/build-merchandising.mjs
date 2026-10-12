// Compiler adapter: application logic lives in merchandising.vey.
import { readFileSync, writeFileSync } from 'node:fs';
import { compile } from '../backend/vey/compile.ts';
const source = new URL('./merchandising.vey', import.meta.url);
const result = compile(readFileSync(source, 'utf8'), { file: source.pathname, target: 'js' });
if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
writeFileSync(new URL('./merchandising.js', import.meta.url), '// Generated from merchandising.vey. Do not edit directly.\n' + result.code.replace('export function', 'function'));
