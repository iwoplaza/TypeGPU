export function getExampleURLs(
  category: string,
  name: string,
): {
  html: string;
  ts: string;
} {
  return {
    html: `../../../src/examples/${category}/${name}/index.html?raw`,
    ts: `../../../src/examples/${category}/${name}/index`,
  };
}

export function createDeepNoopProxy<T extends object>(
  target: T,
  accessedProperties = new Set<PropertyKey>(),
): T {
  return new Proxy(target, {
    get(_obj, prop, _receiver) {
      accessedProperties.add(prop);

      if (prop in target) {
        return Reflect.get(target, prop);
      }

      return () => createDeepNoopProxy({}, accessedProperties);
    },
    set() {
      return true; // No-op set
    },
    apply() {
      return createDeepNoopProxy({}, accessedProperties);
    },
  });
}

/**
 * A stand-in for a module the tests don't care about (e.g. a plotting library), meant to be
 * returned from a `vi.mock` factory. Every export, and anything reached from it through property
 * access, calls or construction, is the same no-op stub (which converts to `0` when used as a
 * primitive).
 */
export function createDeepStubModule(): Record<string, unknown> {
  const get = (_target: object, prop: PropertyKey) => {
    if (prop === Symbol.toPrimitive) {
      return () => 0;
    }
    return prop === 'then' || typeof prop === 'symbol' ? undefined : stub;
  };
  const stub: object = new Proxy(function () {}, {
    get,
    set: () => true,
    apply: () => stub,
    construct: () => stub,
  });
  return new Proxy({}, { get, has: () => true });
}

export async function testExampleShaderGeneration(
  examplePath: string,
  controlTriggers: string[] = [],
) {
  const example = await import(examplePath);

  for (const trigger of controlTriggers) {
    const control = example.controls?.[trigger];
    if (control?.onButtonClick) {
      try {
        control.onButtonClick();
      } catch {}
    }
  }

  return example;
}

export function extractShaderCodes(
  // oxlint-disable-next-line typescript/no-explicit-any -- we testing here
  device: any,
  expectedCalls?: number,
): string {
  const calls = device.mock.createShaderModule.mock.calls as unknown as Array<
    [GPUShaderModuleDescriptor, { label?: string }]
  >;
  if (expectedCalls !== undefined && calls.length !== expectedCalls) {
    throw new Error(
      `Expected ${expectedCalls} shader module creation calls, but got ${calls.length}.`,
    );
  }
  return calls.map(([descriptor]) => descriptor.code).join('\n\n');
}

export async function waitForExpectedCalls(
  // oxlint-disable-next-line typescript/no-explicit-any -- it's a mock
  device: any,
  expectedCalls: number,
): Promise<void> {
  const maxWaitTime = 1000;
  const pollInterval = 10;
  let elapsed = 0;

  while (elapsed < maxWaitTime) {
    const currentCalls = device.mock?.createShaderModule?.mock?.calls?.length || 0;
    if (currentCalls >= expectedCalls) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    elapsed += pollInterval;
  }

  console.warn(
    `Timeout waiting for ${expectedCalls} shader calls, got ${
      device.mock?.createShaderModule?.mock?.calls?.length || 0
    }`,
  );
}
