/**
 * Repository hygiene guards. These catch mistakes that are invisible in review:
 * zero-width / non-breaking characters or backspace bytes hiding inside regexes,
 * and dangerous DOM sinks creeping into the front-end.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));
const SOURCE = /\.(?:ts|tsx|js|mjs|css|html|json|md|yml)$/;

function* walk(directory: string): Generator<string> {
  for (const name of readdirSync(directory)) {
    // Local runtime secrets are intentionally ignored by Git, not submission files.
    if ((name === '.env' || name.startsWith('.env.')) && name !== '.env.example') continue;
    if (['node_modules', 'dist', '.next', 'coverage', 'data', '.git'].includes(name)) continue;
    const path = join(directory, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (SOURCE.test(name)) yield path;
  }
}
const files = [...walk(root)];

// Names, not literals, so this file does not contain the characters it hunts for.
const INVISIBLE: ReadonlyMap<number, string> = new Map([
  [0x00a0, 'NO-BREAK SPACE'],
  [0x200b, 'ZERO WIDTH SPACE'],
  [0x200c, 'ZERO WIDTH NON-JOINER'],
  [0x200d, 'ZERO WIDTH JOINER'],
  [0x2060, 'WORD JOINER'],
  [0xfeff, 'BOM / ZERO WIDTH NO-BREAK SPACE'],
  [0x2028, 'LINE SEPARATOR'],
  [0x2029, 'PARAGRAPH SEPARATOR'],
  [0x0008, 'BACKSPACE'],
]);

describe('repository hygiene', () => {
  it('scans a meaningful number of files', () => {
    assert.ok(files.length > 40, `only found ${files.length} files`);
  });

  it('contains no invisible or ambiguous characters (use visible \\uXXXX escapes instead)', () => {
    const problems: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        for (const character of line) {
          const name = INVISIBLE.get(character.codePointAt(0) ?? 0);
          if (name) problems.push(`${relative(root, file)}:${index + 1} ${name}`);
        }
      });
    }
    assert.deepEqual(problems, []);
  });

  it('never uses dangerous HTML sinks or dynamic code execution in application code', () => {
    const banned = /\b(?:dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\s*\(|new Function)\b/;
    const application = files.filter((file) => /[\\/]src[\\/]/.test(file) && /\.(?:ts|tsx)$/.test(file));
    assert.ok(application.length > 20);
    for (const file of application) {
      const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      assert.ok(!banned.test(source), `${relative(root, file)} uses a dangerous sink`);
    }
  });

  it('keeps secrets out of the repository', () => {
    const tracked = files.map((file) => relative(root, file).replaceAll('\\', '/'));
    assert.ok(!tracked.some((file) => /(^|\/)\.env(\.|$)/.test(file) && file !== '.env.example'), 'a .env file would be committed');
    const keyLike = /AIza[0-9A-Za-z_-]{30,}/;
    for (const file of files) assert.ok(!keyLike.test(readFileSync(file, 'utf8')), `${relative(root, file)} contains something that looks like an API key`);
  });
});
