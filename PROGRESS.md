# JavaScript functionality in TypeGPU functions

This document tracks the effort of completing the set of JavaScript functionality that can be
used inside TypeGPU functions (`'use gpu'`). It lists what was missing, in what order it was
tackled, which package each change landed in, and every decision made about how a JavaScript
construct is mapped onto WGSL (and GLSL, via `@typegpu/gl`).

## Guiding principles

- **Output WGSL should read like the input JavaScript.** No runtime constructs (helper functions,
  temporaries, wrapper blocks) are introduced unless the WGSL grammar leaves no other option.
- **WGSL constructs should be expressible from JavaScript, not restricted.** If WGSL has a
  construct (e.g. `switch`, `loop`/`continuing`), the natural JavaScript spelling of it should work.
- **Changes live in the package that owns the semantics:**
  - `tinyest` — the syntax tree. Only grows when a JS construct has no faithful desugaring.
  - `tinyest-for-wgsl` — JS → tinyest. Owns purely syntactic desugarings (things that are
    *the same JS program written differently*) and rejects JS that has no meaning in a shader.
  - `typegpu` (`WgslGenerator`) — tinyest → WGSL. Owns typing rules and the JS → WGSL mapping.
  - `@typegpu/gl` (`GlslGenerator`) — overrides only where GLSL differs from WGSL, and throws an
    "unsupported" error where GLSL cannot express a construct.

## How the gaps were found

- Every ESTree / Babel node type was checked against `tinyest-for-wgsl`'s transpiler tables
  (anything not listed throws `Unsupported JS functionality: <NodeType>`).
- Every operator in `tinyest`'s operator unions was checked against `WgslGenerator`
  (the `OP_MAP` getters and the codegen tables).
- The WGSL statement grammar (`switch`, `loop`/`continuing`/`break if`, `discard`, ...) was
  checked for constructs with no JavaScript spelling.
- Suspicious paths were exercised with throwaway resolutions to find codegen bugs.

## Ordered gap list

Sorted by (1) how faithfully the construct maps to WGSL and (2) how little the generation
pipeline has to change. Items near the top are near-1:1 and touch one package; items near the
bottom need a new tinyest node and touch all three.

| # | JavaScript | WGSL mapping | GLSL mapping | Package(s) | Status |
|---|---|---|---|---|---|
| 1 | Empty statement `;` | nothing emitted | nothing emitted | tinyest-for-wgsl | planned |
| 2 | Prefix update `++i` / `--i` (statement) | `i++;` / `i--;` | `++i;` / `--i;` | tinyest-for-wgsl, typegpu, @typegpu/gl | planned |
| 3 | Bitwise complement `~x` | `~x` (validated to integers, folded at comptime) | same | typegpu | planned |
| 4 | Exponentiation assignment `a **= b` | `a = pow(a, b);` | same | typegpu | planned |
| 5 | Logical assignment `a &&= b` / `a \|\|= b` | `a = (a && b);` / `a = (a \|\| b);` | same | typegpu | planned |
| 6 | Multiple declarators `let a = 1, b = 2;` | two declarations | same | tinyest-for-wgsl | planned |
| 7 | Destructuring declarations `const { x, y } = v;` / `const [a, b] = arr;` | `let x = v.x; let y = v.y;` / `let a = arr[0]; ...` | same | tinyest-for-wgsl | planned |
| 8 | `do { } while (cond);` | `loop { ... continuing { break if !(cond); } }` | `do { } while (cond);` | tinyest, tinyest-for-wgsl, typegpu, @typegpu/gl | planned |
| 9 | `switch` | `switch x { case 1, 2: { } default: { } }` | `switch (x) { case 1: case 2: { ... break; } default: { } }` | tinyest, tinyest-for-wgsl, typegpu, @typegpu/gl | planned |
| 10 | Template literals in `console.log` | interleaved string/value log arguments | n/a (`console.log` unsupported in GLSL) | tinyest, tinyest-for-wgsl, typegpu | planned |

Bugs discovered while surveying the generator, fixed in their own commits placed **below** the
functionality commits in the branch history:

| Bug | Before | After | Status |
|---|---|---|---|
| Assignment used as an expression (`a = b = 3`, `if ((a = 2) === 2)`) | Emitted invalid WGSL (`a = b = 3i;`, `(a = 2i == 2i)`) | Descriptive error: assignments are statements in WGSL | planned |
| Unary plus `+x` | Emitted `+x`, which WGSL does not have | Emits the operand itself (`x`), validated to be numeric, folded at comptime | planned |
| `typeof x`, `delete x` | Emitted `typeofx` / `deletex` | Descriptive "unsupported operator" error | planned |

