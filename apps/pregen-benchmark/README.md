# pregen-benchmark

Compares shipping TypeGPU to the browser (shaders generated at runtime) against
shipping WGSL that was pregenerated at build time with `tgpu.resolve`.

Each example in `examples/<name>/` is two standalone Vite apps:

- `runtime/` – the docs example as written, bundling `typegpu`.
- `pregen/` – `shaders.ts` holds the shader-only TypeGPU code, which
  `scripts/pregen.ts` resolves into `generated.ts` (plain WGSL strings) at build
  time. The host code in `main.ts` uses the raw WebGPU API, so no TypeGPU code
  reaches the browser.

Both variants share `shared/controls.ts` (a minimal controls panel) and
`shared/bench.ts` (instrumentation read by the benchmark runner).

## Usage

```sh
pnpm --filter typegpu build      # the apps bundle the built package (dist/)
node scripts/build.ts [example]  # pregenerate WGSL and build every variant into dist/
node scripts/check.ts boids/runtime boids/pregen   # smoke test + screenshots in .scratch/
node scripts/bench.ts --label=mine [--runs=7] [--only=boids] [--profiles=desktop,mobile] [--variants=runtime,pregen]
node scripts/report.ts report.html baseline mine   # HTML report comparing two result files
```

`scripts/profile.ts` records a CPU profile of a single load, and `scripts/quick.ts`
prints load marks for fast iteration on TypeGPU itself.

The runner drives headless Chromium with WebGPU on SwiftShader (see
`scripts/chromium.ts`; set `CHROMIUM_PATH` to use another binary). GPU-side
timings are therefore slow and only meaningful as differences between variants.
