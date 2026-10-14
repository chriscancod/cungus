// Minimal compiler adapter; the team-page UI is authored in Vey.
import { readFileSync, writeFileSync } from 'node:fs';
import { compile } from '../backend/vey/compile.ts';
const source = new URL('./robotics.vey', import.meta.url);
const result = compile(readFileSync(source, 'utf8'), { file: source.pathname, target: 'js' });
if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
writeFileSync(new URL('./robotics.js', import.meta.url), '// Generated from robotics.vey; do not edit directly.\n' + result.code);
