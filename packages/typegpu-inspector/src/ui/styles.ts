export const NODE_WIDTH = 256;
export const NODE_GAP_X = 96;
export const NODE_GAP_Y = 28;
export const GRAPH_PADDING = 40;
export const THUMB_WIDTH = NODE_WIDTH - 2 * 12;
export const THUMB_MAX_HEIGHT = 160;
export const DETAIL_PREVIEW_WIDTH = 336;

export const STYLES = /* css */ `
:host {
  all: initial;
  --wi-bg: #0e1016;
  --wi-panel: #161923;
  --wi-panel-2: #1d2130;
  --wi-border: #2a2f3f;
  --wi-text: #e7e9f0;
  --wi-muted: #8d93a6;
  --wi-render: #7f8cff;
  --wi-compute: #4fd1a5;
  --wi-copy: #f0b35a;
  --wi-texture: #7f8cff;
  --wi-buffer: #f0b35a;
  --wi-accent: #8b7cff;
  --wi-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --wi-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-family: var(--wi-font);
  font-size: 13px;
  color: var(--wi-text);
  line-height: 1.4;
}

*, *::before, *::after { box-sizing: border-box; }

button {
  font: inherit;
  color: inherit;
  cursor: pointer;
  border: 1px solid var(--wi-border);
  background: var(--wi-panel-2);
  border-radius: 6px;
  padding: 6px 12px;
}
button:hover { border-color: var(--wi-muted); }
button:focus-visible { outline: 2px solid var(--wi-accent); outline-offset: 1px; }

.toggle {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 2147483000;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(14, 16, 22, 0.92);
  border: 1px solid var(--wi-border);
  color: var(--wi-text);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(6px);
  font-weight: 600;
}
.toggle:hover { border-color: var(--wi-accent); }
.toggle .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--wi-compute);
  box-shadow: 0 0 8px var(--wi-compute);
}
.toggle .stat {
  font-family: var(--wi-mono);
  font-weight: 400;
  color: var(--wi-muted);
}
.toggle.open { border-color: var(--wi-accent); }

.overlay {
  position: fixed;
  inset: 0;
  z-index: 2147482999;
  display: flex;
  flex-direction: column;
  background: var(--wi-bg);
  color: var(--wi-text);
}
.overlay[hidden] { display: none; }

.bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--wi-border);
  background: var(--wi-panel);
  flex: none;
}
.bar .brand { font-weight: 700; letter-spacing: 0.02em; }
.bar .stats {
  font-family: var(--wi-mono);
  color: var(--wi-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bar .spacer { flex: 1; }
.bar .hint { color: var(--wi-muted); font-size: 12px; }

.body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.graph-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: auto;
  background-image: radial-gradient(var(--wi-border) 1px, transparent 1px);
  background-size: 24px 24px;
}
.graph {
  position: relative;
  min-width: 100%;
  min-height: 100%;
}
.edges {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}
.edges path {
  fill: none;
  stroke-width: 2px;
  opacity: 0.85;
}
.edges path.texture { stroke: var(--wi-texture); }
.edges path.buffer { stroke: var(--wi-buffer); }
.edges path.mixed { stroke: var(--wi-muted); }

.empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--wi-muted);
  pointer-events: none;
}
.empty[hidden] { display: none; }

.node {
  position: absolute;
  width: ${NODE_WIDTH}px;
  background: var(--wi-panel);
  border: 1px solid var(--wi-border);
  border-radius: 10px;
  padding: 10px 12px 12px;
  cursor: pointer;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}
.node:hover { border-color: var(--wi-muted); }
.node.selected { border-color: var(--wi-accent); box-shadow: 0 0 0 2px rgba(139, 124, 255, 0.35); }
.node.render { border-top: 3px solid var(--wi-render); }
.node.compute { border-top: 3px solid var(--wi-compute); }
.node.copy { border-top: 3px solid var(--wi-copy); }

.node-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.badge {
  flex: none;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--wi-bg);
}
.badge.render { background: var(--wi-render); }
.badge.compute { background: var(--wi-compute); }
.badge.copy { background: var(--wi-copy); }
.title {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.title.unnamed { color: var(--wi-muted); font-style: italic; }

.node-stats {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
  font-family: var(--wi-mono);
  font-size: 12px;
  color: var(--wi-muted);
}
.node-stats .time { color: var(--wi-text); }
.node-stats .time.pending { color: var(--wi-muted); }

.thumbs { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.thumbs:empty { display: none; }
.thumb {
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--wi-border);
  background: #000;
}
.thumb canvas { display: block; width: 100%; height: auto; image-rendering: auto; }
.thumb .cap {
  padding: 4px 8px;
  font-family: var(--wi-mono);
  font-size: 11px;
  color: var(--wi-muted);
  background: var(--wi-panel-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.thumb .cap b { color: var(--wi-text); font-weight: 600; }

.details {
  flex: none;
  width: 380px;
  overflow: auto;
  border-left: 1px solid var(--wi-border);
  background: var(--wi-panel);
  padding: 16px 20px 32px;
}
.details[hidden] { display: none; }
.details h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  word-break: break-word;
}
.details .kind { color: var(--wi-muted); font-size: 12px; margin-top: 2px; }
.details h3 {
  margin: 20px 0 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--wi-muted);
}
.details .close-details {
  float: right;
  padding: 2px 8px;
  margin-left: 8px;
}
.details ul { list-style: none; margin: 0; padding: 0; }
.details li {
  padding: 6px 0;
  border-bottom: 1px solid var(--wi-border);
  display: grid;
  gap: 2px;
}
.details li .name { font-weight: 600; }
.details li .meta { font-family: var(--wi-mono); font-size: 11px; color: var(--wi-muted); }
.details .kv { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; font-family: var(--wi-mono); font-size: 12px; }
.details .kv dt { color: var(--wi-muted); }
.details .kv dd { margin: 0; }
.details .preview { margin-bottom: 12px; }
.details .preview canvas { max-width: 100%; }
.chip {
  display: inline-block;
  font-size: 10px;
  font-family: var(--wi-mono);
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid var(--wi-border);
  color: var(--wi-muted);
  margin-right: 4px;
}
.chip.texture { border-color: var(--wi-texture); color: var(--wi-texture); }
.chip.buffer { border-color: var(--wi-buffer); color: var(--wi-buffer); }
.spark {
  display: block;
  width: 100%;
  height: 40px;
  margin-top: 8px;
}
.spark polyline { fill: none; stroke: var(--wi-accent); stroke-width: 1.5; }
.spark line { stroke: var(--wi-border); stroke-width: 1; }

@media (max-width: 800px) {
  .details { width: 100%; position: absolute; inset: 0; top: 45px; }
}
`;
