/**
 * Random `'use gpu'` program generators for the shader generator fuzz test.
 *
 * Every generator returns the body of a function `(tgpu, d, std) => { ...; return [items] }`
 * as source text, which is then run through the TypeGPU Babel plugin and resolved.
 */

export class Rng {
  #state: number;

  constructor(seed: number) {
    this.#state = seed >>> 0;
  }

  /** mulberry32 */
  next(): number {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0;
    let t = this.#state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  }

  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)] as T;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }
}

export interface Program {
  generator: string;
  /** Short description of the program's shape, used to match known failures. */
  shape: Record<string, string>;
  source: string;
}

const indent = (lines: string | string[]): string =>
  [lines]
    .flat()
    .flatMap((l) => l.split('\n'))
    .map((l) => `  ${l}`)
    .join('\n');

// ---------------------------------------------------------------------------------------------
// Operators: every binary operator with any pair of operand types, where each operand is a
// parameter, a constructor call, a `let` or a `const`, and the expression appears in one of
// several positions (initializer, assignment, argument, return value, condition, ...).
// ---------------------------------------------------------------------------------------------

interface OperandType {
  schema: string | null;
  ctor: string;
}

const opScalars: Record<string, OperandType> = {
  f32: { schema: 'd.f32', ctor: 'd.f32(1.5)' },
  f16: { schema: 'd.f16', ctor: 'd.f16(1.5)' },
  i32: { schema: 'd.i32', ctor: 'd.i32(3)' },
  u32: { schema: 'd.u32', ctor: 'd.u32(5)' },
  bool: { schema: 'd.bool', ctor: 'true' },
  abstractInt: { schema: null, ctor: '2' },
  abstractFloat: { schema: null, ctor: '2.5' },
};

const opTypes: Record<string, OperandType> = { ...opScalars };
const componentValues: Record<string, string[]> = {
  f: ['1.5', '2.5', '3.5', '4.5'],
  h: ['1.5', '2.5', '3.5', '4.5'],
  i: ['1', '-2', '3', '4'],
  u: ['1', '2', '3', '4'],
  b: ['true', 'false', 'true', 'false'],
};
for (const n of [2, 3, 4]) {
  for (const [k, values] of Object.entries(componentValues)) {
    opTypes[`vec${n}${k}`] = {
      schema: `d.vec${n}${k}`,
      ctor: `d.vec${n}${k}(${values.slice(0, n).join(', ')})`,
    };
  }
  const matValues = Array.from({ length: n * n }, (_, i) => `${i + 1}`).join(', ');
  opTypes[`mat${n}x${n}f`] = { schema: `d.mat${n}x${n}f`, ctor: `d.mat${n}x${n}f(${matValues})` };
}

const binaryOps = [
  '+',
  '-',
  '*',
  '/',
  '%',
  '<',
  '<=',
  '>',
  '>=',
  '===',
  '!==',
  '&',
  '|',
  '^',
  '<<',
  '>>',
  '&&',
  '||',
  '**',
];
const compoundableOps = new Set(['+', '-', '*', '/', '%', '&', '|', '^', '<<', '>>']);
const operandOrigins = ['param', 'ctor', 'let', 'const'];
const opPositions = [
  'init',
  'assign',
  'compound',
  'arg',
  'ret',
  'cond',
  'index',
  'struct',
  'ternary',
  'logical',
];

function operand(typeName: string, origin: string, name: string) {
  const t = opTypes[typeName] as OperandType;
  if (!t.schema || origin === 'ctor') {
    return { decl: '', expr: t.ctor, param: null };
  }
  if (origin === 'param') {
    return { decl: '', expr: name, param: t.schema };
  }
  const kw = origin === 'let' ? 'let' : 'const';
  return { decl: `${kw} ${name}V = ${t.ctor};\n`, expr: `${name}V`, param: null };
}

export function generateOperator(rng: Rng): Program | null {
  const typeNames = Object.keys(opTypes);
  const op = rng.pick(binaryOps);
  const lt = rng.pick(typeNames);
  const r = rng.next();
  // bias the right-hand side towards types that are compatible with the left-hand side
  const rt = r < 0.35 ? lt : r < 0.6 ? rng.pick(Object.keys(opScalars)) : rng.pick(typeNames);
  const lo = rng.pick(operandOrigins);
  const ro = rng.pick(operandOrigins);
  const pos = rng.pick(opPositions);

  const L = operand(lt, lo, 'a');
  const R = operand(rt, ro, 'b');
  const params: string[] = [];
  const names: string[] = [];
  if (L.param) {
    params.push(L.param);
    names.push('a');
  }
  if (R.param) {
    params.push(R.param);
    names.push('b');
  }
  const E = `(${L.expr} ${op} ${R.expr})`;
  let body = L.decl + R.decl;
  let pre = '';
  switch (pos) {
    case 'init':
      body += `const r = ${E};\nlet s = r;\n`;
      break;
    case 'assign':
      body += `let r = ${E};\nr = ${E};\n`;
      break;
    case 'compound': {
      const schema = opTypes[lt]?.schema;
      if (!compoundableOps.has(op) || lo === 'ctor' || !schema) {
        return null;
      }
      body += `let r = ${schema}(${L.expr});\nr ${op}= ${R.expr};\n`;
      break;
    }
    case 'arg':
      pre = `const ident = (x) => {\n  'use gpu';\n  return x;\n};\n`;
      body += `const r = ident(${E});\n`;
      break;
    case 'ret':
      pre = `const g = (${names.join(', ')}) => {\n  'use gpu';\n${indent(body.trimEnd() || '//')}\n  return ${E};\n};\n`;
      body = `const r = g(${names.join(', ')});\n`;
      break;
    case 'cond':
      body += `let r = 0;\nif (${E}) {\n  r = 1;\n}\n`;
      break;
    case 'index':
      body += `const arr = d.arrayOf(d.f32, 8)([1, 2, 3, 4, 5, 6, 7, 8]);\nconst r = arr[${E}];\n`;
      break;
    case 'struct':
      pre = `const S = d.struct({ f: ${opTypes[lt]?.schema ?? 'd.f32'} });\n`;
      body += `const r = S({ f: ${E} });\n`;
      break;
    case 'ternary':
      body += `const c = d.bool(true);\nconst r = c ? ${E} : ${L.expr};\n`;
      break;
    case 'logical':
      body += `const c = d.bool(true);\nconst r = c && ${E};\n`;
      break;
  }
  const source = `${pre}const f = tgpu.fn([${params.join(', ')}])((${names.join(', ')}) => {\n${indent(body.trimEnd())}\n});\nreturn [f];`;
  return { generator: 'operator', shape: { op, lt, rt, lo, ro, pos }, source };
}

