import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const server = await createServer({
  logLevel: 'error',
  server: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: true
  }
});

let exitCode = 1;
try {
  await server.listen();
  const playwrightCli = resolve('node_modules', '@playwright', 'test', 'cli.js');
  const child = spawn(
    process.execPath,
    [playwrightCli, 'test', ...process.argv.slice(2)],
    { cwd: process.cwd(), stdio: 'inherit' }
  );
  exitCode = await new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolveExit(code ?? 1));
  });
} finally {
  await server.close();
}

process.exitCode = exitCode;
