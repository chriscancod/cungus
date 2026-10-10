// Node loader for .vey files: `node --import ./lang/register.ts app.vey`.
// Compiles on the fly, resolves extensionless and "vey/runtime" imports.
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { compile } from './compile.ts';

const here = dirname(fileURLToPath(import.meta.url));
const RUNTIME = pathToFileURL(join(here, 'runtime.ts')).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'vey/runtime') return { url: RUNTIME, shortCircuit: true };
    try { return nextResolve(specifier, context); }
    catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) && context.parentURL) {
        const base = fileURLToPath(new URL(specifier, context.parentURL));
        for (const ext of ['.vey', '.ts', '.tsx', '.js', '.mjs', '/index.vey', '/index.ts']) if (existsSync(base + ext)) return { url: pathToFileURL(base + ext).href, shortCircuit: true };
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (!url.endsWith('.vey')) return nextLoad(url, context);
    const file = fileURLToPath(url);
    const r = compile(readFileSync(file, 'utf8'), { file, target: 'js' });
    if (!r.ok) { const d = r.diagnostics[0]; throw new SyntaxError(`${file}:${d.line}:${d.col}: ${d.message}`); }
    return { format: 'module', source: r.code, shortCircuit: true };
  },
});