const wgslTypeNames: Record<string, string> = {
  f: 'f32',
  h: 'f16',
  i: 'i32',
  u: 'u32',
  b: 'bool',
};

function wgslType(typeName: string): string | null {
  if (typeName.startsWith('abstract')) {
    return null;
  }
  const vec = /^vec(\d)([fhiub])$/.exec(typeName);
  if (vec) {
    return `vec${vec[1]}<${wgslTypeNames[vec[2] as string]}>`;
  }
  const mat = /^mat(\d)x(\d)f$/.exec(typeName);
  return mat ? `mat${mat[1]}x${mat[2]}<f32>` : typeName;
}

const scalarPreference = ['f32', 'f16', 'i32', 'u32', 'bool'];

/**
 * The type TypeGPU converts both operands of a binary operator to, or `undefined` when it
 * leaves them as they are. Mirrors `getBestConversion`: abstract integers convert to any
 * numeric scalar, abstract floats to `f32` and `f16` (and to `f32` next to `i32` or `u32`),
 * concrete scalars (`bool` included) are cast to the most preferred one of the two, and
 * vectors and matrices only match their own type.
 */
export function operandCommonType(lt: string, rt: string): string | undefined {
  if (lt === rt) {
    return lt;
  }
  const la = lt.startsWith('abstract');
  const ra = rt.startsWith('abstract');
  if (la && ra) {
    return 'abstractFloat';
  }
  const [abstract, other] = la ? [lt, rt] : ra ? [rt, lt] : [null, null];
  if (abstract && other) {
    if (!scalarPreference.includes(other) || other === 'bool') {
      return undefined;
    }
    return abstract === 'abstractInt' || other.startsWith('f') ? other : 'f32';
  }
  if (scalarPreference.includes(lt) && scalarPreference.includes(rt)) {
    return scalarPreference[Math.min(scalarPreference.indexOf(lt), scalarPreference.indexOf(rt))];
  }
  return undefined;
}

/**
 * The operator program's operation written directly in WGSL, after the conversions TypeGPU is
 * expected to make. When it does not validate, WGSL has no overload for the operator and the
 * operand types, and TypeGPU should have rejected the program.
 */
export function operatorReference({ op, lt, rt, pos }: Record<string, string>): string {
  const shift = op === '<<' || op === '>>';
  let [lType, rType] = [lt as string, rt as string];
  if (shift) {
    if (operandCommonType('u32', rType) !== undefined && !rType.startsWith('vec')) {
      rType = lType.startsWith('vec') ? rType : 'u32';
    }
  } else {
    const common =
      pos === 'compound'
        ? operandCommonType(lType, rType) === lType
          ? lType
          : undefined
        : operandCommonType(lType, rType);
    if (common) {
      lType = lType.startsWith('abstract') && common.startsWith('abstract') ? lType : common;
      rType = rType.startsWith('abstract') && common.startsWith('abstract') ? rType : common;
    }
  }
  const params: string[] = [];
  const value = (typeName: string, original: string, name: string) => {
    const type = wgslType(typeName);
    if (!type) {
      return (opTypes[original] as OperandType).ctor;
    }
    params.push(`${name}: ${type}`);
    return name;
  };
  const A = value(lType, lt as string, 'a');
  const B = value(rType, rt as string, 'b');
  const wgslOp = op === '===' ? '==' : op === '!==' ? '!=' : op;
  const body =
    pos === 'compound'
      ? `var r = ${A};\n  r ${wgslOp}= ${B};`
      : `let r = ${op === '**' ? `pow(${A}, ${B})` : `(${A} ${wgslOp} ${B})`};`;
  return `enable f16;\nfn f(${params.join(', ')}) {\n  ${body}\n}\n`;
}

// ---------------------------------------------------------------------------------------------
// Conversions: a value of one type flowing into a slot of another type, at a call argument,
// return value, struct field, array element, assignment, or constructor argument.
// ---------------------------------------------------------------------------------------------

interface ConvType {
  schema: string | null;
  ctor: string;
  zero?: string;
}

