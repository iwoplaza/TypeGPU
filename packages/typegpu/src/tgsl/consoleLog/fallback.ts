import { snip } from '../../data/snippet.ts';
import { Void } from '../../data/wgslTypes.ts';

export const fallbackLogSnippet = snip('/* console.log() */', Void, /* origin */ 'runtime');
