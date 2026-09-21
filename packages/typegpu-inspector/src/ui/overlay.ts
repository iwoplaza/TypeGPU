import { getFormatInfo } from '../formats.ts';
import { buildPassGraph, type PassGraph } from '../graph.ts';
import type { InspectorSession, SessionEvent } from '../session.ts';
import type { FrameRecord, PassRecord, ResourceUse, Snapshot } from '../types.ts';
import { average, describeResource, formatCount, formatMs, pluralize } from './format.ts';
import { TexturePreviewer } from './preview.ts';
import {
  DETAIL_PREVIEW_WIDTH,
  GRAPH_PADDING,
  NODE_GAP_X,
  NODE_GAP_Y,
  NODE_WIDTH,
  STYLES,
  THUMB_MAX_HEIGHT,
  THUMB_WIDTH,
} from './styles.ts';

export interface InspectorOverlay {
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  toggle(): void;
  destroy(): void;
}

interface NodeView {
  readonly root: HTMLDivElement;
  readonly time: HTMLSpanElement;
  readonly stats: HTMLSpanElement;
  readonly thumbs: HTMLDivElement;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function fit(width: number, height: number, maxWidth: number, maxHeight: number): [number, number] {
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

function kindLabel(pass: PassRecord): string {
  switch (pass.kind) {
    case 'render':
      return 'Render pass';
    case 'compute':
      return 'Compute pass';
    case 'copy':
      return 'Copy';
  }
}

function workSummary(pass: PassRecord): string {
  switch (pass.kind) {
    case 'render': {
      const parts = [pluralize(pass.draws, 'draw')];
      if (pass.vertices > 0) {
        parts.push(`${formatCount(pass.vertices)} verts`);
      }
      if (pass.bundles > 0) {
        parts.push(pluralize(pass.bundles, 'bundle'));
      }
      return parts.join(' · ');
    }
    case 'compute': {
      const parts = [pluralize(pass.dispatches, 'dispatch', 'dispatches')];
      if (pass.workgroups > 0) {
        parts.push(`${formatCount(pass.workgroups)} wg`);
      }
      return parts.join(' · ');
    }
    case 'copy': {
      const src = pass.reads[0]?.resource.label ?? '?';
      const dst = pass.writes[0]?.resource.label ?? '?';
      return `${src} → ${dst}`;
    }
  }
}

function snapshotCaption(snapshot: Snapshot): string {
  const extras = [
    snapshot.sampleCount > 1 ? `${snapshot.sampleCount}×` : undefined,
    snapshot.mipLevel > 0 ? `mip ${snapshot.mipLevel}` : undefined,
    snapshot.arrayLayer > 0 ? `layer ${snapshot.arrayLayer}` : undefined,
  ].filter(Boolean);
  return [snapshot.format, `${snapshot.width}×${snapshot.height}`, ...extras].join(' · ');
}

class Overlay implements InspectorOverlay {
  readonly #session: InspectorSession;
  readonly #host: HTMLDivElement;
  readonly #toggle: HTMLButtonElement;
  readonly #toggleStat: HTMLSpanElement;
  readonly #overlay: HTMLDivElement;
  readonly #stats: HTMLDivElement;
  readonly #pauseButton: HTMLButtonElement;
  readonly #graphWrap: HTMLDivElement;
  readonly #graph: HTMLDivElement;
  readonly #edges: SVGSVGElement;
  readonly #nodes: HTMLDivElement;
  readonly #empty: HTMLDivElement;
  readonly #details: HTMLElement;
  readonly #previewers = new WeakMap<GPUDevice, TexturePreviewer>();
  readonly #unsubscribe: () => void;

  #isOpen = false;
  #frame: FrameRecord | undefined;
  #graphData: PassGraph | undefined;
  #structureKey = '';
  #nodeViews: NodeView[] = [];
  #selected: number | undefined;
  #detailTiming: HTMLDListElement | undefined;
  #detailSpark: SVGSVGElement | undefined;

  constructor(session: InspectorSession) {
    this.#session = session;

    this.#host = el('div');
    this.#host.setAttribute('data-webgpu-inspector', '');
    const shadow = this.#host.attachShadow({ mode: 'open' });
    const style = el('style');
    style.textContent = STYLES;

    // Floating toggle button
    this.#toggle = el('button', 'toggle');
    this.#toggle.type = 'button';
    this.#toggle.setAttribute('aria-label', 'Toggle WebGPU inspector');
    this.#toggle.title = 'Toggle WebGPU inspector';
    this.#toggleStat = el('span', 'stat', '');
    this.#toggle.append(el('span', 'dot'), el('span', undefined, 'Inspect'), this.#toggleStat);
    this.#toggle.addEventListener('click', () => this.toggle());

    // Overlay
    this.#overlay = el('div', 'overlay');
    this.#overlay.hidden = true;

    const bar = el('header', 'bar');
    this.#stats = el('div', 'stats', 'Waiting for a frame…');
    this.#pauseButton = el('button', 'btn', 'Pause');
    this.#pauseButton.type = 'button';
    this.#pauseButton.addEventListener('click', () => this.#togglePause());
    const closeButton = el('button', 'btn', 'Close');
    closeButton.type = 'button';
    closeButton.addEventListener('click', () => this.close());
    bar.append(
      el('div', 'brand', 'WebGPU Inspector'),
      this.#stats,
      el('div', 'spacer'),
      el('span', 'hint', 'Click a pass for details · Esc closes'),
      this.#pauseButton,
      closeButton,
    );

    const body = el('div', 'body');
    this.#graphWrap = el('div', 'graph-wrap');
    this.#graph = el('div', 'graph');
    this.#edges = document.createElementNS(SVG_NS, 'svg');
    this.#edges.setAttribute('class', 'edges');
    this.#nodes = el('div', 'nodes');
    this.#empty = el('div', 'empty', 'Waiting for GPU work to be submitted…');
    this.#graph.append(this.#edges, this.#nodes);
    this.#graphWrap.append(this.#graph, this.#empty);

    this.#details = el('aside', 'details');
    this.#details.hidden = true;

    body.append(this.#graphWrap, this.#details);
    this.#overlay.append(bar, body);

    shadow.append(style, this.#toggle, this.#overlay);
    document.body.append(this.#host);

    this.#unsubscribe = session.subscribe((event, frame) => this.#onSessionEvent(event, frame));
  }

  get isOpen(): boolean {
    return this.#isOpen;
  }

  open(): void {
    if (this.#isOpen) {
      return;
    }
    this.#isOpen = true;
    this.#overlay.hidden = false;
    this.#toggle.classList.add('open');
    this.#session.snapshotsEnabled = true;
    document.addEventListener('keydown', this.#onKeyDown);
    const latest = this.#session.latestFrame;
    if (latest) {
      this.#render(latest);
    }
  }

  close(): void {
    if (!this.#isOpen) {
      return;
    }
    this.#isOpen = false;
    this.#overlay.hidden = true;
    this.#toggle.classList.remove('open');
    this.#session.snapshotsEnabled = false;
    document.removeEventListener('keydown', this.#onKeyDown);
  }

  toggle(): void {
    if (this.#isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  destroy(): void {
    this.close();
    this.#unsubscribe();
    this.#host.remove();
  }

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  };

  #togglePause(): void {
    this.#session.paused = !this.#session.paused;
    this.#pauseButton.textContent = this.#session.paused ? 'Resume' : 'Pause';
  }

  #onSessionEvent(event: SessionEvent, frame: FrameRecord): void {
    this.#updateToggleStat(frame);
    if (!this.#isOpen) {
      return;
    }
    if (event === 'timing') {
      if (frame === this.#frame) {
        this.#updateTimings(frame);
      }
      return;
    }
    this.#render(frame);
  }

  #previewerFor(device: GPUDevice | undefined): TexturePreviewer | undefined {
    if (!device) {
      return undefined;
    }
    let previewer = this.#previewers.get(device);
    if (!previewer) {
      previewer = new TexturePreviewer(device, this.#session.native);
      this.#previewers.set(device, previewer);
      device.lost
        .then(() => {
          this.#previewers.delete(device);
        })
        .catch(() => {});
    }
    return previewer;
  }

  // ----- Rendering -----

  #render(frame: FrameRecord): void {
    this.#frame = frame;
    const graph = buildPassGraph(frame.passes);
    this.#graphData = graph;
    this.#empty.hidden = frame.passes.length > 0;

    const structureChanged = graph.structureKey !== this.#structureKey;
    if (structureChanged) {
      this.#structureKey = graph.structureKey;
      this.#rebuildNodes(graph);
      if (this.#selected !== undefined && this.#selected >= graph.nodes.length) {
        this.#selected = undefined;
      }
    }

    this.#updateTimings(frame);

    if (frame.hasSnapshots) {
      this.#updateThumbnails(frame);
    }
    if (structureChanged || frame.hasSnapshots) {
      this.#renderDetails();
    }

    this.#layout();
  }

  #rebuildNodes(graph: PassGraph): void {
    this.#nodeViews = graph.nodes.map((node) => {
      const { pass } = node;
      const root = el('div', `node ${pass.kind}`);
      root.dataset.index = String(node.index);
      root.setAttribute('role', 'button');
      root.tabIndex = 0;

      const head = el('div', 'node-head');
      const title = el('span', pass.label ? 'title' : 'title unnamed', pass.label || 'unnamed');
      title.title = pass.label || 'unnamed';
      head.append(el('span', `badge ${pass.kind}`, pass.kind), title);

      const stats = el('div', 'node-stats');
      const time = el('span', 'time', '');
      const work = el('span', undefined, '');
      stats.append(time, work);

      const thumbs = el('div', 'thumbs');
      root.append(head, stats, thumbs);

      const select = () => this.#select(node.index);
      root.addEventListener('click', select);
      root.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select();
        }
      });

      return { root, time, stats: work, thumbs };
    });
    this.#nodes.replaceChildren(...this.#nodeViews.map((view) => view.root));
    this.#applySelection();
  }

  #updateTimings(frame: FrameRecord): void {
    let total = 0;
    let pending = false;
    let anyTimed = false;

    frame.passes.forEach((pass, i) => {
      const view = this.#nodeViews[i];
      const time = this.#effectiveTime(pass);
      if (view) {
        view.time.textContent = this.#timeLabel(pass);
        view.time.classList.toggle('pending', time === undefined);
        view.stats.textContent = workSummary(pass);
      }
      if (time !== undefined) {
        total += time;
        anyTimed = true;
      } else if (pass.timing === 'pending') {
        pending = true;
      }
    });

    const parts = [`Frame #${frame.index}`, pluralize(frame.passes.length, 'pass', 'passes')];
    if (anyTimed) {
      parts.push(`GPU ${formatMs(total)}`);
    } else if (pending) {
      parts.push('GPU …');
    } else if (frame.passes.length > 0) {
      parts.push('GPU timing unavailable');
    }
    if (this.#session.paused) {
      parts.push('paused');
    }
    this.#stats.textContent = parts.join(' · ');

    this.#updateDetailTiming();
  }

  /**
   * The GPU time to display for a pass. While the newest measurement is still
   * being read back, the previous measurement of the same pass is shown, so
   * that numbers do not flicker at high frame rates.
   */
  #effectiveTime(pass: PassRecord): number | undefined {
    if (pass.timing === 'ready') {
      return pass.gpuTime;
    }
    if (pass.timing === 'pending') {
      return this.#session.getTimingHistory(pass).at(-1);
    }
    return undefined;
  }

  #timeLabel(pass: PassRecord): string {
    const time = this.#effectiveTime(pass);
    if (time !== undefined) {
      return formatMs(time);
    }
    switch (pass.timing) {
      case 'pending':
        return '…';
      default:
        return pass.kind === 'copy' ? '' : 'n/a';
    }
  }

  #updateToggleStat(frame: FrameRecord): void {
    let total = 0;
    let any = false;
    for (const pass of frame.passes) {
      const time = this.#effectiveTime(pass);
      if (time !== undefined) {
        total += time;
        any = true;
      }
    }
    this.#toggleStat.textContent = any ? formatMs(total) : `${frame.passes.length}p`;
  }

  #updateThumbnails(frame: FrameRecord): void {
    const previewer = this.#previewerFor(frame.device);
    frame.passes.forEach((pass, i) => {
      const view = this.#nodeViews[i];
      if (!view) {
        return;
      }
      const thumbs: HTMLElement[] = [];
      for (const snapshot of pass.snapshots) {
        const thumb = this.#createThumb(previewer, snapshot, THUMB_WIDTH, THUMB_MAX_HEIGHT);
        if (thumb) {
          thumbs.push(thumb);
        }
      }
      if (thumbs.length > 0 || pass.snapshots.length === 0) {
        view.thumbs.replaceChildren(...thumbs);
      }
    });
  }

  #createThumb(
    previewer: TexturePreviewer | undefined,
    snapshot: Snapshot,
    maxWidth: number,
    maxHeight: number,
  ): HTMLElement | undefined {
    if (!previewer || !TexturePreviewer.canPreview(snapshot)) {
      return undefined;
    }
    const [width, height] = fit(snapshot.width, snapshot.height, maxWidth, maxHeight);
    const canvas = el('canvas');
    if (!previewer.drawInto(canvas, snapshot, width, height)) {
      return undefined;
    }
    const thumb = el('div', 'thumb');
    const caption = el('div', 'cap');
    const role = el('b', undefined, `${snapshot.role} `);
    caption.append(role, document.createTextNode(snapshotCaption(snapshot)));
    caption.title = `${snapshot.source.label} — ${snapshotCaption(snapshot)}${
      getFormatInfo(snapshot.format).hasDepth ? ' (shown as (1 - depth)^0.25)' : ''
    }`;
    thumb.append(canvas, caption);
    return thumb;
  }

  #layout(): void {
    const graph = this.#graphData;
    if (!graph) {
      return;
    }

    // Measure
    const heights = this.#nodeViews.map((view) => view.root.offsetHeight);
    const columnHeights: number[] = [];
    for (const node of graph.nodes) {
      const h = heights[node.index] ?? 0;
      columnHeights[node.layer] = (columnHeights[node.layer] ?? 0) + h + NODE_GAP_Y;
    }
    const maxColumn = Math.max(0, ...columnHeights.map((h) => h - NODE_GAP_Y));

    // Position, centering each column vertically
    const cursors: number[] = [];
    const positions: { x: number; y: number; h: number }[] = [];
    for (const node of graph.nodes) {
      const h = heights[node.index] ?? 0;
      const columnHeight = (columnHeights[node.layer] ?? NODE_GAP_Y) - NODE_GAP_Y;
      const offset = (maxColumn - columnHeight) / 2;
      const y = GRAPH_PADDING + offset + (cursors[node.layer] ?? 0);
      const x = GRAPH_PADDING + node.layer * (NODE_WIDTH + NODE_GAP_X);
      cursors[node.layer] = (cursors[node.layer] ?? 0) + h + NODE_GAP_Y;
      positions[node.index] = { x, y, h };
      const view = this.#nodeViews[node.index];
      if (view) {
        view.root.style.left = `${x}px`;
        view.root.style.top = `${y}px`;
      }
    }

    const width =
      GRAPH_PADDING * 2 +
      graph.layerCount * NODE_WIDTH +
      Math.max(0, graph.layerCount - 1) * NODE_GAP_X;
    const height = GRAPH_PADDING * 2 + maxColumn;
    this.#graph.style.width = `${width}px`;
    this.#graph.style.height = `${height}px`;
    this.#edges.setAttribute('width', String(width));
    this.#edges.setAttribute('height', String(height));

    // Edges
    const paths: SVGElement[] = [];
    for (const edge of graph.edges) {
      const from = positions[edge.from];
      const to = positions[edge.to];
      if (!from || !to) {
        continue;
      }
      const x1 = from.x + NODE_WIDTH;
      const y1 = from.y + from.h / 2;
      const x2 = to.x;
      const y2 = to.y + to.h / 2;
      const bend = Math.max(24, (x2 - x1) / 2);
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`);
      const kinds = new Set(edge.resources.map((r) => r.kind));
      path.setAttribute('class', kinds.size === 1 ? ([...kinds][0] ?? 'mixed') : 'mixed');
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = edge.resources.map((r) => r.label).join(', ');
      path.append(title);
      paths.push(path);
    }
    this.#edges.replaceChildren(...paths);
  }

  // ----- Details -----

  #select(index: number): void {
    this.#selected = this.#selected === index ? undefined : index;
    this.#applySelection();
    this.#renderDetails();
  }

  #applySelection(): void {
    this.#nodeViews.forEach((view, i) => {
      view.root.classList.toggle('selected', i === this.#selected);
    });
  }

  #renderDetails(): void {
    const frame = this.#frame;
    const index = this.#selected;
    const pass = index === undefined ? undefined : frame?.passes[index];
    if (!frame || !pass || index === undefined) {
      this.#details.hidden = true;
      this.#details.replaceChildren();
      this.#detailTiming = undefined;
      this.#detailSpark = undefined;
      return;
    }

    const closeButton = el('button', 'close-details', '✕');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Close details');
    closeButton.addEventListener('click', () => {
      this.#selected = undefined;
      this.#applySelection();
      this.#renderDetails();
    });

    const children: (HTMLElement | SVGElement)[] = [
      closeButton,
      el('h2', undefined, pass.label || 'unnamed'),
      el('div', 'kind', `${kindLabel(pass)} · #${index + 1} of ${frame.passes.length}`),
    ];

    if (pass.kind !== 'copy') {
      children.push(el('h3', undefined, 'GPU time'));
      this.#detailTiming = el('dl', 'kv');
      this.#detailSpark = document.createElementNS(SVG_NS, 'svg');
      this.#detailSpark.setAttribute('class', 'spark');
      this.#detailSpark.setAttribute('viewBox', '0 0 300 40');
      this.#detailSpark.setAttribute('preserveAspectRatio', 'none');
      children.push(this.#detailTiming, this.#detailSpark);
    }

    if (pass.snapshots.length > 0) {
      children.push(el('h3', undefined, 'Outputs'));
      const previewer = this.#previewerFor(frame.device);
      for (const snapshot of pass.snapshots) {
        const preview = this.#createThumb(
          previewer,
          snapshot,
          DETAIL_PREVIEW_WIDTH,
          DETAIL_PREVIEW_WIDTH,
        );
        if (preview) {
          preview.classList.add('preview');
          children.push(preview);
        }
      }
    }

    if (pass.attachments.length > 0) {
      children.push(el('h3', undefined, 'Attachments (load / store)'));
      const list = el('ul');
      for (const attachment of pass.attachments) {
        const item = el('li');
        item.append(el('span', 'meta', attachment));
        list.append(item);
      }
      children.push(list);
    }

    if (pass.kind !== 'copy') {
      children.push(el('h3', undefined, 'Work'));
      const work = el('dl', 'kv');
      const rows: [string, string][] =
        pass.kind === 'render'
          ? [
              ['draws', formatCount(pass.draws)],
              ['vertices', formatCount(pass.vertices)],
              ['instances', formatCount(pass.instances)],
              ['bundles', formatCount(pass.bundles)],
            ]
          : [
              ['dispatches', formatCount(pass.dispatches)],
              ['workgroups', formatCount(pass.workgroups)],
            ];
      rows.push(['pipelines', pass.pipelines.join(', ') || '—']);
      rows.push(['bind groups', pass.bindGroups.join(', ') || '—']);
      for (const [key, value] of rows) {
        work.append(el('dt', undefined, key), el('dd', undefined, value));
      }
      children.push(work);
    }

    children.push(
      el('h3', undefined, `Reads (${pass.reads.length})`),
      this.#resourceList(pass.reads),
    );
    children.push(
      el('h3', undefined, `Writes (${pass.writes.length})`),
      this.#resourceList(pass.writes),
    );

    this.#details.replaceChildren(...children);
    this.#details.hidden = false;
    this.#updateDetailTiming();
  }

  #resourceList(uses: readonly ResourceUse[]): HTMLElement {
    const list = el('ul');
    if (uses.length === 0) {
      const item = el('li');
      item.append(el('span', 'meta', 'none'));
      list.append(item);
      return list;
    }
    for (const use of uses) {
      const item = el('li');
      const name = el('div', 'name');
      name.append(
        el('span', `chip ${use.resource.kind}`, use.resource.kind),
        document.createTextNode(use.resource.label),
      );
      const meta = [describeResource(use.resource), use.role, use.slot, use.details]
        .filter(Boolean)
        .join(' · ');
      item.append(name, el('div', 'meta', meta));
      list.append(item);
    }
    return list;
  }

  #updateDetailTiming(): void {
    const frame = this.#frame;
    const index = this.#selected;
    const pass = index === undefined ? undefined : frame?.passes[index];
    const dl = this.#detailTiming;
    if (!pass || !dl) {
      return;
    }

    const history = this.#session.getTimingHistory(pass);
    const avg = average(history);
    const rows: [string, string][] = [
      ['last', this.#timeLabel(pass) || '—'],
      ['average', avg === undefined ? '—' : `${formatMs(avg)} (${history.length} samples)`],
      ['min', history.length ? formatMs(Math.min(...history)) : '—'],
      ['max', history.length ? formatMs(Math.max(...history)) : '—'],
      [
        'source',
        pass.ownTimestamps ? "the app's own timestamp writes" : 'injected timestamp writes',
      ],
    ];
    if (pass.timing === 'unavailable') {
      rows.push(['note', 'timestamp-query is not enabled on this device']);
    }
    dl.replaceChildren();
    for (const [key, value] of rows) {
      dl.append(el('dt', undefined, key), el('dd', undefined, value));
    }

    const spark = this.#detailSpark;
    if (spark) {
      spark.replaceChildren();
      if (history.length > 1) {
        const max = Math.max(...history) || 1;
        const points = history
          .map((v, i) => `${(i / (history.length - 1)) * 300},${40 - (v / max) * 36 - 2}`)
          .join(' ');
        const baseline = document.createElementNS(SVG_NS, 'line');
        baseline.setAttribute('x1', '0');
        baseline.setAttribute('x2', '300');
        baseline.setAttribute('y1', '38');
        baseline.setAttribute('y2', '38');
        const polyline = document.createElementNS(SVG_NS, 'polyline');
        polyline.setAttribute('points', points);
        spark.append(baseline, polyline);
      }
    }
  }
}

export function createOverlay(session: InspectorSession): InspectorOverlay {
  return new Overlay(session);
}
