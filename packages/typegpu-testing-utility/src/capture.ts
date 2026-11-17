import { UnknownData, WgslGenerator, type Snippet, dualImpl } from 'typegpu/~internal';
import type * as tinyest from 'tinyest';
import { tgpu, type TgpuFn } from 'typegpu';

export class CapturingGenerator extends WgslGenerator {
  public capturedSnippets: Snippet[] = [];

  protected _callExpression(expression: tinyest.Call, calleeSnippet: Snippet): Snippet {
    const argNode = expression[2][0];
    if (calleeSnippet.value === CAPTURE && argNode !== undefined) {
      const snippet = this._expression(argNode);
      this.capturedSnippets.push(snippet);
      return snippet;
    }
    return super._callExpression(expression, calleeSnippet);
  }
}

export const CAPTURE = dualImpl({
  name: 'CAPTURE',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T>(expr: T): T => expr,
  codegenImpl: (ctx, [expr]) => ctx.resolveSnippet(expr).value,
  sideEffects: false,
});

export function captureSnippets(fn: TgpuFn | (() => unknown)) {
  const generator = new CapturingGenerator();

  tgpu.resolve([fn], { unstable_shaderGenerator: generator });

  return generator.capturedSnippets;
}

export function simplifyType(snippet: Snippet) {
  return {
    ...snippet,
    dataType: snippet.dataType === UnknownData ? 'UnknownData' : snippet.dataType.type,
  };
}
