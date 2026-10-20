// Minimal Vey compiler adapter for the existing CommonJS catalog runtime.
import { readFileSync, writeFileSync } from 'node:fs';
import { compile } from '../vey/compile.ts';
for (const [name, factory] of [['steady-polo', 'makeSteadyPolo'], ['anchor-cardigan', 'makeAnchorCardigan'], ['stillwater-crewneck', 'makeStillwaterCrewneck'], ['resolve-polo', 'makeResolvePolo'], ['interval-quarterzip', 'makeIntervalQuarterZip'], ['fieldwork-cargos', 'makeFieldworkCargos'], ['contour-chinos', 'makeContourChinos'], ['offhours-denim', 'makeOffhoursDenim'], ['constant-fleece', 'makeConstantFleece'], ['stillhours-sweatpants', 'makeStillhoursSweatpants']]) {
  const source = new URL(`./${name}.vey`, import.meta.url);
  const result = compile(readFileSync(source, 'utf8'), { file: source.pathname, target: 'js' });
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  writeFileSync(new URL(`./${name}.cjs`, import.meta.url), `// Generated from ${name}.vey; do not edit directly.\n` + result.code.replace('export function', 'function') + `\nmodule.exports = { ${factory} };\n`);
}
