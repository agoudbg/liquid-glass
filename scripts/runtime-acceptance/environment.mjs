import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import {
  basename,
  dirname,
  join,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const packageManagerPath = process.env.npm_execpath;
const temporaryPrefix = 'codex-liquid-glass-runtime-';

/** Absolute root of the active rewrite repository. */
export const repositoryRoot = resolve(moduleDirectory, '..', '..');

/** Read one bounded positive-integer environment override. */
export function readPositiveInteger(name, fallback, minimum = 1) {
  const rawValue = process.env[name];
  if (rawValue === undefined) return fallback;
  const value = Number(rawValue);
  assert(
    Number.isSafeInteger(value) && value >= minimum,
    `${name} must be an integer greater than or equal to ${String(minimum)}.`,
  );
  return value;
}

/** Run one child command and reject with captured context on failure. */
export function run(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repositoryRoot,
      env: options.env ?? process.env,
      shell: options.shell ?? false,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    child.stdout?.on('data', (chunk) => stdout.push(chunk));
    child.stderr?.on('data', (chunk) => stderr.push(chunk));
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise(Buffer.concat(stdout).toString('utf8'));
        return;
      }
      const details = [
        Buffer.concat(stdout).toString('utf8').trim(),
        Buffer.concat(stderr).toString('utf8').trim(),
      ].filter(Boolean).join('\n');
      rejectPromise(new Error(
        `${command} ${args.join(' ')} exited with code ${String(code)}${
          details ? `\n${details}` : ''
        }`,
      ));
    });
  });
}

/** Run the workspace-selected pnpm version without installing in the active tree. */
export function runPnpm(args, cwd = repositoryRoot) {
  if (packageManagerPath) {
    return run(process.execPath, [packageManagerPath, ...args], { cwd });
  }
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  return run(command, args, {
    cwd,
    shell: process.platform === 'win32',
  });
}

/** Create one isolated runtime-acceptance directory directly under the OS temp root. */
export function createAcceptanceTempRoot() {
  return mkdtemp(join(tmpdir(), temporaryPrefix));
}

/** Remove only an acceptance directory created directly under the OS temp root. */
export async function removeAcceptanceTempRoot(path) {
  const resolvedPath = resolve(path);
  assert.equal(
    dirname(resolvedPath).toLowerCase(),
    resolve(tmpdir()).toLowerCase(),
    'Runtime acceptance cleanup target escaped the OS temp root.',
  );
  assert(
    basename(resolvedPath).startsWith(temporaryPrefix),
    'Runtime acceptance cleanup target has an unexpected name.',
  );
  await rm(resolvedPath, { force: true, recursive: true });
}

/** Build the current packages and production playground without changing dependencies. */
export function buildCandidate() {
  return runPnpm(['build']);
}

/** Materialize and build the committed legacy performance fixture in isolation. */
export async function prepareLegacyPerformanceSource(temporaryRoot) {
  const archivePath = join(temporaryRoot, 'legacy.tar');
  const sourceRoot = join(temporaryRoot, 'legacy-source');
  await mkdir(sourceRoot, { recursive: true });
  await run('git', [
    '-c',
    'safe.directory=*',
    'archive',
    '--format=tar',
    `--output=${archivePath}`,
    '345a9be6906bcc8a801208054e7fe134c6bfe641',
  ]);
  await run('tar', ['-xf', archivePath, '-C', sourceRoot]);
  const performanceRoot = join(sourceRoot, 'src', 'performance');
  await mkdir(performanceRoot, { recursive: true });
  await cp(
    join(repositoryRoot, 'tests', 'runtime', 'legacy-performance', 'PerformanceApp.vue'),
    join(performanceRoot, 'PerformanceApp.vue'),
  );
  await cp(
    join(repositoryRoot, 'tests', 'legacy-oracle', 'harness', 'oracle.css'),
    join(performanceRoot, 'oracle.css'),
  );
  await cp(
    join(repositoryRoot, 'tests', 'runtime', 'legacy-performance', 'main.ts'),
    join(sourceRoot, 'src', 'main.ts'),
  );

  const storeRoot = process.env.LIQUID_GLASS_PNPM_STORE_DIR
    ?? join(tmpdir(), 'codex-pnpm-store-liquid-glass');
  await runPnpm([
    'install',
    '--frozen-lockfile',
    '--prefer-offline',
    '--network-concurrency=1',
    '--fetch-retries=5',
    '--fetch-timeout=30000',
    '--store-dir',
    storeRoot,
  ], sourceRoot);
  await runPnpm(['build:demo'], sourceRoot);
  return sourceRoot;
}

async function reserveLoopbackPort() {
  const server = createServer();
  server.unref();
  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  assert(address && typeof address === 'object', 'Could not reserve a preview port.');
  await new Promise((resolvePromise, rejectPromise) => {
    server.close((error) => {
      if (error) rejectPromise(error);
      else resolvePromise();
    });
  });
  return address.port;
}

async function waitForPreview(url, child, readOutput) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Runtime preview exited early.\n${readOutput()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // A fresh preview refuses connections until Vite has bound its port.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Runtime preview did not start at ${url}.\n${readOutput()}`);
}

function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolvePromise) => {
    const finish = (exited) => {
      clearTimeout(timer);
      child.off('exit', handleExit);
      resolvePromise(exited);
    };
    const handleExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once('exit', handleExit);
  });
}

async function startPreview(cwd, viteEntry, extraArguments = []) {
  const port = await reserveLoopbackPort();
  const url = `http://127.0.0.1:${String(port)}`;
  const child = spawn(process.execPath, [
    viteEntry,
    'preview',
    ...extraArguments,
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ], {
    cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const output = [];
  child.stdout.on('data', (chunk) => output.push(chunk));
  child.stderr.on('data', (chunk) => output.push(chunk));
  const readOutput = () => Buffer.concat(output).toString('utf8').trim();
  await waitForPreview(url, child, readOutput);
  return {
    async close() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill();
      if (!(await waitForChildExit(child, 2_000))) {
        child.kill('SIGKILL');
        await waitForChildExit(child, 2_000);
      }
    },
    url,
  };
}

/** Start the already-built candidate playground on a reserved loopback port. */
export function startCandidatePreview() {
  const playgroundRoot = join(repositoryRoot, 'apps', 'playground');
  return startPreview(
    playgroundRoot,
    join(playgroundRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
  );
}

/** Start the already-built isolated legacy demo on a reserved loopback port. */
export function startLegacyPreview(sourceRoot) {
  return startPreview(
    sourceRoot,
    join(sourceRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
    ['--config', join(sourceRoot, 'vite.demo.config.ts')],
  );
}

/** Launch the installed Chrome channel shared by legacy and candidate measurements. */
export function launchAcceptanceBrowser() {
  return chromium.launch({
    args: [
      '--force-color-profile=srgb',
      '--use-angle=swiftshader',
      '--use-gl=angle',
    ],
    channel: 'chrome',
    headless: true,
  });
}

/** Persist one human-readable JSON report below the ignored test-results tree. */
export async function writeAcceptanceReport(name, report) {
  const outputRoot = join(repositoryRoot, 'test-results', 'runtime-acceptance');
  await mkdir(outputRoot, { recursive: true });
  const outputPath = join(outputRoot, `${name}.json`);
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return outputPath;
}
