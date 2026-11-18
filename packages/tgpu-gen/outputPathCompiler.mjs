// @ts-check

import path from 'node:path';

/**
 * Translates `*`, `**`, `?` and `[...]` into their regex equivalents (the first `**` is captured
 * as `dir`), and escapes everything else so it's matched literally.
 * @param {string} pattern
 * @returns {RegExp}
 */
const globToRegExp = (pattern) => {
  let dirCaptured = false;
  const source = pattern.replace(/\*\*|\*|\?|\[!?[^\]]+\]|[.+^${}()|[\]\\]/g, (token) => {
    if (token === '**') {
      if (dirCaptured) {
        return '.*';
      }
      dirCaptured = true;
      return '(?<dir>.*)';
    }
    if (token === '*') {
      return '.*';
    }
    if (token === '?') {
      return '.';
    }
    if (token.startsWith('[!')) {
      return `[^${token.slice(2)}`;
    }
    if (token.length > 1) {
      return token;
    }
    return `\\${token}`;
  });
  return new RegExp(source);
};

/**
 * @param {string} input
 * @param {string} output
 * @returns {(file: string) => string}
 */
export const createOutputPathCompiler = (input, output) => {
  return output.includes(path.sep)
    ? /\*\*\/.*\*.*/.test(output) // "**/" and "*" used in pattern
      ? (file) => {
          // retrieve what ** was matched as
          const matched = globToRegExp(input).exec(file);
          const dir = matched?.groups?.dir;

          return (
            dir === undefined ? output.replace('**/', '') : output.replace('**', dir)
          ).replace('*', path.parse(file).name);
        }
      : (file) => output.replace('*', path.parse(file).name) // no "**"" placeholder, flattening to the same directory
    : (file) => {
        const parsed = path.parse(file);
        return path.join(parsed.dir, output.replace('*', parsed.name)); // no path separator -> output in the same directory as input
      };
};
