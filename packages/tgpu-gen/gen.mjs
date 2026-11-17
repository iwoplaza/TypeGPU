// @ts-check

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ArrayInfo,
  Const,
  Override,
  StructInfo,
  TemplateInfo,
  Var,
  WgslParser,
  WgslReflect,
} from 'wgsl_reflect';

/**
 * @typedef {import('wgsl_reflect').AliasInfo} AliasInfo
 * @typedef {import('wgsl_reflect').MemberInfo} MemberInfo
 * @typedef {import('wgsl_reflect').TypeInfo} TypeInfo
 * @typedef {import('wgsl_reflect').VariableInfo} VariableInfo
 * @typedef {import('wgsl_reflect').FunctionInfo} FunctionInfo
 */

const cwd = new URL(`file:${process.cwd()}/`);

const LENGTH_VAR = 'arrayLength';

const SUPPORTED_DATA_TYPES = new Set([
  'bool',
  'f16',
  'f32',
  'i32',
  'u32',
  ...['vec2', 'vec3', 'vec4'].flatMap((vec) => ['f', 'h', 'i', 'u', 'b'].map((s) => vec + s)),
  'mat2x2f',
  'mat3x3f',
  'mat4x4f',
]);

const BUILTINS = {
  vertex_index: 'vertexIndex',
  instance_index: 'instanceIndex',
  clip_distances: 'clipDistances',
  position: 'position',
  front_facing: 'frontFacing',
  frag_depth: 'fragDepth',
  primitive_index: 'primitiveIndex',
  sample_index: 'sampleIndex',
  sample_mask: 'sampleMask',
  local_invocation_id: 'localInvocationId',
  local_invocation_index: 'localInvocationIndex',
  global_invocation_id: 'globalInvocationId',
  global_invocation_index: 'globalInvocationIndex',
  workgroup_id: 'workgroupId',
  workgroup_index: 'workgroupIndex',
  num_workgroups: 'numWorkgroups',
  subgroup_invocation_id: 'subgroupInvocationId',
  subgroup_size: 'subgroupSize',
  subgroup_id: 'subgroupId',
  num_subgroups: 'numSubgroups',
};

/**
 * @typedef {object} Options
 * @prop {string} inputPath
 * @prop {string} outputPath
 * @prop {boolean} toTs
 * @prop {'commonjs' | 'esmodule'} moduleSyntax
 * @prop {'keep' | 'overwrite'} [existingFileStrategy]
 * @prop {Set<string>} [declaredIdentifiers]
 * @prop {{tgpu?: boolean, data?: boolean }} [usedImports]
 */

/**
 * @param {Options} options
 */
async function main(options) {
  const inputPath = new URL(options.inputPath, cwd);
  const outputPath = new URL(options.outputPath, cwd);
  const inputContents = await fs.readFile(inputPath, 'utf8');

  const generated = generate(inputContents, options);
  await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
  await fs.writeFile(outputPath, generated);
}

/**
 * @param {StructInfo[]} structs
 */
function topologicalSort(structs) {
  const allStructs = Object.fromEntries(structs.map((struct) => [struct.name, struct]));
  const allStructNames = Object.keys(allStructs);

  /** @type {Record<string, Set<string>>} */
  const neighbors = {};

  for (const struct of structs) {
    /** @type Set<string>*/
    const neighborsSet = new Set();
    neighbors[struct.name] = neighborsSet;
    for (const neighbor of struct.members) {
      let type_ = neighbor.type;
      // Unwrap (possibly nested) arrays to find the struct they hold.
      while (type_ instanceof ArrayInfo) {
        type_ = type_.format;
      }
      if (allStructNames.includes(type_.name)) {
        neighborsSet.add(type_.name);
      }
    }
  }

  const visited = Object.fromEntries(allStructNames.map((name) => [name, false]));
  /** @type {StructInfo[]} */
  const result = [];

  /** @param {string} structName */
  function dns(structName) {
    visited[structName] = true;

    for (const neighbor of neighbors[structName] ?? []) {
      if (!visited[neighbor]) {
        dns(neighbor);
      }
    }

    result.push(/** @type StructInfo */ (allStructs[structName]));
  }

  for (const structName of Object.keys(allStructs)) {
    if (!visited[structName]) {
      dns(structName);
    }
  }

  return result;
}