## Decisions and limitations, per item

### 1. Empty statements

- `;` on its own (e.g. `for (;;);`, a stray semicolon) is transpiled to an empty block `[block, []]`.
  Both generators already emit nothing for an empty block, so no output is produced.
- **Package:** `tinyest-for-wgsl`, because an empty statement is *syntactically* nothing.

### 2. Prefix update statements

- `++i;` and `--i;` are accepted as statements (including in `for` update clauses). WGSL only has
  postfix increment/decrement statements, so `++i;` is emitted as `i++;`. GLSL supports both forms,
  so `GlslGenerator` keeps the prefix spelling to stay closest to the input.
- Update expressions (prefix or postfix) used as *values* (`arr[i++]`, `x = ++i`) remain
  unsupported: WGSL has no increment expressions and desugaring would require temporaries.
- **Packages:** `tinyest-for-wgsl` stops rejecting the syntax and emits the existing `preUpdate`
  node; `typegpu` maps the statement; `@typegpu/gl` overrides the spelling.

### 3. Bitwise complement

- `~x` requires an integer or an integer vector operand (WGSL rule). Floats produce a type error
  at resolution time instead of a WGSL compiler error later.
- When the operand is known at comptime, the result is folded (e.g. `~5` becomes `-6`).
- **Package:** `typegpu` (typing rule).

### 4. Exponentiation assignment

- `a **= b` is treated exactly like `a = a ** b`, i.e. `a = pow(a, b);` — the same mapping that
  `**` already uses. Only valid as a statement, like every other assignment.
- **Package:** `typegpu`.

### 5. Logical assignment

- `a &&= b` → `a = (a && b);`, `a ||= b` → `a = (a || b);`. Both operands must be `bool`.
  JavaScript's short-circuit semantics are preserved because WGSL's `&&`/`||` short-circuit too.
- `a ??= b` stays unsupported: there is no `null`/`undefined` in WGSL.
- **Package:** `typegpu`.

### 6. Multiple declarators

- `let a = 1, b = 2;` is split into `let a = 1; let b = 2;` when it appears in a statement list.
- In a `for` initializer (`for (let i = 0, j = 0; ...)`) it is rejected: WGSL's `for` allows a
  single initializer statement and hoisting `j` outside the loop would change its scope.
- **Package:** `tinyest-for-wgsl` — same program, different spelling.

### 7. Destructuring declarations

- Object patterns: `const { x, y: py } = v;` → `const x = v.x; const py = v.y;`
- Array patterns: `const [a, , b] = arr;` → `const a = arr[0]; const b = arr[2];`
- Nested patterns work recursively; the intermediate value is hoisted (see below).
- When the right-hand side is an identifier or a plain member chain (`a.b.c`), the accesses are
  emitted directly on it, so no temporary appears in the output.
- Otherwise (a call, an index access, an arithmetic expression, ...) the right-hand side would be
  evaluated once per destructured name, changing semantics for side-effectful expressions and
  wasting work otherwise. It is hoisted into a `const` first. The temporary is named
  `#destructured` in the tree (not a valid JS identifier, so it cannot shadow user code) and is
  emitted as `destructured` in WGSL (the generator strips invalid characters and de-duplicates).
- Default values (`const { x = 1 } = v`) and rest elements (`const [a, ...rest] = arr`) are
  rejected: the first needs `undefined`, the second needs slices, neither exists in WGSL.
- Destructuring in `for...of` heads is rejected for now.
- **Package:** `tinyest-for-wgsl` — a purely syntactic desugaring.

### 8. `do...while`

- New tinyest node `doWhile: [type, body, condition]`.
- WGSL has no `do...while`, but its `loop` statement with a `continuing` block is the exact
  equivalent: the body runs first, `continue` jumps to the `continuing` block, and `break if`
  evaluates the condition after every iteration.
  ```wgsl
  loop {
    <body>
    continuing {
      break if !(<cond>);
    }
  }
  ```
  When the condition is known at comptime, `do {} while (false)` is emitted as `loop { <body> break; }`
  (a "run once" loop) and `do {} while (true)` as `loop { <body> }`.
- GLSL ES 3.0 has `do { } while (cond);` natively, so `GlslGenerator` emits it verbatim.
- **Packages:** all three (`tinyest` node, `tinyest-for-wgsl` transpile, generators).

### 9. `switch`

- New tinyest node `switch: [type, discriminant, cases]` with `cases: [test | null, body[]][]`
  (`null` test = `default`), mirroring ESTree so tinyest stays a JS tree; the WGSL-specific
  shaping happens in the generator.
