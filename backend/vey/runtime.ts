// Vey runtime: the handful of helpers compiled code can import. Everything
// else in Vey is plain JavaScript, so there is nothing to ship besides this.
/** Shared validation for materialized ranges and compiler-emitted counting loops. */
export const __rangeStep = (from: number, to: number, step: number): number => {
  if (![from, to, step].every(Number.isFinite)) throw new RangeError('range bounds and step must be finite numbers');
  if (step === 0) throw new RangeError('range step cannot be 0');
  return step;
};
export const __rangeNext = (value: number, step: number): number => {
  const next = value + step;
  if (next === value) throw new RangeError('range step is too small to advance at this magnitude');
  return next;
};
export const __range = (from: number, to: number, step = 1, inclusive = false): number[] => {
  __rangeStep(from, to, step);
  const out: number[] = [];
  for (let i = from; step > 0 ? (inclusive ? i <= to : i < to) : (inclusive ? i >= to : i > to); i = __rangeNext(i, step)) out.push(i);
  return out;
};
export const __in = (item: unknown, container: unknown): boolean => {
  if (container == null) return false;
  if (typeof container === 'string') return container.includes(String(item));
  if (Array.isArray(container)) return container.includes(item);
  if (container instanceof Set || container instanceof Map) return container.has(item);
  if (typeof (container as { has?: unknown }).has === 'function') return (container as { has: (x: unknown) => boolean }).has(item);
  if (typeof (container as { includes?: unknown }).includes === 'function') return (container as { includes: (x: unknown) => boolean }).includes(item);
  return (item as PropertyKey) in (container as object);
};
/** `for a, b in x`: iterables yield their elements (each destructured), Maps their entries, plain objects their [key, value] pairs. */
export function __pairs<T>(it: Iterable<T>): T[];
export function __pairs<T>(it: Record<string, T>): [string, T][];
export function __pairs(it: unknown): unknown[];
export function __pairs(it: unknown): unknown[] {
  if (it == null) return [];
  if (it instanceof Map) return [...it.entries()];
  if (typeof it === 'string' || typeof (it as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function') return [...(it as Iterable<unknown>)];
  return Object.entries(it as object);
}
export const __comp = <T, R>(it: Iterable<T> | Record<string, T>, cond: ((x: T) => boolean) | null, map: (x: T) => R, flat: boolean): R[] => {
  const items = it && typeof (it as Iterable<T>)[Symbol.iterator] === 'function' ? [...(it as Iterable<T>)] : Object.keys(it as object) as unknown as T[];
  const picked = cond ? items.filter(cond) : items;
  return flat ? picked.flatMap(x => map(x) as unknown as R[]) : picked.map(map);
};
const sheets = new Map<string, HTMLStyleElement>();
/** Injects a stylesheet once (per name or content) and returns the CSS text. */
export const __css = (css: string, name?: string): string => {
  const key = name ?? css;
  if (typeof document !== 'undefined' && !sheets.has(key)) {
    const el = document.createElement('style');
    if (name) el.dataset.vey = name;
    el.textContent = css;
    document.head.appendChild(el);
    sheets.set(key, el);
  }
  return css;
};
export const print = (...args: unknown[]) => { console.log(...args); };
export function assert(cond: unknown, message = 'Assertion failed'): asserts cond { if (!cond) throw new Error(message); }
export const len = (x: unknown): number => {
  if (x == null) return 0;
  if (typeof x === 'string' || Array.isArray(x)) return x.length;
  if (x instanceof Map || x instanceof Set) return x.size;
  if (typeof (x as { length?: unknown }).length === 'number') return (x as { length: number }).length;
  return Object.keys(x as object).length;
};
export const str = (x: unknown): string => typeof x === 'string' ? x : x == null ? '' : typeof x === 'object' ? (x instanceof Date ? x.toISOString() : JSON.stringify(x)) : String(x);
export const int = (x: unknown): number => { const n = typeof x === 'number' ? x : parseInt(String(x), 10); return Number.isFinite(n) ? Math.trunc(n) : 0; };
export const float = (x: unknown): number => { const n = typeof x === 'number' ? x : parseFloat(String(x)); return Number.isFinite(n) ? n : 0; };
export const bool = (x: unknown): boolean => Array.isArray(x) ? x.length > 0 : x instanceof Map || x instanceof Set ? x.size > 0 : !!x;
export const keys = (o: object): string[] => Object.keys(o);
export const values = <T>(o: Record<string, T>): T[] => Object.values(o);
export const entries = <T>(o: Record<string, T>): [string, T][] => Object.entries(o);
export const range = __range;
export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
export const type_of = (x: unknown): string => x === null ? 'null' : Array.isArray(x) ? 'array' : x instanceof Date ? 'date' : x instanceof RegExp ? 'regex' : x instanceof Map ? 'map' : x instanceof Set ? 'set' : typeof x;
export const sum = (xs: Iterable<number>): number => { let n = 0; for (const x of xs) n += x; return n; };
export const min = (xs: Iterable<number>): number => Math.min(...xs);
export const max = (xs: Iterable<number>): number => Math.max(...xs);
export const sorted = <T>(xs: Iterable<T>, key?: (x: T) => number | string, reverse = false): T[] => {
  const out = [...xs].sort((a, b) => { const ka = key ? key(a) : (a as unknown as number), kb = key ? key(b) : (b as unknown as number); return ka < kb ? -1 : ka > kb ? 1 : 0; });
  return reverse ? out.reverse() : out;
};
export const reversed = <T>(xs: Iterable<T>): T[] => [...xs].reverse();
export const enumerate = <T>(xs: Iterable<T>): [number, T][] => [...xs].map((x, i) => [i, x]);
export const zip = <A, B>(a: Iterable<A>, b: Iterable<B>): [A, B][] => { const bs = [...b]; return [...a].slice(0, bs.length).map((x, i) => [x, bs[i]]); };
export const unique = <T>(xs: Iterable<T>): T[] => [...new Set(xs)];
export const chunk = <T>(xs: T[], size: number): T[][] => { if (!Number.isSafeInteger(size) || size <= 0) throw new RangeError('chunk size must be a positive safe integer'); const out: T[][] = []; for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size)); return out; };
export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
// Node-only helpers. The module names are built at runtime so browser bundlers leave them alone.
const nodeModule = (name: string) => import(/* @vite-ignore */ `node:${name}`);
export const input = async (prompt = ''): Promise<string> => {
  if (typeof window !== 'undefined' && typeof window.prompt === 'function') return window.prompt(prompt) ?? '';
  const { createInterface } = await nodeModule('readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return await rl.question(prompt); } finally { rl.close(); }
};
export const read_file = async (path: string): Promise<string> => { const { readFile } = await nodeModule('fs/promises'); return readFile(path, 'utf8'); };
export const write_file = async (path: string, text: string): Promise<void> => { const { writeFile } = await nodeModule('fs/promises'); await writeFile(path, text); };
export const json = { parse: (s: string): unknown => JSON.parse(s), stringify: (v: unknown, pretty = false): string => JSON.stringify(v, null, pretty ? 2 : 0) };