const convTypes: Record<string, ConvType> = {
  f32: { schema: 'd.f32', ctor: 'd.f32(1.5)', zero: 'd.f32()' },
  f16: { schema: 'd.f16', ctor: 'd.f16(1.5)', zero: 'd.f16()' },
  i32: { schema: 'd.i32', ctor: 'd.i32(-3)', zero: 'd.i32()' },
  u32: { schema: 'd.u32', ctor: 'd.u32(7)', zero: 'd.u32()' },
  bool: { schema: 'd.bool', ctor: 'true', zero: 'd.bool()' },
  abstractInt: { schema: null, ctor: '3' },
  abstractFloat: { schema: null, ctor: '2.5' },
  abstractNeg: { schema: null, ctor: '-4' },
  vec2f: { schema: 'd.vec2f', ctor: 'd.vec2f(1, 2)', zero: 'd.vec2f()' },
  vec3f: { schema: 'd.vec3f', ctor: 'd.vec3f(1, 2, 3)', zero: 'd.vec3f()' },
  vec4f: { schema: 'd.vec4f', ctor: 'd.vec4f(1, 2, 3, 4)', zero: 'd.vec4f()' },
  vec3h: { schema: 'd.vec3h', ctor: 'd.vec3h(1, 2, 3)', zero: 'd.vec3h()' },
  vec3i: { schema: 'd.vec3i', ctor: 'd.vec3i(1, -2, 3)', zero: 'd.vec3i()' },
  vec3u: { schema: 'd.vec3u', ctor: 'd.vec3u(1, 2, 3)', zero: 'd.vec3u()' },
  vec3b: { schema: 'd.vec3b', ctor: 'd.vec3b(true, false, true)', zero: 'd.vec3b()' },
  mat2x2f: { schema: 'd.mat2x2f', ctor: 'd.mat2x2f(1, 2, 3, 4)', zero: 'd.mat2x2f()' },
  mat3x3f: {
    schema: 'd.mat3x3f',
    ctor: 'd.mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9)',
    zero: 'd.mat3x3f()',
  },
  S: { schema: 'S', ctor: 'S({ a: 1, b: d.vec2f(1, 2) })', zero: 'S()' },
  S2: { schema: 'S2', ctor: 'S2({ a: 1, b: d.vec2f(1, 2) })', zero: 'S2()' },
  arr4f: {
    schema: 'd.arrayOf(d.f32, 4)',
    ctor: 'd.arrayOf(d.f32, 4)([1, 2, 3, 4])',
    zero: 'd.arrayOf(d.f32, 4)()',
  },
  arr4i: {
    schema: 'd.arrayOf(d.i32, 4)',
    ctor: 'd.arrayOf(d.i32, 4)([1, 2, 3, 4])',
    zero: 'd.arrayOf(d.i32, 4)()',
  },
  arr3f: {
    schema: 'd.arrayOf(d.f32, 3)',
    ctor: 'd.arrayOf(d.f32, 3)([1, 2, 3])',
    zero: 'd.arrayOf(d.f32, 3)()',
  },
};
const convSites = [
  'argShelled',
  'argShellless',
  'return',
  'structField',
  'arrayElem',
  'assign',
  'ctorCall',
  'ctorArgs',
];
const scalarTypes = new Set(['f32', 'f16', 'i32', 'u32', 'bool']);

const numericScalars = new Set(['f32', 'f16', 'i32', 'u32']);
// `S` and `S2` have the same fields
const structTypes = new Set(['S', 'S2']);

/**
 * Whether TypeGPU is expected to turn a value of type `st` into `tt` at `site`, so that the
 * program is valid:
 * - the same type always converts;
 * - implicitly (arguments, return values, struct fields, array elements, assignments), abstract
 *   values convert to any numeric scalar (`-4` wraps to `4294967292u`), concrete scalars,
 *   `bool` included, are cast to each other, and a struct converts to another struct with the
 *   same fields; vectors, matrices and arrays only convert to their own type;
 * - an explicit constructor call `T(x)` (`ctorCall`, and `argShellless`, whose callee calls
 *   `T(x)`) also converts a vector to a vector of the same size, and a matrix to a matrix of the
 *   same size;
 * - a vector constructor with one argument per component (`ctorArgs`) converts scalars.
 */
export function conversionExpected({ tt, st, site }: Record<string, string>): boolean {
  const target = tt as string;
  const source = st as string;
  if (target === source) {
    return true;
  }
  const scalarConverts =
    (scalarTypes.has(source) && scalarTypes.has(target)) ||
    (numericScalars.has(target) && source.startsWith('abstract'));
  if (site === 'ctorArgs') {
    const component = { f: 'f32', h: 'f16', i: 'i32', u: 'u32', b: 'bool' }[
      target.at(-1) as string
    ];
    return conversionExpected({ tt: component as string, st: source, site: 'ctorCall' });
  }
  if (site === 'ctorCall' || site === 'argShellless') {
    const vec = (t: string) => /^vec(\d)/.exec(t)?.[1];
    const mat = (t: string) => /^mat(\d)x/.exec(t)?.[1];
    return (
      scalarConverts ||
      (vec(target) !== undefined && vec(target) === vec(source)) ||
      (mat(target) !== undefined && mat(target) === mat(source))
    );
  }
  return scalarConverts || (structTypes.has(source) && structTypes.has(target));
}