/**
 * @param {string} wgsl
 * @param {Options} options
 */
export function generate(
  wgsl,
  options = {
    inputPath: '',
    outputPath: '',
    toTs: true,
    moduleSyntax: 'esmodule',
  },
) {
  const reflect = new WgslReflect(wgsl);

  const structs = generateStructs(topologicalSort(reflect.structs), options);
  const aliases = generateAliases(reflect.aliases, options);
  const bindGroupLayouts = generateBindGroupLayouts(reflect.getBindGroups(), options);

  const functions = generateFunctions(reflect.functions, wgsl, options);
  const skipped = generateSkippedDeclarations(wgsl);

  const imports = generateImports(options);
  const exports_ = generateExports(options);

  return `/* generated via tgpu-gen by TypeGPU */
${[imports, structs, aliases, bindGroupLayouts, functions, skipped, exports_]
  .filter((generated) => generated && generated.trim() !== '')
  .join('\n')}
`;
}

/**
 * @param {StructInfo[]} structs
 * @param {Options} options
 */
function generateStructs(structs, options) {
  return structs.length > 0
    ? `\n/* structs */
${structs.map((struct) => generateStruct(struct, options)).join('\n\n')}`
    : '';
}

/**
 * @param {StructInfo} struct
 * @param {Options} options
 */
function generateStruct(struct, options) {
  setUseImport('data', options);

  return `${declareConst(struct.name, options)} = ${
    hasVarLengthMember(struct) ? `(${LENGTH_VAR}${options.toTs ? ': number' : ''}) => ` : ''
  }d.struct({
  ${struct.members.map((member) => generateStructMember(struct, member, options)).join('\n  ')}
});`;
}

/**
 * @param {TypeInfo} type_
 */
function isVarLengthArray(type_) {
  return type_ instanceof ArrayInfo && type_.size === 0;
}

/**
 * @param {StructInfo} struct
 */
function hasVarLengthMember(struct) {
  return isVarLengthArray(/** @type MemberInfo */ (struct.members[struct.members.length - 1]).type);
}

/**
 * @param {AliasInfo[]} aliases
 * @param {Options} options
 */
function generateAliases(aliases, options) {
  return aliases.length > 0
    ? `\n/* aliases */
${aliases
  .map(
    (alias) =>
      `${declareConst(alias.name, options)} = ${inContext(`alias '${alias.name}'`, () =>
        generateType(alias.type, options),
      )};`,
  )
  .join('\n')}`
    : '';
}

/**
 * @param {StructInfo} struct
 * @param {MemberInfo} member
 * @param {Options} options
 */
function generateStructMember(struct, member, options) {
  return `${member.name}: ${inContext(`member '${member.name}' of struct '${struct.name}'`, () =>
    generateType(member.type, options),
  )},`;
}

/**
 * Adds information about where the error occurred to errors thrown by `generate`.
 *
 * @template T
 * @param {string} context
 * @param {() => T} generate
 * @returns {T}
 */
function inContext(context, generate) {
  try {
    return generate();
  } catch (error) {
    if (error instanceof Error) {
      error.message = `${error.message} (in ${context})`;
    }
    throw error;
  }
}

/**
 * @param {TypeInfo} type_
 * @returns {string}
 */
function wgslTypeName(type_) {
  return type_ instanceof TemplateInfo && type_.format
    ? `${type_.name}<${wgslTypeName(type_.format)}>`
    : type_.name;
}

/**
 * @param {TypeInfo} type_
 * @param {Options} options
 */