- Mapping rules (`WgslGenerator`):
  - Consecutive cases with empty bodies are merged into one WGSL clause with multiple selectors:
    `case 1: case 2: { ... }` → `case 1, 2: { ... }`. `default` can take part in a merge
    (`case 1, default:`).
  - A trailing `break;` at the end of a case body is dropped (WGSL clauses never fall through).
  - A non-empty case body that does *not* end in `break`, `return`, or `continue` is a
    fallthrough in JavaScript. WGSL has no fallthrough (the keyword was removed from the spec),
    so this is rejected with an error asking for an explicit `break`.
  - WGSL requires exactly one `default` clause; a `switch` without one gets `default: {}` appended.
  - The discriminant must be `i32` or `u32` (abstract ints are concretized to `i32`). Case
    selectors must be known at comptime and are converted to the discriminant's type.
  - `break` inside a `switch` breaks the `switch`, also when the `switch` sits in an unrolled
    loop (the unroll guard only rejects `break`s that target the loop). `continue` inside a
    `switch` inside a loop continues the loop, as in JavaScript.
- GLSL ES 3.0 has `switch` with fallthrough, so `GlslGenerator` emits one label per selector
  followed by the block and an explicit `break;` when the body does not already end in control flow.
- **Packages:** all three.

### 10. Template literals

- New tinyest node `templateLiteral: [type, quasis, expressions]`.
- WGSL has no strings; the only place strings already mean something in TypeGPU functions is
  `console.log` (string literal arguments are recorded as format text). A template literal
  passed to `console.log` is split into its parts: `` console.log(`x=${x}, y=${y}`) `` becomes
  `console.log('x=', x, ', y=', y)`. Empty text parts are dropped.
- Anywhere else a template literal is rejected with a descriptive error.
- Tagged templates are rejected.
- **Packages:** `tinyest`, `tinyest-for-wgsl`, `typegpu`.

## Intentionally unsupported (with reasons)

| JavaScript | Reason |
|---|---|
| `var` declarations | Function-scope hoisting has no WGSL counterpart; mapping to `var` would silently change scoping. Use `let`/`const`. |
| Uninitialised declarations `let x;` | WGSL needs a type; JavaScript has none at runtime. Write `let x = d.f32();`. |
| Assignment / update as an expression | WGSL assignments are statements. |
| `==` / `!=` | Existing policy: the generator asks for `===` / `!==` (WGSL `==` has strict semantics). |
| `??`, `??=`, optional chaining `?.` | No `null`/`undefined` in WGSL. |
| `in`, `instanceof`, `typeof`, `delete`, `new` | No runtime type information or dynamic objects in WGSL. |
| Labeled statements, `break label` | WGSL has no labels. |
| `for...in` | Iterates object keys; no dynamic objects in WGSL. |
| Sequence expressions `(a, b)` | No WGSL equivalent; rejected to keep `for` update clauses single-statement. |
| Nested functions, arrow functions, closures | WGSL has no nested functions. Define them at module level with `'use gpu'`. |
| `throw`, `try`/`catch` | No exceptions in WGSL. |
| Spread `[...a]`, object spread, rest elements | Needs dynamic sizes; arrays are fixed-size in WGSL. |
| Object methods `{ f() {} }` | Structs have no methods in WGSL. |
| Regular expressions, `BigInt` | Not representable (BigInt is narrowed to a number with a warning). |
| `switch` fallthrough | Removed from WGSL; requires an explicit `break`. |
| Multiple declarators in `for` initializers | WGSL allows one initializer statement. |
| `debugger`, `with`, classes, generators, `async`/`await` | No meaning in a shader. |

## WGSL constructs and their JavaScript spelling

| WGSL | JavaScript |
|---|---|
| `switch` | `switch` (see item 9) |
| `loop { ... continuing { break if c; } }` | `do { ... } while (!c);` (see item 8) |
| `loop { ... }` | `while (true) { ... }` |
| `for`, `while`, `break`, `continue` | same |
| `var`/`let`/`const` | inferred from `let`/`const` and mutation analysis |
| `discard` | `std.discard()` |
| `select(f, t, cond)` | `cond ? t : f` (value-only branches) or `std.select` |
| `ptr` arguments | `d.ptrFn(...)` / `d.ref` |
| `~`, `!`, `-` | same |
| `<<`, `>>` (signed) | `<<`, `>>` |
| `>>` on `u32` | `>>>` |
| `pow` | `**` / `**=` / `Math.pow` |
