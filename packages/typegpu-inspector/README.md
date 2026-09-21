<div align="center">

# @typegpu/inspector

A drop-in inspector for any WebGPU app. Shows the render, compute and copy
passes of each frame as a graph, with intermediate results and GPU timings.

</div>

The inspector does not depend on TypeGPU. It works by observing the standard
WebGPU API: command encoders (and the passes begun on them) are wrapped in
Proxies, so any code that uses `device.createCommandEncoder()` is covered,
whether it is written with TypeGPU, three.js, or raw WebGPU.

## Usage

```ts
import { installWebGPUInspectorFromUrl } from '@typegpu/inspector';

// Installs the inspector when the page is opened with `?inspect` in the URL.
installWebGPUInspectorFromUrl('inspect');
```

Or unconditionally:

```ts
import { installWebGPUInspector } from '@typegpu/inspector';

const inspector = installWebGPUInspector({
  // All options are optional
  ui: true, // mount the floating button and the overlay
  open: false, // open the overlay right away
  snapshotIntervalMs: 500, // how often intermediate textures are copied while the overlay is open
  historyLength: 60, // how many timing samples to keep per pass
  requestTimestampQuery: true, // add `timestamp-query` to devices requested after installation
});

inspector.toggle(); // or .open() / .close()
inspector.session.latestFrame; // the captured data, also without the UI
inspector.uninstall();
```

Install the inspector **before** the app requests its `GPUDevice`, so that the
`timestamp-query` feature can be added to the device and textures can be made
copyable.

## What it shows

Once installed, a floating **Inspect** button appears in the bottom left
corner of the page. It toggles a full-page overlay that shows the most recent
frame (everything submitted between two animation frames):

- **A graph of passes.** Each render, compute and copy operation is a node.
  An edge from A to B means that B used a resource that A was the last to
  write to: color and depth attachments, storage buffers and textures, vertex
  and index buffers, copy sources and destinations.
- **Intermediate results.** While the overlay is open, the color, depth and
  storage textures written by each pass are copied right after the pass ends
  and shown as thumbnails on the node. Multisampled and depth textures are
  supported (depth is shown as `(1 - depth)^0.25`, so that the far plane is
  black and closer surfaces are brighter). Textures that cannot be copied
  (e.g. ones created before the inspector was installed) are skipped. Since
  copies are recorded while a frame is being encoded, an app that only
  renders on demand shows thumbnails once it renders again with the overlay
  open.
- **GPU timings.** Timestamp queries are attached to every pass automatically
  and resolved after each submission. Passes that already carry their own
  `timestampWrites` are read as well. The node shows the last measurement,
  the details panel also shows the average, min and max over recent frames.
- **Details.** Clicking a node lists its attachments (with load/store ops),
  draw or dispatch counts, pipelines, bind groups, and all resources it read
  or wrote.

The **Pause** button freezes the displayed frame while the app keeps running.

## How it works

- `GPUAdapter.prototype.requestDevice` adds `timestamp-query` to the required
  features when the adapter supports it.
- `GPUDevice.prototype.createTexture` and `GPUCanvasContext.prototype.configure`
  add `COPY_SRC` to render attachments and storage textures, so that their
  contents can be snapshotted.
- `GPUDevice.prototype.createCommandEncoder` returns a Proxy around the real
  encoder. The Proxy observes `beginRenderPass`, `beginComputePass`, the copy
  commands and `finish`, and wraps pass encoders in Proxies of their own to
  count draws and dispatches and to track bind groups and vertex buffers.
- `GPUQueue.prototype.submit` groups the submitted passes into frames and
  kicks off the timestamp readback.

The inspector's own GPU work (snapshot copies, timestamp resolves, thumbnail
rendering) is done through the original, un-patched functions, so it never
shows up in the graph.
