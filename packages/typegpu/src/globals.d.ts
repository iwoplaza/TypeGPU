declare interface ImportMeta {
  env?: {
    MODE: string;
  };
}

// Opt-out flags for apps that don't use a feature, so that bundlers can drop its code.
// Apps set them with the bundler's `define` option, e.g. `define: { __TYPEGPU_NO_TEXTURES__: 'true' }` in Vite.
declare const __TYPEGPU_NO_TEXTURES__: boolean | undefined;
declare const __TYPEGPU_NO_QUERY_SETS__: boolean | undefined;
declare const __TYPEGPU_NO_CONSOLE_LOG__: boolean | undefined;
