// The flight recorder's drop box (see src/game/recorder.ts): the game posts its run log here after
// every stage, and it's written to playtests/<name>.json (gitignored). Each file is stamped with
// the commit it was flown on, so a log can be read against the build. Dev server only: a
// production build falls back to downloading the file.
//
//   POST /playtests/save  {name, log}   → {ok, file}
//   GET  /playtests/<name>.json          (Vite serves it as it does any file in the project)

import type { Plugin } from 'vite';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'playtests';

function commit() {
  try {
    const head = execSync('git rev-parse --short HEAD').toString().trim();
    const dirty = execSync('git status --porcelain --untracked-files=no').toString().trim() !== '';
    return dirty ? `${head}+` : head;
  } catch {
    return 'unknown';
  }
}

export function playtests(): Plugin {
  return {
    name: 'playtests',
    configureServer(server) {
      server.middlewares.use('/playtests/save', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end();
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const { name, log } = JSON.parse(body) as { name: string; log: Record<string, unknown> };
            if (!/^[\w.-]+$/.test(name)) throw new Error('bad name');
            log.commit ??= commit();
            mkdirSync(DIR, { recursive: true });
            const file = join(DIR, `${name}.json`);
            writeFileSync(file, JSON.stringify(log));
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, file, commit: log.commit }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: String(e) }));
          }
        });
      });
    },
  };
}
