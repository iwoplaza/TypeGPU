import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { tgpu, d, type Namespace, type TgpuFn, type TgpuRawCodeSnippet } from 'typegpu';
import { glOptions } from '@typegpu/gl';

/**
 * TSL value type for every TypeGPU schema that can cross the call boundary by value.
 */
const tslValueTypes: Record<string, string> = {
  bool: 'bool',
  f32: 'float',
  i32: 'int',
  u32: 'uint',
  vec2f: 'vec2',
  vec3f: 'vec3',
  vec4f: 'vec4',
  vec2i: 'ivec2',
  vec3i: 'ivec3',
  vec4i: 'ivec4',
  vec2u: 'uvec2',
  vec3u: 'uvec3',
  vec4u: 'uvec4',
  vec2b: 'bvec2',
  vec3b: 'bvec3',
  vec4b: 'bvec4',
  mat2x2f: 'mat2',
  mat3x3f: 'mat3',
  mat4x4f: 'mat4',
};

/** How one argument is built: by value in a TSL type, or by reference to a resource handle. */
type ParameterOutput = { kind: 'value'; type: string } | { kind: 'resource'; output: string };

function parameterOutput(dataType: d.AnyWgslData): ParameterOutput {
  const type = dataType.type;
  if (type === 'sampler') return { kind: 'resource', output: 'sampler' };
  if (type === 'sampler_comparison') return { kind: 'resource', output: 'samplerComparison' };
  if (type.startsWith('texture_storage')) return { kind: 'resource', output: 'storageTexture' };
  if (type.startsWith('texture_depth')) return { kind: 'resource', output: 'depthTexture' };
  if (type === 'texture_cube' || type === 'texture_cube_array') {
    return { kind: 'resource', output: 'cubeTexture' };
  }
  if (type === 'texture_3d') return { kind: 'resource', output: 'texture3D' };
  if (type.startsWith('texture_')) return { kind: 'resource', output: 'texture' };
  const value = tslValueTypes[type];
  if (value === undefined) {
    throw new Error(
      `[@typegpu/three] toTSLFn cannot pass '${type}' across the TSL boundary; use scalars, vectors, matrices, textures, or samplers.`,
    );
  }
  return { kind: 'value', type: value };
}

// ---------------------------------------------------------------------------
// Handles
// ---------------------------------------------------------------------------

/**
 * A resource placeholder a TypeGPU function can close over (for example through a slot) when the
 * resource cannot be a parameter. Each `toTSLFn` call binds a TSL node to it.
 */
export type TSLHandle<T extends d.AnyWgslData> = TgpuRawCodeSnippet<T>;

interface HandleInfo {
  readonly token: string;
  readonly output: string;
}

const handleInfo = new WeakMap<object, HandleInfo>();
const handleTokens: string[] = [];

/**
 * Creates a resource placeholder for `toTSLFn`. Access it with `.$` inside `'use gpu'` code; bind it by
 * passing the handle list to `toTSLFn` and the TSL nodes after the regular call arguments.
 *
 * @example
 * const atlas = t3.handle(d.texture2d(d.f32));
 * const load = tgpu.fn([d.vec2i], d.vec4f)((c) => {
 *   'use gpu';
 *   return std.textureLoad(atlas.$, c, 0);
 * });
 * const loadTSL = t3.toTSLFn(load, [atlas]);
 * material.colorNode = loadTSL(TSL.ivec2(0, 0), TSL.texture(atlasTexture));
 */
