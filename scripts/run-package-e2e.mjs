import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const distRoot = resolve('dist');
const DEFAULT_DEVELOPER_URL = 'https://b23.tv/iNOah8D';
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8']
]);

function createPackageServer(packageRoot) {
  return createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
      const filePath = resolve(packageRoot, pathname.replace(/^\/+/, ''));
      const pathFromRoot = relative(packageRoot, filePath);
      if (pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      if (!(await stat(filePath)).isFile()) throw new Error('Not a file');
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': contentTypes.get(extname(filePath)) ?? 'application/octet-stream'
      });
      response.end(await readFile(filePath));
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
}

async function startPackageServer(packageRoot, port) {
  const server = createPackageServer(packageRoot);
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error(`Could not resolve package server address for ${packageRoot}`);
  }
  return { server, baseURL: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server) {
  await new Promise((resolveClose, reject) => {
    server.close((error) => error ? reject(error) : resolveClose());
  });
}

async function runNode(args, options = {}) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    ...options
  });
  const exitCode = await new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolveExit(code ?? 1));
  });
  if (exitCode !== 0) {
    throw new Error(`Node subprocess exited with code ${exitCode}: ${args.join(' ')}`);
  }
}

const packageVariants = [
  {
    variant: 'default',
    contactUrl: DEFAULT_DEVELOPER_URL,
    homepageUrl: DEFAULT_DEVELOPER_URL
  },
  {
    variant: 'valid',
    contactUrl: 'https://example.com/jed/contact',
    homepageUrl: 'https://example.com/jed'
  },
  {
    variant: 'invalid',
    contactKind: 'http',
    homepageKind: 'javascript',
    contactUrl: 'http://contact.invalid/jed',
    homepageUrl: 'javascript:alert("jed")'
  },
  {
    variant: 'invalid',
    contactKind: 'malformed',
    homepageKind: 'malformed',
    contactUrl: 'not a valid contact URL',
    homepageUrl: '::not a valid homepage URL::'
  }
];

function packageBuildEnvironment({ variant, contactUrl, homepageUrl }) {
  const environment = { ...process.env };
  delete environment.VITE_JED_CONTACT_URL;
  delete environment.VITE_JED_HOMEPAGE_URL;
  if (variant !== 'default') environment.VITE_JED_CONTACT_URL = contactUrl;
  if (variant !== 'default') environment.VITE_JED_HOMEPAGE_URL = homepageUrl;
  return environment;
}

const mainPackageConfig = {
  contactUrl: process.env.VITE_JED_CONTACT_URL || DEFAULT_DEVELOPER_URL,
  homepageUrl: process.env.VITE_JED_HOMEPAGE_URL || DEFAULT_DEVELOPER_URL
};
const temporaryRoot = await mkdtemp(join(tmpdir(), 'jed-scoring-package-variants-'));
const runningServers = [];
let exitCode = 1;
try {
  const viteCli = resolve('node_modules', 'vite', 'bin', 'vite.js');
  const packageBuilds = [];
  for (const [index, variant] of packageVariants.entries()) {
    const outputRoot = join(temporaryRoot, `${index + 1}-${variant.variant}`);
    await runNode([viteCli, 'build', '--outDir', outputRoot, '--emptyOutDir'], {
      env: packageBuildEnvironment(variant)
    });
    const served = await startPackageServer(outputRoot, 0);
    runningServers.push(served.server);
    packageBuilds.push({
      ...variant,
      baseURL: served.baseURL
    });
  }
  const defaultBuild = packageBuilds.find((build) => build.variant === 'default');
  const validBuild = packageBuilds.find((build) => build.variant === 'valid');
  const invalidBuilds = packageBuilds.filter((build) => build.variant === 'invalid');
  if (!defaultBuild || !validBuild || invalidBuilds.length !== 2) {
    throw new Error('Package runner did not create the complete developer-configuration matrix');
  }

  const defaultPackage = await startPackageServer(distRoot, 4175);
  runningServers.push(defaultPackage.server);
  const playwrightCli = resolve('node_modules', '@playwright', 'test', 'cli.js');
  const child = spawn(
    process.execPath,
    [
      playwrightCli,
      'test',
      '--config=playwright.package.config.ts',
      ...process.argv.slice(2)
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        JED_MAIN_PACKAGE_CONFIG: JSON.stringify(mainPackageConfig),
        JED_UNCONFIGURED_PACKAGE_BUILD: JSON.stringify(defaultBuild),
        JED_VALID_PACKAGE_BUILD: JSON.stringify(validBuild),
        JED_INVALID_PACKAGE_BUILDS: JSON.stringify(invalidBuilds)
      },
      stdio: 'inherit'
    }
  );
  exitCode = await new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolveExit(code ?? 1));
  });
} finally {
  try {
    await Promise.all(runningServers.map(closeServer));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

process.exitCode = exitCode;