export function generateConversion(rng: Rng): Program | null {
  const tt = rng.pick(Object.keys(convTypes).filter((k) => convTypes[k]?.schema));
  const st = rng.pick(Object.keys(convTypes));
  const target = convTypes[tt] as ConvType & { schema: string };
  const source = convTypes[st] as ConvType;
  const origin = source.schema ? rng.pick(operandOrigins) : 'ctor';
  const site = rng.pick(convSites);
  const shape = { tt, st, origin, site };

  let decl = '';
  let e = source.ctor;
  const params: string[] = [];
  const names: string[] = [];
  if (source.schema && origin === 'param') {
    e = 'v';
    params.push(source.schema);
    names.push('v');
  } else if (source.schema && origin !== 'ctor') {
    decl = `${origin === 'let' ? 'let' : 'const'} v = ${source.ctor};\n`;
    e = 'v';
  }

  let pre = `const S = d.struct({ a: d.f32, b: d.vec2f });\nconst S2 = d.struct({ a: d.f32, b: d.vec2f });\n`;
  let body: string;
  switch (site) {
    case 'argShelled':
      pre += `const callee = tgpu.fn([${target.schema}], d.f32)((x) => {\n  return 1;\n});\n`;
      body = `const r = callee(${e});\n`;
      break;
    case 'argShellless':
      if (!scalarTypes.has(tt)) {
        return null;
      }
      pre += `const callee = (x) => {\n  'use gpu';\n  return ${target.schema}(x) + 1;\n};\n`;
      body = `const r = callee(${e});\n`;
      break;
    case 'return': {
      pre += `const g = tgpu.fn([${params.join(', ')}], ${target.schema})((${names.join(', ')}) => {\n${indent(`${decl}return ${e};`)}\n});\n`;
      const src = `${pre}const f = tgpu.fn([])(() => {\n  const r = g(${params.length ? source.ctor : ''});\n});\nreturn [f];`;
      return { generator: 'conversion', shape, source: src };
    }
    case 'structField':
      pre += `const W = d.struct({ f: ${target.schema} });\n`;
      body = `const r = W({ f: ${e} });\n`;
      break;
    case 'arrayElem':
      body = `const r = d.arrayOf(${target.schema}, 2)([${e}, ${e}]);\n`;
      break;
    case 'assign': {
      const needsCopy = !scalarTypes.has(st) && source.schema && origin !== 'ctor';
      body = `let r = ${target.zero};\nr = ${needsCopy ? `std.copy(${e})` : e};\n`;
      break;
    }
    case 'ctorCall':
      body = `const r = ${target.schema}(${e});\n`;
      break;
    default: {
      const n = /^vec(\d)/.exec(tt)?.[1];
      if (!n) {
        return null;
      }
      body = `const r = ${target.schema}(${Array.from({ length: Number(n) }, () => e).join(', ')});\n`;
    }
  }
  const src = `${pre}const f = tgpu.fn([${params.join(', ')}])((${names.join(', ')}) => {\n${indent(`${decl}${body}`.trimEnd())}\n});\nreturn [f];`;
  return { generator: 'conversion', shape, source: src };
}

// ---------------------------------------------------------------------------------------------
// Statements: random well-typed programs with control flow, structs, arrays, references,
// swizzles, shadowing, helper functions and slots. They respect TypeGPU's copy/reference
// rules, so they are all meant to be valid TypeGPU input.
// ---------------------------------------------------------------------------------------------

const S_SCALARS = ['f32', 'i32', 'u32', 'bool'];
const S_ALL = [...S_SCALARS, 'vec2f', 'vec3f', 'vec4f', 'vec2i', 'vec3u', 'S', 'A'];
const sSchema: Record<string, string> = {
  f32: 'd.f32',
  i32: 'd.i32',
  u32: 'd.u32',
  bool: 'd.bool',
  vec2f: 'd.vec2f',
  vec3f: 'd.vec3f',
  vec4f: 'd.vec4f',
  vec2i: 'd.vec2i',
  vec3u: 'd.vec3u',
  S: 'S',
  A: 'A',
};
const components: Record<string, string[]> = {
  vec2f: ['x', 'y'],
  vec3f: ['x', 'y', 'z'],
  vec4f: ['x', 'y', 'z', 'w'],
  vec2i: ['x', 'y'],
  vec3u: ['x', 'y', 'z'],
};
const componentType: Record<string, string> = {
  vec2f: 'f32',
  vec3f: 'f32',
  vec4f: 'f32',
  vec2i: 'i32',
  vec3u: 'u32',
};
const vecOf: Record<string, Record<number, string>> = {
  f32: { 2: 'vec2f', 3: 'vec3f', 4: 'vec4f' },
  i32: { 2: 'vec2i' },
  u32: { 3: 'vec3u' },
};
const NAMES = ['a', 'b', 'c', 'e', 'g', 'h', 'k', 'm', 'q', 'tmp', 'value', 'i', 'j', 'result'];

interface Var {
  type: string;
  mut: boolean;
}

class Scope {
  readonly vars = new Map<string, Var>();
  readonly parent: Scope | null;

  constructor(parent: Scope | null) {
    this.parent = parent;
  }

  all(): Map<string, Var> {
    const m = this.parent ? this.parent.all() : new Map<string, Var>();
    for (const [k, v] of this.vars) {
      m.set(k, v);
    }
    return m;
  }
}

interface Ctx {
  ret: string;
  loop: boolean;
}

interface Helper {
  name: string;
  params: string[];
  ret: string;
}

