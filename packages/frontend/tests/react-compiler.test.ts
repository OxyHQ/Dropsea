/**
 * Every component the window draws is compiled by the React Compiler, as
 * Dropsea's build runs it (`experiments.reactCompiler`). A component it cannot
 * compile is left as written, silently: it and everything it renders draw
 * again on every change above them, which made a click in a list redraw every
 * row. This runs the compiler Expo's preset uses over each file and fails on
 * any component it gave up on, with its reason.
 */
import { describe, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

interface CompilerEvent {
  kind: string;
  fnName?: string | null;
  detail?: { reason?: string; options?: { reason?: string } };
}

interface Babel {
  transformFileSync: (file: string, options: object) => unknown;
}

const frontend = path.resolve(import.meta.dir, '..');
// The compiler and Babel as Expo's preset has them: its own dependencies.
const fromPreset = createRequire(require.resolve('babel-preset-expo/package.json'));
const babel: Babel = fromPreset('@babel/core');
const compiler = fromPreset.resolve('babel-plugin-react-compiler');
const typescript = fromPreset.resolve('@babel/preset-typescript');

function sources(folder: string): string[] {
  return readdirSync(path.join(frontend, folder), { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => path.join(frontend, folder, file));
}

function bailouts(file: string): string[] {
  const events: CompilerEvent[] = [];
  babel.transformFileSync(file, {
    babelrc: false,
    configFile: false,
    presets: [[typescript, { isTSX: true, allExtensions: true }]],
    plugins: [
      [
        compiler,
        {
          target: '19',
          panicThreshold: 'none',
          logger: { logEvent: (_file: string, event: CompilerEvent) => events.push(event) },
        },
      ],
    ],
  });
  return events
    .filter((event) => event.kind === 'CompileError')
    .map(
      (event) =>
        `${path.relative(frontend, file)}: ${event.detail?.options?.reason ?? event.detail?.reason ?? 'no reason given'}`,
    );
}

describe('the React Compiler', () => {
  test('compiles every component and screen', () => {
    const files = [...sources('components'), ...sources('app')];
    expect(files.length).toBeGreaterThan(20);
    expect(files.flatMap(bailouts)).toEqual([]);
  });
});