function generateType(type_, options) {
  const builtin = type_.attributes?.find((attribute) => attribute.name === 'builtin');
  if (
    !builtin &&
    type_.size === 0 &&
    !type_.isArray &&
    !options.declaredIdentifiers?.has(type_.name)
  ) {
    throw new Error(`Unknown data type: ${type_.name}`);
  }

  /** @type {string} */
  const tgpuType = builtin
    ? generateBuiltin(builtin)
    : type_ instanceof StructInfo
      ? type_.name
      : type_ instanceof ArrayInfo
        ? `d.arrayOf(${generateType(type_.format, options)}, ${
            type_.count > 0 ? type_.count : LENGTH_VAR
          })`
        : type_ instanceof TemplateInfo && type_.name === 'atomic' && type_.format
          ? `d.atomic(${generateType(type_.format, options)})`
          : type_.size === 0
            ? type_.name
            : generateDataType(type_);

  const result =
    type_.attributes?.reduce((acc, attribute) => {
      if (['align', 'size', 'location'].includes(attribute.name)) {
        return `d.${attribute.name}(${attribute.value}, ${acc})`;
      }
      if (attribute.name === 'interpolate') {
        const value = [attribute.value].flat().join(', ');
        return `d.interpolate('${value}', ${acc})`;
      }
      if (attribute.name === 'invariant') {
        return `d.invariant(${acc})`;
      }
      return acc;
    }, tgpuType) ?? tgpuType;

  if (result.startsWith('d.')) {
    setUseImport('data', options);
  }

  return result;
}

/**
 * @param {TypeInfo} type_
 */
function generateDataType(type_) {
  const alias = replaceWithAlias(type_);
  if (alias === undefined || !SUPPORTED_DATA_TYPES.has(alias)) {
    throw new Error(`Unsupported data type: ${wgslTypeName(type_)}`);
  }
  return `d.${alias}`;
}

/**
 * @param {import('wgsl_reflect').Attribute} attribute
 */
function generateBuiltin(attribute) {
  const name = /** @type {string} */ (attribute.value);
  const builtin = BUILTINS[/** @type {keyof typeof BUILTINS} */ (name)];
  if (!builtin) {
    throw new Error(`Unsupported builtin: ${name}`);
  }
  return `d.builtin.${builtin}`;
}

/**
 * @param {string} type
 * @param {string} format
 */
function typeToAlias(type, format) {
  if (['vec2', 'vec3', 'vec4'].includes(type) && ['i32', 'u32', 'f32'].includes(format)) {
    return type + format[0];
  }
  if (['vec2', 'vec3', 'vec4'].includes(type) && format === 'f16') {
    return `${type}h`;
  }
  if (['vec2', 'vec3', 'vec4'].includes(type) && format === 'bool') {
    return `${type}b`;
  }
  if (['mat2x2', 'mat3x3', 'mat4x4'].includes(type) && format === 'f32') {
    return `${type}f`;
  }
}

/**
 * @param {TypeInfo} type
 */
function replaceWithAlias(type) {
  return type instanceof TemplateInfo ? typeToAlias(type.name, type.format?.name ?? '') : type.name;
}

/**
 * @param {VariableInfo[][]} bindGroups
 * @param {Options} options
 */
function generateBindGroupLayouts(bindGroups, options) {
  return bindGroups.length > 0
    ? `\n/* bindGroupLayouts */
${bindGroups
  .flatMap(
    (group, index) =>
      `\
${declareConst(`layout${index}`, options)} = tgpu.bindGroupLayout({
  ${generateGroupLayout(group, options)}
});`,
  )
  .join('\n\n')}`
    : '';
}

const RESOURCE_GENERATORS = [
  generateUniformVariable,
  generateStorageVariable,
  generateTextureVariable,
  generateSamplerVariable,
  generateStorageTextureVariable,
];

const ACCESS_TYPES = {
  read: 'readonly',
  write: 'writeonly',
  read_write: 'mutable',
};

const STORAGE_TEXTURE_ACCESS = {
  read: 'read-only',
  write: 'write-only',
  read_write: 'read-write',
};

const TEXTURE_SAMPLE_SCHEMAS = {
  u32: 'd.u32',
  i32: 'd.i32',
  f32: 'd.f32',
};

const TEXTURE_SCHEMA_FUNCTIONS = {
  texture_1d: 'texture1d',
  texture_2d: 'texture2d',
  texture_2d_array: 'texture2dArray',
  texture_3d: 'texture3d',
  texture_cube: 'textureCube',
  texture_cube_array: 'textureCubeArray',
  texture_multisampled_2d: 'textureMultisampled2d',
};