export function generateStatements(rng: Rng): Program {
  const helpers: Helper[] = [];
  let tmpCount = 0;
  const useSlot = rng.chance(0.3);

  const varsOf = (scope: Scope, type: string, pred: (v: Var) => boolean = () => true) =>
    [...scope.all().entries()].filter(([, v]) => v.type === type && pred(v)).map(([k]) => k);

  function literal(type: string): string {
    switch (type) {
      case 'f32':
        return rng.pick(['1.5', '0.25', 'd.f32(2)', '-3.5', 'd.f32(0.5)', '100.0']);
      case 'i32':
        return rng.pick(['3', 'd.i32(-2)', '0', 'd.i32(7)', '-1']);
      case 'u32':
        return rng.pick(['d.u32(3)', 'd.u32(0)', 'd.u32(17)']);
      default:
        return rng.pick(['true', 'false', 'd.bool(true)']);
    }
  }

  function construct(type: string, scope: Scope, depth: number): string {
    const E = (t: string) => (depth > 0 ? expr(t, scope, depth - 1).code : construct(t, scope, 0));
    switch (type) {
      case 'vec2f':
        return rng.pick([`d.vec2f(${E('f32')}, ${E('f32')})`, 'd.vec2f()', 'd.vec2f(1, 2)']);
      case 'vec3f':
        return rng.pick([
          `d.vec3f(${E('f32')}, ${E('f32')}, ${E('f32')})`,
          'd.vec3f()',
          'd.vec3f(0.5)',
        ]);
      case 'vec4f':
        return rng.pick([`d.vec4f(${E('f32')}, 1, 2, 3)`, 'd.vec4f()']);
      case 'vec2i':
        return rng.pick([`d.vec2i(${E('i32')}, 2)`, 'd.vec2i()']);
      case 'vec3u':
        return rng.pick([`d.vec3u(${E('u32')}, 1, 2)`, 'd.vec3u()']);
      case 'S':
        return `S({ a: ${E('f32')}, v: d.vec3f(1, 2, 3), n: ${E('i32')} })`;
      case 'A':
        return `A([1, 2, ${E('f32')}, 4])`;
      default:
        return literal(type);
    }
  }

  /** `lv` is true when the expression is a variable (or a member path of one), i.e. a reference. */
  function expr(type: string, scope: Scope, depth: number): { code: string; lv: boolean } {
    const vs = varsOf(scope, type);
    if (depth <= 0 || rng.chance(0.25)) {
      if (vs.length && rng.chance(0.6)) {
        return { code: rng.pick(vs), lv: true };
      }
      return { code: construct(type, scope, 0), lv: false };
    }
    const E = (t: string) => expr(t, scope, depth - 1).code;
    const options: (() => string)[] = [];
    switch (type) {
      case 'f32':
        options.push(
          () => `(${E('f32')} + ${E('f32')})`,
          () => `(${E('f32')} * ${E('f32')})`,
          () => `(${E('f32')} - ${E('f32')})`,
          () => `(${E('f32')} / ${rng.pick(['2.0', 'd.f32(4)', '1.5'])})`,
          () => `std.sin(${E('f32')})`,
          () => `std.max(${E('f32')}, ${E('f32')})`,
          () => `std.clamp(${E('f32')}, 0, 1)`,
          () => `d.f32(${E('i32')})`,
          () => `d.f32(${E('u32')})`,
          () => `std.dot(${E('vec3f')}, ${E('vec3f')})`,
          () => `std.length(${E('vec2f')})`,
          () => `${E('vec3f')}.${rng.pick(components.vec3f as string[])}`,
          () => `${E('vec4f')}.${rng.pick(components.vec4f as string[])}`,
          () => `${E('S')}.a`,
          () => `${E('A')}[${rng.pick(['0', '3', 'd.u32(1)', `(${E('u32')} % 4)`])}]`,
          () => `std.select(${E('f32')}, ${E('f32')}, ${E('bool')})`,
          () => `(- ${E('f32')})`,
          () => `(${rng.pick(['true', 'false'])} ? ${E('f32')} : ${E('f32')})`,
          () => `std.abs(${E('f32')})`,
          () => `std.fract(${E('f32')})`,
        );
        if (helpers.some((h) => h.ret === 'f32')) {
          options.push(() => callHelper('f32', scope, depth - 1));
        }
        if (useSlot) {
          options.push(
            () => `slotF.$`,
            () => `(${E('f32')} * slotF.$)`,
          );
        }
        break;
      case 'i32':
        options.push(
          () => `(${E('i32')} + ${E('i32')})`,
          () => `(${E('i32')} - ${E('i32')})`,
          () => `(${E('i32')} * ${E('i32')})`,
          () => `d.i32(${E('f32')})`,
          () => `std.abs(${E('i32')})`,
          () => `${E('vec2i')}.${rng.pick(['x', 'y'])}`,
          () => `${E('S')}.n`,
          () => `std.min(${E('i32')}, ${E('i32')})`,
          () => `(${E('i32')} & ${E('i32')})`,
          () => `(${E('i32')} | ${E('i32')})`,
          () => `(${E('i32')} ^ ${E('i32')})`,
          () => `(${E('i32')} << d.u32(${rng.int(5)}))`,
          () => `(${E('i32')} >> d.u32(${rng.int(5)}))`,
          () => `d.i32(${E('u32')})`,
          () => `(- ${E('i32')})`,
          () => `std.select(${E('i32')}, ${E('i32')}, ${E('bool')})`,
        );
        break;
      case 'u32':
        options.push(
          () => `(${E('u32')} + ${E('u32')})`,
          () => `(${E('u32')} * ${E('u32')})`,
          () => `(${E('u32')} & ${E('u32')})`,
          () => `(${E('u32')} >>> d.u32(${rng.int(5)}))`,
          () => `d.u32(${E('i32')})`,
          () => `std.countOneBits(${E('u32')})`,
          () => `${E('vec3u')}.${rng.pick(['x', 'y', 'z'])}`,
          () => `std.max(${E('u32')}, d.u32(1))`,
        );
        break;
      case 'bool':
        options.push(
          () => `(${E('f32')} < ${E('f32')})`,
          () => `(${E('i32')} >= ${E('i32')})`,
          () => `(${E('u32')} === ${E('u32')})`,
          () => `(${E('i32')} !== ${E('i32')})`,
          () => `!${E('bool')}`,
          () => `(${E('bool')} && ${E('bool')})`,
          () => `(${E('bool')} || ${E('bool')})`,
          () => `std.all(std.lt(${E('vec2f')}, ${E('vec2f')}))`,
          () => `std.any(std.ge(${E('vec3f')}, ${E('vec3f')}))`,
          () => `(${E('bool')} === ${E('bool')})`,
        );
        break;
      case 'vec2f':
        options.push(
          () => `d.vec2f(${E('f32')}, ${E('f32')})`,
          () => `${E('vec3f')}.${rng.pick(['xy', 'zx', 'yy'])}`,
          () => `${E('vec2f')}.yx`,
          () => `(${E('vec2f')} + ${E('vec2f')})`,
          () => `(${E('vec2f')} * ${E('f32')})`,
          () => `(${E('f32')} * ${E('vec2f')})`,
          () => `std.normalize(${E('vec2f')})`,
          () => `d.vec2f(${E('vec2i')})`,
          () => `${E('vec4f')}.zw`,
          () => `std.mix(${E('vec2f')}, ${E('vec2f')}, ${E('f32')})`,
        );
        break;
      case 'vec3f':
        options.push(
          () => `d.vec3f(${E('f32')}, ${E('f32')}, ${E('f32')})`,
          () => `d.vec3f(${E('f32')})`,
          () => `d.vec3f(${E('vec2f')}, ${E('f32')})`,
          () => `(${E('vec3f')} + ${E('vec3f')})`,
          () => `(${E('vec3f')} - ${E('vec3f')})`,
          () => `(${E('vec3f')} * ${E('f32')})`,
          () => `std.cross(${E('vec3f')}, ${E('vec3f')})`,
          () => `${E('vec4f')}.xyz`,
          () => `${E('vec3f')}.zyx`,
          () => `${E('S')}.v`,
          () => `std.select(${E('vec3f')}, ${E('vec3f')}, ${E('bool')})`,
          () => `(- ${E('vec3f')})`,
          () => `d.vec3f(${E('vec3u')})`,
          () => `${E('vec3f')}.mul(${E('f32')})`,
          () => `std.abs(${E('vec3f')})`,
        );
        break;
      case 'vec4f':
        options.push(
          () => `d.vec4f(${E('vec3f')}, ${E('f32')})`,
          () => `d.vec4f(${E('vec2f')}, ${E('vec2f')})`,
          () => `(${E('vec4f')} * ${E('vec4f')})`,
          () => `${E('vec3f')}.xyzx`,
          () => `d.vec4f(${E('f32')})`,
          () => `(${E('vec4f')} / ${E('f32')})`,
        );
        break;
      case 'vec2i':
        options.push(
          () => `d.vec2i(${E('i32')}, ${E('i32')})`,
          () => `(${E('vec2i')} + ${E('vec2i')})`,
          () => `(${E('vec2i')} * ${E('i32')})`,
          () => `d.vec2i(${E('vec2f')})`,
          () => `${E('vec2i')}.yx`,
        );
        break;
      case 'vec3u':
        options.push(
          () => `d.vec3u(${E('u32')}, ${E('u32')}, ${E('u32')})`,
          () => `(${E('vec3u')} & ${E('vec3u')})`,
          () => `(${E('vec3u')} + ${E('vec3u')})`,
          () => `d.vec3u(${E('u32')})`,
        );
        break;
      case 'S':
        options.push(() => `S({ a: ${E('f32')}, v: ${E('vec3f')}, n: ${E('i32')} })`);
        break;
      case 'A':
        options.push(() => `A([${E('f32')}, ${E('f32')}, ${E('f32')}, ${E('f32')}])`);
        break;
    }
    if (vs.length && rng.chance(0.3)) {
      return { code: rng.pick(vs), lv: true };
    }
    const code = rng.pick(options)();
    return {
      code,
      lv: /^[a-z_0-9]+(\.[a-z]+|\[[^\]]+\])*$/i.test(code) && !code.startsWith('d.'),
    };
  }

  function copyIfRef(type: string, e: { code: string; lv: boolean }): string {
    if (!e.lv || S_SCALARS.includes(type)) {
      return e.code;
    }
    return rng.pick([`std.copy(${e.code})`, `${sSchema[type]}(${e.code})`]);
  }

  function callHelper(ret: string, scope: Scope, depth: number): string {
    const h = rng.pick(helpers.filter((x) => x.ret === ret));
    return `${h.name}(${h.params.map((t) => expr(t, scope, depth).code).join(', ')})`;
  }

  function freshName(scope: Scope, allowShadow: boolean): string {
    const visible = scope.all();
    for (let t = 0; t < 20; t++) {
      const n = rng.pick(NAMES);
      if (scope.vars.has(n) || (visible.has(n) && !allowShadow)) {
        continue;
      }
      return n;
    }
    return `v${tmpCount++}`;
  }

  function stmts(scope: Scope, depth: number, ctx: Ctx, n: number): string[] {
    return Array.from({ length: n }, () => stmt(scope, depth, ctx));
  }

  function block(scope: Scope, depth: number, ctx: Ctx, n: number): string[] {
    return stmts(new Scope(scope), depth, ctx, n);
  }

  function assignment(scope: Scope): string | null {
    const lets = [...scope.all().entries()].filter(([, v]) => v.mut);
    if (!lets.length) {
      return null;
    }
    const [name, { type: t }] = rng.pick(lets);
    const k = rng.next();
    const comps = components[t];
    if (comps && k < 0.3) {
      const ct = componentType[t] as string;
      const sw = rng.pick(comps.length === 2 ? ['x', 'y', 'yx'] : ['x', 'z', 'xy', 'zy']);
      const st = sw.length === 1 ? ct : vecOf[ct]?.[sw.length];
      if (!st) {
        return `${name}.x = ${expr(ct, scope, 1).code};`;
      }
      return `${name}.${sw} ${rng.chance(0.3) ? '+=' : '='} ${copyIfRef(st, expr(st, scope, 1))};`;
    }
    if (t === 'S' && k < 0.5) {
      return rng.pick([
        `${name}.a ${rng.pick(['=', '+=', '*='])} ${expr('f32', scope, 1).code};`,
        `${name}.v = ${copyIfRef('vec3f', expr('vec3f', scope, 1))};`,
        `${name}.v.y = ${expr('f32', scope, 1).code};`,
        `${name}.n += 1;`,
      ]);
    }
    if (t === 'A' && k < 0.5) {
      const index = rng.pick(['0', '2', `d.u32(${rng.int(4)})`]);
      return `${name}[${index}] ${rng.pick(['=', '+='])} ${expr('f32', scope, 1).code};`;
    }
    if ((t === 'i32' || t === 'u32') && k < 0.6) {
      return rng.pick([
        `${name}++;`,
        `${name}--;`,
        `${name} += ${expr(t, scope, 1).code};`,
        `${name} <<= d.u32(1);`,
        `${name} |= ${expr(t, scope, 1).code};`,
      ]);
    }
    if (t === 'f32' && k < 0.6) {
      return `${name} ${rng.pick(['+=', '-=', '*=', '/='])} ${expr('f32', scope, 1).code};`;
    }
    if (['vec2f', 'vec3f', 'vec4f'].includes(t) && k < 0.6) {
      const rhs = rng.chance(0.5) ? expr('f32', scope, 1).code : copyIfRef(t, expr(t, scope, 1));
      return `${name} ${rng.pick(['+=', '*=', '-='])} ${rhs};`;
    }
    return `${name} = ${copyIfRef(t, expr(t, scope, 2))};`;
  }

  function stmt(scope: Scope, depth: number, ctx: Ctx): string {
    const r = rng.next();
    if (r < 0.22) {
      const type = rng.pick(S_ALL);
      const name = freshName(scope, true);
      const isLet = rng.chance(0.6);
      const e = expr(type, scope, 2);
      scope.vars.set(name, { type, mut: isLet });
      return `${isLet ? 'let' : 'const'} ${name} = ${isLet ? copyIfRef(type, e) : e.code};`;
    }
    if (r < 0.4) {
      const s = assignment(scope);
      if (s) {
        return s;
      }
    }
    if (depth <= 0) {
      return 'acc += 1;';
    }
    if (r < 0.52) {
      let s = `if (${expr('bool', scope, 2).code}) {\n${indent(block(scope, depth - 1, ctx, 1 + rng.int(3)))}\n}`;
      if (rng.chance(0.4)) {
        s += ` else {\n${indent(block(scope, depth - 1, ctx, 1 + rng.int(2)))}\n}`;
      } else if (rng.chance(0.2)) {
        s += ` else if (${expr('bool', scope, 1).code}) {\n${indent(block(scope, depth - 1, ctx, 1))}\n}`;
      }
      return s;
    }
    if (r < 0.62) {
      const iv = freshName(scope, true);
      const inner = new Scope(scope);
      const itype = rng.pick(['i32', 'u32', 'i32']);
      inner.vars.set(iv, { type: itype, mut: true });
      const init = itype === 'u32' ? 'd.u32(0)' : '0';
      const bound = rng.pick(['3', '4', itype === 'u32' ? 'd.u32(2)' : 'd.i32(2)']);
      const update = rng.pick([`${iv}++`, `${iv} += 1`, `${iv} = ${iv} + 1`]);
      const body = stmts(inner, depth - 1, { ...ctx, loop: true }, 1 + rng.int(3));
      return `for (let ${iv} = ${init}; ${iv} < ${bound}; ${update}) {\n${indent(body)}\n}`;
    }
    if (r < 0.68) {
      const body = block(scope, depth - 1, { ...ctx, loop: true }, 1 + rng.int(2));
      return `while (${expr('bool', scope, 1).code}) {\n${indent(body)}\n  break;\n}`;
    }
    if (r < 0.76) {
      const inner = new Scope(scope);
      const ev = freshName(scope, true);
      const arrays = varsOf(scope, 'A');
      const vectors = [...scope.all().entries()]
        .filter(([, v]) => components[v.type])
        .map(([k, v]): [string, string] => [k, componentType[v.type] as string]);
      const sources: [string, string][] = [
        [`std.range(${rng.pick(['3', '1, 4', '0, 6, 2'])})`, 'i32'],
        [`tgpu.unroll(std.range(${rng.pick(['2', '3'])}))`, 'i32'],
      ];
      if (arrays.length) {
        sources.push([rng.pick(arrays), 'f32'], [`tgpu.unroll(${rng.pick(arrays)})`, 'f32']);
      }
      if (vectors.length) {
        sources.push(rng.pick(vectors));
      }
      const [iterable, elemType] = rng.pick(sources);
      inner.vars.set(ev, { type: elemType, mut: false });
      const body = stmts(inner, depth - 1, { ...ctx, loop: true }, 1 + rng.int(3));
      return `for (const ${ev} of ${iterable}) {\n${indent(body)}\n}`;
    }
    if (r < 0.82) {
      const t = rng.pick(['i32', 'u32']);
      const cases = [0, 1, 2, 3, 5].filter(() => rng.chance(0.5));
      let s = `switch (${expr(t, scope, 1).code}) {\n`;
      for (const cv of cases.length ? cases : [1]) {
        const label = t === 'u32' && rng.chance(0.5) ? `d.u32(${cv})` : `${cv}`;
        const body = block(scope, depth - 1, ctx, 1 + rng.int(2));
        s += `  case ${label}: {\n${indent(indent([...body, 'break;']))}\n  }\n`;
      }
      if (rng.chance(0.7)) {
        s += `  default: {\n${indent(indent(block(scope, depth - 1, ctx, 1)))}\n  }\n`;
      }
      return `${s}}`;
    }
    if (r < 0.88) {
      // nested block, shadowing a visible variable
      const inner = new Scope(scope);
      const visible = [...scope.all().keys()].filter((n) => n !== 'acc');
      const out: string[] = [];
      if (visible.length) {
        const n = rng.pick(visible);
        const t = rng.pick(S_ALL);
        inner.vars.set(n, { type: t, mut: true });
        out.push(`let ${n} = ${copyIfRef(t, expr(t, scope, 1))};`);
      }
      out.push(...stmts(inner, depth - 1, ctx, 1 + rng.int(2)));
      return `{\n${indent(out)}\n}`;
    }
    if (r < 0.92 && ctx.loop) {
      return rng.pick([
        'break;',
        'continue;',
        `if (${expr('bool', scope, 1).code}) {\n  ${rng.pick(['break', 'continue'])};\n}`,
      ]);
    }
    if (r < 0.95) {
      return `return ${expr(ctx.ret, scope, 2).code};`;
    }
    if (r < 0.98) {
      // passing a reference to a helper that mutates it
      const t = rng.pick(['f32', 'vec3f', 'S']);
      const n = freshName(scope, false);
      scope.vars.set(n, { type: 'ref', mut: false });
      const fn = { f32: 'bumpF', vec3f: 'bumpV', S: 'bumpS' }[t];
      const read = t === 'f32' ? `${n}.$` : t === 'S' ? `${n}.$.a` : `${n}.$.x`;
      return `const ${n} = d.ref(${construct(t, scope, 0)});\n${fn}(${n});\nacc += ${read};`;
    }
    return `acc += ${expr('f32', scope, 2).code};`;
  }

  // shell-less helpers with inferred parameter types, possibly calling earlier helpers
  const helperSources: string[] = [];
  for (let h = 0, nh = rng.int(3); h < nh; h++) {
    const params = Array.from({ length: 1 + rng.int(2) }, () =>
      rng.pick(['f32', 'i32', 'vec3f', 'S', 'u32']),
    );
    const ret = rng.pick(['f32', 'f32', 'i32', 'vec3f']);
    const scope = new Scope(null);
    params.forEach((t, i) => scope.vars.set(`x${i}`, { type: t, mut: false }));
    scope.vars.set('acc', { type: 'f32', mut: true });
    const body = stmts(scope, 2, { ret, loop: false }, 1 + rng.int(3));
    const retExpr = copyIfRef(ret, expr(ret, scope, 2));
    const name = `helper${h}`;
    helperSources.push(
      `const ${name} = (${params.map((_, i) => `x${i}`).join(', ')}) => {\n  'use gpu';\n  let acc = d.f32(0);\n${indent(body)}\n  return ${retExpr};\n};`,
    );
    helpers.push({ name, params, ret });
  }

  const mainParams = Array.from({ length: rng.int(3) }, () =>
    rng.pick(S_ALL.filter((t) => t !== 'A')),
  );
  const scope = new Scope(null);
  mainParams.forEach((t, i) => scope.vars.set(`p${i}`, { type: t, mut: false }));
  scope.vars.set('acc', { type: 'f32', mut: true });
  const body = stmts(scope, 3, { ret: 'f32', loop: false }, 2 + rng.int(6));
  const ret = expr('f32', scope, 2).code;
  const paramList = mainParams.map((_, i) => `p${i}`).join(', ');

  let source = `const S = d.struct({ a: d.f32, v: d.vec3f, n: d.i32 });
const A = d.arrayOf(d.f32, 4);
const slotF = tgpu.slot(d.f32(1.5));
const bumpF = (r) => {
  'use gpu';
  r.$ += 1;
};
const bumpV = (r) => {
  'use gpu';
  r.$.x += 1;
  r.$ = r.$ * 2;
};
const bumpS = (r) => {
  'use gpu';
  r.$.a += 1;
  r.$.v.y = 2;
};
${helperSources.join('\n')}
const main = tgpu.fn([${mainParams.map((t) => sSchema[t]).join(', ')}], d.f32)((${paramList}) => {
  let acc = d.f32(0);
${indent(body)}
  return ${ret};
});
`;
  if (useSlot) {
    const args = mainParams.map((t) => construct(t, new Scope(null), 0)).join(', ');
    source += `const mainB = main.with(slotF, 3);\nconst outer = tgpu.fn([], d.f32)(() => main(${args}) + mainB(${args}));\nreturn [outer];`;
  } else {
    source += 'return [main];';
  }
  return { generator: 'statements', shape: { useSlot: String(useSlot) }, source };
}

export const generators = {
  operator: generateOperator,
  conversion: generateConversion,
  statements: generateStatements,
};
