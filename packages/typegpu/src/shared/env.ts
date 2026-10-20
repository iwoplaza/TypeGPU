/// <reference types="node" />

/**
 * This can be used to branch functionality between "dev" and "prod" modes, so that our
 * library can omit doing unnecessary work once it's out in the wild
 *
 * Even though the value of this constant uses Node.js specific APIs, pretty much every
 * bundler replaces the expression below with either `development` or `production`
 */
export const DEV = process.env.NODE_ENV === 'development';

export const TEST = process.env.NODE_ENV === 'test';

// Opt-out flags for apps that don't use a feature, so that bundlers can drop its code.
// Apps set them with the bundler's `define` option, e.g. `define: { __TYPEGPU_NO_TEXTURES__: 'true' }` in Vite.
declare const __TYPEGPU_NO_TEXTURES__: boolean | undefined;
declare const __TYPEGPU_NO_QUERY_SETS__: boolean | undefined;

/** False when the app declared that it creates no textures or samplers. */
export const TEXTURES_ENABLED =
  typeof __TYPEGPU_NO_TEXTURES__ === 'undefined' || !__TYPEGPU_NO_TEXTURES__;

/** False when the app declared that it creates no query sets. */
export const QUERY_SETS_ENABLED =
  typeof __TYPEGPU_NO_QUERY_SETS__ === 'undefined' || !__TYPEGPU_NO_QUERY_SETS__;