const DEPTH_TEXTURE_SCHEMA_FUNCTIONS = {
  texture_depth_2d: 'textureDepth2d',
  texture_depth_multisampled_2d: 'textureDepthMultisampled2d',
  texture_depth_2d_array: 'textureDepth2dArray',
  texture_depth_cube: 'textureDepthCube',
  texture_depth_cube_array: 'textureDepthCubeArray',
};

const STORAGE_TEXTURE_SCHEMA_FUNCTIONS = {
  texture_storage_1d: 'textureStorage1d',
  texture_storage_2d: 'textureStorage2d',
  texture_storage_2d_array: 'textureStorage2dArray',
  texture_storage_3d: 'textureStorage3d',
};

/**
 * @param {VariableInfo[]} group
 * @param {Options} options
 */
function generateGroupLayout(group, options) {
  setUseImport('tgpu', options);

  return Array.from(group)
    .map((variable, index) =>
      variable
        ? `${variable.name}: ${inContext(`binding '${variable.name}'`, () =>
            generateVariable(variable, options),
          )},`
        : `_${index}: null, // skipping binding ${index}`,
    )
    .join('\n  ');
}

/**
 * @param {VariableInfo} variable
 * @param {Options} options
 */
function generateVariable(variable, options) {
  return RESOURCE_GENERATORS[variable.resourceType]?.(variable, options);
}

/**
 * @param {VariableInfo} variable
 * @param {Options} options
 */
function generateUniformVariable(variable, options) {
  return `{
    uniform: ${
      isVarLengthArray(variable.type) ? `(${LENGTH_VAR}${options.toTs ? ': number' : ''}) => ` : ''
    }${generateType(variable.type, options)},
  }`;
}

/**
 * @param {VariableInfo} variable
 * @param {Options} options
 */
function generateStorageVariable(variable, options) {
  return `{
    storage: ${
      isVarLengthArray(variable.type) ? `(${LENGTH_VAR}${options.toTs ? ': number' : ''}) => ` : ''
    }${generateType(variable.type, options)},${
      variable.access
        ? `\n    access: '${
            ACCESS_TYPES[/** @type ('read' | 'write' | 'read_write') */ (variable.access)]
          }',`
        : ''
    }
  }`;
}

/**
 * @param {VariableInfo} variable
 * @param {Options} options
 */
function generateStorageTextureVariable(variable, options) {
  setUseImport('data', options);
  const type_ = variable.type.name;
  const schemaFn =
    STORAGE_TEXTURE_SCHEMA_FUNCTIONS[
      /** @type {keyof typeof STORAGE_TEXTURE_SCHEMA_FUNCTIONS} */ (type_)
    ] ?? 'textureStorage2d';
  const access =
    variable.type instanceof TemplateInfo
      ? /** @type ('read' | 'write' | 'read_write') */ (variable.type.access)
      : null;

  return `{
    storageTexture: d.${schemaFn}('${variable.format?.name}'${
      access ? `, '${STORAGE_TEXTURE_ACCESS[access]}'` : ''
    }),
  }`;
}

const SAMPLER_TYPES = {
  sampler: 'filtering',
  sampler_comparison: 'comparison',
};

/**
 * @param {VariableInfo} variable
 */
function generateSamplerVariable(variable) {
  return `{
    sampler: '${
      SAMPLER_TYPES[/** @type ('sampler' | 'sampler_comparison') */ (variable.type.name)]
    }',
  }`;
}

/**
 * @param {VariableInfo} variable
 * @param {Options} options
 */
function generateTextureVariable(variable, options) {
  setUseImport('data', options);
  const type_ = variable.type.name;

  if (type_ === 'texture_external') {
    return generateExternalTextureVariable(variable, options);
  }

  const depthSchemaFn =
    DEPTH_TEXTURE_SCHEMA_FUNCTIONS[
      /** @type {keyof typeof DEPTH_TEXTURE_SCHEMA_FUNCTIONS} */ (type_)
    ];
  if (depthSchemaFn) {
    return `{
    texture: d.${depthSchemaFn}(),
  }`;
  }

  const format = variable.format?.name;
  const schemaFn =
    TEXTURE_SCHEMA_FUNCTIONS[/** @type {keyof typeof TEXTURE_SCHEMA_FUNCTIONS} */ (type_)] ??
    'texture2d';
  const sampleType =
    format && format in TEXTURE_SAMPLE_SCHEMAS
      ? TEXTURE_SAMPLE_SCHEMAS[/** @type {keyof typeof TEXTURE_SAMPLE_SCHEMAS} */ (format)]
      : 'd.u32';

  return `{
    texture: d.${schemaFn}(${sampleType}),
  }`;
}

/**
 * @param {VariableInfo} _variable
 * @param {Options} options
 */
function generateExternalTextureVariable(_variable, options) {
  setUseImport('data', options);
  return `{
    externalTexture: d.textureExternal(),
  }`;
}

/**
 * @param {FunctionInfo[]} functions
 * @param {string} wgsl
 * @param {Options} options
 */
function generateFunctions(functions, wgsl, options) {
  const nonEntryFunctions = functions.filter((func) => func.stage === null);
  return nonEntryFunctions.length > 0
    ? `\n/* functions */