export function handle<T extends d.AnyWgslData>(dataType: T): TSLHandle<T> {
  const output = parameterOutput(dataType);
  if (output.kind !== 'resource') {
    throw new Error('[@typegpu/three] handles can only stand in for textures and samplers.');
  }
  const token = `t3handle${handleTokens.length}`;
  handleTokens.push(token);
  const snippet = tgpu['~unstable'].rawCodeSnippet(token, dataType, 'handle');
  handleInfo.set(snippet, { token, output: output.output });
  return snippet;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

interface Declaration {
  /** Mangled identifier. */
  readonly name: string;
  readonly code: string;
  /** Shared code node, absent for declarations that read a handle directly. */
  readonly node: THREE.Node | undefined;
}

/**
 * Everything one backend needs to call a TypeGPU function from TSL: the entry identifier and every
 * module-scope declaration it depends on, in dependency order.
 */
interface ResolvedProgram {
  readonly name: string;
  readonly includes: readonly Declaration[];
  /** Mangled identifiers that (transitively) read a handle and are specialized per binding. */
  readonly specialized: readonly string[];
  readonly handleTokens: readonly string[];
}

/**
 * Identifiers from the shared namespace are renamed with a fixed suffix so they can never collide with
 * the per-shader names chosen by `toTSL` (which uses the plain base names) or by three.js itself.
 */
const MANGLE_SUFFIX = '_tsl';
// A declaration spelled like a swizzle keeps its name, since `.xy` member accesses would match it too.
const swizzle = /^(?:[xyzw]{1,4}|[rgba]{1,4})$/;

function mangle(name: string): string {
  return swizzle.test(name) ? name : `${name}${MANGLE_SUFFIX}`;
}

function identifierPattern(names: readonly string[]): RegExp | undefined {
  return names.length === 0 ? undefined : new RegExp(`\\b(?:${names.join('|')})\\b`, 'g');
}

function containsIdentifier(code: string, name: string): boolean {
  return new RegExp(`\\b${name}\\b`).test(code);
}

/**
 * One global namespace per backend. Every function passed to `toTSLFn` is resolved into it exactly
 * once, so shared helpers keep one identifier and one code node across every material.
 */
class BackendRegistry {
  readonly namespace: Namespace = tgpu['~unstable'].namespace();
  /** Declared identifier (unmangled) -> declaration, in emission (dependency) order. */
  readonly declarations = new Map<string, Declaration>();
  /** Declared identifier (unmangled) -> identifiers and handle tokens its code references. */
  readonly references = new Map<string, readonly string[]>();
  readonly programs = new WeakMap<object, ResolvedProgram>();
  readonly #webgl: boolean;

  constructor(webgl: boolean) {
    this.#webgl = webgl;
  }

  resolve(fn: TgpuFn, boundTokens: readonly string[]): ResolvedProgram {
    const cached = this.programs.get(fn);
    if (cached) return cached;

    // A GLSL generator serves exactly one resolution, so every call gets fresh options.
    const options = () => ({ names: this.namespace, ...(this.#webgl ? glOptions() : {}) });
    const { declarations } = tgpu.resolveWithContext([fn], options());
    const name = tgpu.resolve({ template: 'fn', externals: { fn }, ...options() });

    // The GLSL generator reports structs without a name, so recover it from the declaration itself. A
    // declaration that names nothing is kept alongside every declaration of the same resolution.
    const named = declarations.map((decl) => ({
      id: decl.name ?? /^\s*struct\s+([A-Za-z_]\w*)/.exec(decl.code)?.[1],
      code: decl.code,
    }));
    const anonymous = named.flatMap((decl, index) =>
      decl.id ? [] : [`#anonymous${this.declarations.size + index}`],
    );
    const known = [
      ...this.declarations.keys(),
      ...named.flatMap((decl) => (decl.id ? [decl.id] : [])),
    ];
    const pattern = identifierPattern(known.filter((id) => !swizzle.test(id)));
    let anonymousIndex = 0;
    for (const decl of named) {
      const id = decl.id ?? (anonymous[anonymousIndex++] as string);
      const code = pattern ? decl.code.replace(pattern, mangle) : decl.code;
      const tokens = handleTokens.filter((token) => containsIdentifier(decl.code, token));
      this.references.set(id, [
        ...known.filter((other) => other !== id && containsIdentifier(decl.code, other)),
        ...(decl.id ? anonymous : []),
        ...tokens,
      ]);
      this.declarations.set(id, {
        name: decl.id ? mangle(id) : id,
        code,
        node: tokens.length === 0 ? (TSL.code(code) as unknown as THREE.Node) : undefined,
      });
    }

    // Transitive closure over the identifiers the entry references, emitted in global order so
    // every declaration precedes its first use (required by GLSL, harmless for WGSL).
    const needed = new Set<string>();
    const visit = (id: string) => {
      if (needed.has(id)) return;
      needed.add(id);
      for (const dep of this.references.get(id) ?? []) visit(dep);
    };
    visit(name);

    for (const token of handleTokens) {
      if (needed.has(token) && !boundTokens.includes(token)) {
        throw new Error(
          `[@typegpu/three] '${name}' reads a handle that was not passed to toTSLFn.`,
        );
      }
    }

    const readsHandle = new Map<string, boolean>();
    const dependsOnHandle = (id: string): boolean => {
      const cachedResult = readsHandle.get(id);
      if (cachedResult !== undefined) return cachedResult;
      readsHandle.set(id, false);
      const result = (this.references.get(id) ?? []).some(
        (ref) => boundTokens.includes(ref) || dependsOnHandle(ref),
      );
      readsHandle.set(id, result);
      return result;
    };

    const includeIds = [...this.declarations.keys()].filter((id) => needed.has(id));
    const program: ResolvedProgram = {
      name: mangle(name),
      includes: includeIds.map((id) => this.declarations.get(id) as Declaration),
      specialized: includeIds.filter(dependsOnHandle).map(mangle),
      handleTokens: boundTokens,
    };
    this.programs.set(fn, program);
    return program;
  }
}

const registries = { wgsl: new BackendRegistry(false), glsl: new BackendRegistry(true) };

interface Specialization {
  readonly suffix: string;
  readonly nodes: Map<string, THREE.Node>;
}

/**
 * Per-builder specializations of handle-reading declarations, keyed by the resource names they were
 * bound to, so calls bound to the same resources share one set of declarations in a shader.
 */
const specializations = new WeakMap<THREE.NodeBuilder, Map<string, Specialization>>();

function specialization(
  builder: THREE.NodeBuilder,
  handleNames: readonly string[],
): Specialization {
  let perBuilder = specializations.get(builder);
  if (!perBuilder) {
    perBuilder = new Map();
    specializations.set(builder, perBuilder);
  }
  const key = handleNames.join(',');
  let entry = perBuilder.get(key);
  if (!entry) {
    entry = { suffix: `_h${perBuilder.size}`, nodes: new Map() };
    perBuilder.set(key, entry);
  }
  return entry;
}

function isWebGL(builder: THREE.NodeBuilder): boolean {
  const backend = builder.renderer?.backend as { isWebGLBackend?: boolean } | undefined;
  return backend?.isWebGLBackend === true;
}

class TgpuCallNode extends THREE.TempNode {
  readonly fn: TgpuFn;
  readonly args: THREE.Node[];
  readonly handleNodes: THREE.Node[];
  readonly #handles: readonly HandleInfo[];
  readonly #parameters: readonly ParameterOutput[];
  readonly #returnType: string;

  constructor(
    fn: TgpuFn,
    handles: readonly HandleInfo[],
    args: THREE.Node[],
    handleNodes: THREE.Node[],
  ) {
    const output = parameterOutput(fn.shell.returnType as d.AnyWgslData);
    if (output.kind !== 'value') {
      throw new Error('[@typegpu/three] toTSLFn functions must return a value type.');
    }
    super(output.type);
    this.fn = fn;
    this.args = args;
    this.handleNodes = handleNodes;
    this.#handles = handles;
    this.#returnType = output.type;
    this.#parameters = (fn.shell.argTypes as d.AnyWgslData[]).map(parameterOutput);
  }

  static get type() {
    return 'TgpuCallNode';
  }

  getNodeType() {
    return this.#returnType;
  }

  generate(builder: THREE.NodeBuilder, output?: string | null) {
    const program = registries[isWebGL(builder) ? 'glsl' : 'wgsl'].resolve(
      this.fn,
      this.#handles.map((h) => h.token),
    );

    let name = program.name;
    if (program.specialized.length === 0) {
      for (const include of program.includes) (include.node as THREE.Node).build(builder);
    } else {
      const handleNames = this.handleNodes.map(
        (node, index) => node.build(builder, (this.#handles[index] as HandleInfo).output) as string,
      );
      const { suffix, nodes } = specialization(builder, handleNames);
      const substitutions = new Map<string, string>(
        program.specialized.map((id) => [id, `${id}${suffix}`]),
      );
      program.handleTokens.forEach((token, index) =>
        substitutions.set(token, handleNames[index] as string),
      );
      const pattern = identifierPattern([...substitutions.keys()]) as RegExp;
      for (const include of program.includes) {
        if (!program.specialized.includes(include.name)) {
          (include.node as THREE.Node).build(builder);
          continue;
        }
        let node = nodes.get(include.name);
        if (!node) {
          const code = include.code.replace(pattern, (id) => substitutions.get(id) as string);
          node = TSL.code(code) as unknown as THREE.Node;
          nodes.set(include.name, node);
        }
        node.build(builder);
      }
      name = substitutions.get(program.name) ?? program.name;
    }

    const args = this.args.map((arg, index) => {
      const parameter = this.#parameters[index] as ParameterOutput;
      return arg.build(builder, parameter.kind === 'value' ? parameter.type : parameter.output);
    });

    const snippet = `${name}(${args.join(', ')})`;
    return output ? builder.format(snippet, this.#returnType, output) : snippet;
  }
}

type NodeArgs<Args extends readonly unknown[]> = {
  [K in keyof Args]: THREE.Node | THREE.TSL.NodeObject<THREE.Node>;
};

/** A TSL-callable TypeGPU function. */
export interface TSLFn<Args extends readonly unknown[]> {
  (...args: Args): THREE.TSL.NodeObject<THREE.Node>;
  /**
   * Resolves the function for one backend ahead of the first shader build, for example while assets load.
   * Calls stay correct without it; it only moves the one-time TypeGPU compilation off the first frame.
   */
  prewarm(backend: 'webgpu' | 'webgl'): void;
}

/**
 * Wraps a shelled TypeGPU function as a TSL-callable function.
 *
 * Unlike `toTSL`, the function is resolved once per backend for the whole program, not once per material
 * and shader stage. TSL values arrive as ordinary call arguments instead of private bridge variables, so a
 * call costs TSL about as much as a native `wgslFn` call, and a reused result is cached in a temporary.
 *
 * Resources the function reaches through slots rather than parameters are declared with `handle()` and
 * bound per call after the regular arguments; only the declarations that read them are specialized.
 *
 * @example
 * const mixColors = tgpu.fn([d.vec3f, d.vec3f, d.f32], d.vec3f)((a, b, t) => {
 *   'use gpu';
 *   return std.mix(a, b, t);
 * });
 * const mixColorsTSL = t3.toTSLFn(mixColors);
 * material.colorNode = mixColorsTSL(colorA, colorB, TSL.float(0.5));
 */
export function toTSLFn<
  Args extends d.AnyWgslData[],
  Return extends d.AnyWgslData,
  const Handles extends readonly TSLHandle<d.AnyWgslData>[] = [],
>(
  fn: TgpuFn<(...args: Args) => Return>,
  handles?: Handles,
): TSLFn<[...NodeArgs<Args>, ...NodeArgs<Handles>]> {
  const arity = fn.shell.argTypes.length;
  const bound = (handles ?? []).map((h) => {
    const info = handleInfo.get(h);
    if (!info)
      throw new Error('[@typegpu/three] toTSLFn handles must be created with t3.handle().');
    return info;
  });
  const call = (...args: THREE.Node[]) => {
    if (args.length !== arity + bound.length) {
      throw new Error(
        `[@typegpu/three] expected ${arity + bound.length} arguments, received ${args.length}.`,
      );
    }
    return TSL.nodeObject(
      new TgpuCallNode(fn as unknown as TgpuFn, bound, args.slice(0, arity), args.slice(arity)),
    );
  };
  return Object.assign(call, {
    prewarm(backend: 'webgpu' | 'webgl') {
      registries[backend === 'webgl' ? 'glsl' : 'wgsl'].resolve(
        fn as unknown as TgpuFn,
        bound.map((h) => h.token),
      );
    },
  }) as unknown as TSLFn<[...NodeArgs<Args>, ...NodeArgs<Handles>]>;
}
