/**
 * Minimal, dependency-free stand-in for the docs' example controls panel.
 * Shared by both variants so that UI code is identical between them.
 */
import { recordInteraction } from './bench.ts';

type Vec = ArrayLike<number> & { length: number };

export type Control =
  | false
  | { onButtonClick: () => void | Promise<void> }
  | { initial: boolean; onToggleChange: (v: boolean) => void }
  | {
      initial: number;
      min?: number;
      max?: number;
      step?: number;
      onSliderChange: (v: number) => void;
    }
  | {
      initial: string | number;
      options: readonly (string | number)[];
      onSelectChange: (v: never) => void;
    }
  | { initial: Vec; min: Vec; max: Vec; step: Vec; onVectorSliderChange: (v: never) => void }
  | { initial: Vec; onColorChange: (v: never) => void };

export function defineControls<T extends Record<string, Control>>(controls: T): T {
  return controls;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}) {
  return Object.assign(document.createElement(tag), props);
}

/**
 * Renders the controls into `#controls` and runs every `initial` callback,
 * like the docs runner does.
 */
export function mountControls(controls: Record<string, Control>) {
  const container = document.getElementById('controls') as HTMLElement;
  container.replaceChildren();
  // The first control that the user interacts with is recorded for metrics.
  container.addEventListener('pointerdown', (e) => recordInteraction(e), { capture: true });

  for (const [label, control] of Object.entries(controls)) {
    if (!control) {
      continue;
    }
    const row = el('label', { className: 'control' });
    row.append(el('span', { textContent: label }));

    if ('onButtonClick' in control) {
      row.replaceChildren(
        el('button', {
          textContent: label,
          onclick: () => void control.onButtonClick(),
        }),
      );
    } else if ('onToggleChange' in control) {
      const input = el('input', { type: 'checkbox', checked: control.initial });
      input.onchange = () => control.onToggleChange(input.checked);
      row.append(input);
      control.onToggleChange(control.initial);
    } else if ('onSliderChange' in control) {
      const input = el('input', {
        type: 'range',
        min: String(control.min ?? 0),
        max: String(control.max ?? 1),
        step: String(control.step ?? 0.01),
        value: String(control.initial),
      });
      input.oninput = () => control.onSliderChange(Number(input.value));
      row.append(input);
      control.onSliderChange(control.initial);
    } else if ('onSelectChange' in control) {
      const select = el('select');
      for (const option of control.options) {
        select.append(el('option', { value: String(option), textContent: String(option) }));
      }
      select.value = String(control.initial);
      const isNumeric = typeof control.initial === 'number';
      const onChange = control.onSelectChange as (v: string | number) => void;
      select.onchange = () => onChange(isNumeric ? Number(select.value) : select.value);
      row.append(select);
      onChange(control.initial);
    } else if ('onVectorSliderChange' in control) {
      const onChange = control.onVectorSliderChange as (v: Vec) => void;
      // Keeping the original vector instance, so typegpu vectors stay typegpu vectors
      const value = control.initial as unknown as number[];
      for (let i = 0; i < control.initial.length; i++) {
        const input = el('input', {
          type: 'range',
          min: String(control.min[i]),
          max: String(control.max[i]),
          step: String(control.step[i]),
          value: String(control.initial[i]),
        });
        input.oninput = () => {
          value[i] = Number(input.value);
          onChange(value);
        };
        row.append(input);
      }
      onChange(value);
    } else if ('onColorChange' in control) {
      const onChange = control.onColorChange as (v: Vec) => void;
      const value = control.initial as unknown as number[];
      const toHex = (n: number) =>
        Math.round(Math.min(Math.max(n, 0), 1) * 255)
          .toString(16)
          .padStart(2, '0');
      const input = el('input', {
        type: 'color',
        value: `#${toHex(value[0])}${toHex(value[1])}${toHex(value[2])}`,
      });
      input.oninput = () => {
        for (let i = 0; i < 3; i++) {
          value[i] = parseInt(input.value.slice(1 + i * 2, 3 + i * 2), 16) / 255;
        }
        onChange(value);
      };
      row.append(input);
      onChange(value);
    }
    container.append(row);
  }
}