${nonEntryFunctions
  .map(
    (func) =>
      `${declareConst(func.name, options)} = ${inContext(`function '${func.name}'`, () =>
        generateFunction(func, wgsl, options),
      )};`,
  )
  .join('\n\n')}`
    : '';
}

/**
 * For non-entry functions only for now.
 *
 * @param {FunctionInfo} func
 * @param {string} wgsl
 * @param {Options} options
 */
function generateFunction(func, wgsl, options) {
  setUseImport('tgpu', options);

  const implementation = wgsl
    .split('\n')
    .slice(func.startLine - 1, func.endLine)
    .join('\n');

  const inputs = `[${func.arguments
    .flatMap((arg) =>
      arg.type && arg.type.attributes?.find((attr) => attr.name === 'builtin') === undefined
        ? [`${generateType(arg.type, options)}`]
        : [],
    )
    .join(', ')}]`;

  const output = func.returnType ? generateType(func.returnType, options) : null;

  const body = implementation.match(/\(.*\).*{.*}/s);

  return body?.[0]
    ? `tgpu.fn(${inputs}${output ? `, ${output}` : ''})(/* wgsl */ \`${body[0]}\`)`
    : '';
}

/**
 * Module-scope declarations that have no TypeGPU counterpart generated by this tool.
 *
 * @param {string} wgsl
 */
function generateSkippedDeclarations(wgsl) {
  const skipped = new WgslParser().parse(wgsl).flatMap((node) => {
    if (node instanceof Const) {
      return [`const ${node.name}`];
    }
    if (node instanceof Override) {
      return [`override ${node.name}`];
    }
    if (node instanceof Var && (node.storage === 'workgroup' || node.storage === 'private')) {
      return [`var<${node.storage}> ${node.name}`];
    }
    return [];
  });

  return skipped.length > 0
    ? `\n/* skipped declarations (not supported by tgpu-gen) */
${skipped.map((declaration) => `// ${declaration}`).join('\n')}`
    : '';
}

/**
 * @param {string} ident
 * @param {Options} options
 */
function declareConst(ident, options) {
  if (options.declaredIdentifiers === undefined) {
    options.declaredIdentifiers = new Set([ident]);
  } else {
    options.declaredIdentifiers.add(ident);
  }

  return `${options.moduleSyntax === 'esmodule' ? 'export ' : ''}const ${ident}`;
}

/**
 * @param {Options} options
 */
function generateImports(options) {
  const imports = [
    options.usedImports?.tgpu ? 'tgpu' : null,
    options.usedImports?.data ? 'd' : null,
  ].filter((imp) => !!imp);

  if (imports.length === 0) {
    return '';
  }

  return options.moduleSyntax === 'commonjs'
    ? `const { ${imports.join(', ')} } = require('typegpu');`
    : `import { ${imports.join(', ')} } from 'typegpu';`;
}

/**
 * @param {Options} options
 */
function generateExports(options) {
  return options.moduleSyntax === 'commonjs'
    ? `\nmodule.exports = {${[...(options.declaredIdentifiers ?? [])].join(', ')}};`
    : '';
}

/**
 * @param {keyof Exclude<Options['usedImports'], undefined>} import_
 * @param {Options} options
 */
function setUseImport(import_, options) {
  if (options.usedImports === undefined) {
    options.usedImports = {};
  }

  options.usedImports[import_] = true;
}

export default main;
