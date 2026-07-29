import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  launchPackedConsumerBrowser,
  verifyPackedConsumerBrowserRuntime,
  verifyPackedConsumerSsrImport,
} from './packed-consumer-runtime.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const keepTemporaryFiles = process.env.LIQUID_GLASS_KEEP_CONSUMER_TEMP === '1';
const packageManagerPath = process.env.npm_execpath;
const requestedArguments = new Set(process.argv.slice(2));
const packOnly = requestedArguments.has('--pack-only');
const skipBuild = requestedArguments.has('--skip-build');
const supportedArguments = new Set(['--pack-only', '--skip-build']);

for (const argument of requestedArguments) {
  assert(supportedArguments.has(argument), `Unsupported argument: ${argument}`);
}

const packages = [
  { directory: 'packages/core', name: '@agou/liquid-glass-core' },
  { directory: 'packages/vue', name: '@agou/liquid-glass-vue' },
  { directory: 'packages/react', name: '@agou/liquid-glass-react' },
  { directory: 'packages/solid', name: '@agou/liquid-glass-solid' },
];

const consumers = [
  {
    adapter: '@agou/liquid-glass-vue',
    fixture: 'vue',
    heading: 'Vue adapter package loaded',
  },
  {
    adapter: '@agou/liquid-glass-react',
    fixture: 'react',
    heading: 'React adapter package loaded',
  },
  {
    adapter: '@agou/liquid-glass-solid',
    fixture: 'solid',
    heading: 'Solid adapter package loaded',
  },
];

function run(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repositoryRoot,
      env: options.env ?? process.env,
      shell: options.shell ?? false,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    const stdout = [];
    const stderr = [];

    if (options.capture) {
      child.stdout?.on('data', (chunk) => stdout.push(chunk));
      child.stderr?.on('data', (chunk) => stderr.push(chunk));
    }

    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise(Buffer.concat(stdout).toString('utf8'));
        return;
      }

      const details = Buffer.concat(stderr).toString('utf8').trim();
      rejectPromise(
        new Error(
          `${command} ${args.join(' ')} exited with code ${String(code)}${details ? `\n${details}` : ''}`,
        ),
      );
    });
  });
}

function runPnpm(args, cwd = repositoryRoot) {
  if (packageManagerPath) {
    return run(process.execPath, [packageManagerPath, ...args], { cwd });
  }

  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  return run(command, args, {
    cwd,
    shell: process.platform === 'win32',
  });
}

function collectManifestTargets(value, targets) {
  if (typeof value === 'string') {
    if (value.startsWith('./')) {
      targets.add(value.slice(2));
    }
    return;
  }

  if (value && typeof value === 'object') {
    for (const nestedValue of Object.values(value)) {
      collectManifestTargets(nestedValue, targets);
    }
  }
}

function memberMatchesTarget(members, target) {
  if (!target.includes('*')) {
    return members.has(`package/${target}`);
  }

  const [prefix, suffix = ''] = target.split('*');
  return [...members].some(
    (member) => member.startsWith(`package/${prefix}`) && member.endsWith(suffix),
  );
}

function assertNoWorkspaceProtocols(manifest) {
  const dependencyFields = [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ];

  for (const field of dependencyFields) {
    const dependencies = manifest[field];
    if (!dependencies || typeof dependencies !== 'object') {
      continue;
    }

    for (const [name, version] of Object.entries(dependencies)) {
      assert.equal(
        typeof version === 'string' && version.startsWith('workspace:'),
        false,
        `${manifest.name} keeps ${name} as an unresolved workspace protocol in ${field}.`,
      );
    }
  }
}

async function inspectTarball(tarballPath, expectedName) {
  const listing = await run('tar', ['-tf', tarballPath], { capture: true });
  const members = new Set(
    listing
      .split(/\r?\n/u)
      .map((member) => member.replace(/\\/gu, '/').replace(/\/$/u, ''))
      .filter(Boolean),
  );
  const manifestText = await run(
    'tar',
    ['-xOf', tarballPath, 'package/package.json'],
    { capture: true },
  );
  const manifest = JSON.parse(manifestText);

  assert.equal(manifest.name, expectedName);
  assert.equal(manifest.license, 'MIT', `${expectedName} must declare the MIT license.`);
  assert(members.has('package/LICENSE'), `${expectedName} is missing LICENSE.`);
  assert(members.has('package/README.md'), `${expectedName} is missing README.md.`);
  assert(members.has('package/dist/index.js'), `${expectedName} is missing dist/index.js.`);
  assert(
    members.has('package/dist/index.d.ts'),
    `${expectedName} is missing dist/index.d.ts.`,
  );

  for (const member of members) {
    assert(
      !/^package\/(?:src|test|tests)(?:\/|$)/u.test(member),
      `${expectedName} leaks implementation or test files: ${member}`,
    );
  }

  const publishedTargets = new Set();
  collectManifestTargets(manifest.exports, publishedTargets);
  for (const field of ['main', 'module', 'style', 'types']) {
    collectManifestTargets(manifest[field], publishedTargets);
  }

  for (const target of publishedTargets) {
    assert(
      memberMatchesTarget(members, target),
      `${expectedName} publishes a missing manifest target: ${target}`,
    );
  }

  assertNoWorkspaceProtocols(manifest);
}

async function packPackages(tarballDirectory) {
  const tarballs = new Map();

  for (const packageDefinition of packages) {
    const packageDirectory = join(repositoryRoot, packageDefinition.directory);
    if (!skipBuild) {
      await runPnpm(['run', 'build'], packageDirectory);
    }

    const before = new Set(await readdir(tarballDirectory));
    await runPnpm(['pack', '--pack-destination', tarballDirectory], packageDirectory);
    const after = await readdir(tarballDirectory);
    const createdTarballs = after.filter(
      (entry) => entry.endsWith('.tgz') && !before.has(entry),
    );

    assert.equal(
      createdTarballs.length,
      1,
      `Expected one tarball for ${packageDefinition.name}, found ${String(createdTarballs.length)}.`,
    );

    const tarballPath = join(tarballDirectory, createdTarballs[0]);
    await inspectTarball(tarballPath, packageDefinition.name);
    tarballs.set(packageDefinition.name, tarballPath);
    console.log(`Packed and inspected ${packageDefinition.name}.`);
  }

  return tarballs;
}

function toFileReference(fromDirectory, targetPath) {
  const relativePath = relative(fromDirectory, targetPath).replace(/\\/gu, '/');
  return `file:${relativePath}`;
}

async function verifyConsumer(browser, temporaryRoot, consumer, tarballs) {
  const fixtureDirectory = join(repositoryRoot, 'tests', 'consumers', consumer.fixture);
  const consumerDirectory = join(temporaryRoot, 'consumers', consumer.fixture);
  await cp(fixtureDirectory, consumerDirectory, { recursive: true });

  const manifestPath = join(consumerDirectory, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const coreTarball = tarballs.get('@agou/liquid-glass-core');
  const adapterTarball = tarballs.get(consumer.adapter);
  assert(coreTarball, 'Core tarball was not created.');
  assert(adapterTarball, `${consumer.adapter} tarball was not created.`);

  const coreReference = toFileReference(consumerDirectory, coreTarball);

  manifest.dependencies = {
    ...manifest.dependencies,
    '@agou/liquid-glass-core': coreReference,
    [consumer.adapter]: toFileReference(consumerDirectory, adapterTarball),
  };
  manifest.pnpm = {
    ...manifest.pnpm,
    overrides: {
      ...manifest.pnpm?.overrides,
      '@agou/liquid-glass-core': coreReference,
    },
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const installArguments = [
    'install',
    '--ignore-workspace',
    '--prefer-offline',
    '--frozen-lockfile=false',
  ];
  const storeDirectory = process.env.LIQUID_GLASS_PNPM_STORE_DIR;
  if (storeDirectory) {
    installArguments.push('--store-dir', storeDirectory);
  }

  await runPnpm(installArguments, consumerDirectory);
  await runPnpm(['run', 'build'], consumerDirectory);
  await verifyPackedConsumerSsrImport(consumerDirectory, consumer);
  await verifyPackedConsumerBrowserRuntime(browser, consumerDirectory, consumer);
  console.log(`Verified packed ${consumer.fixture} consumer.`);
}

const temporaryRoot = await mkdtemp(join(tmpdir(), 'liquid-glass-consumers-'));

try {
  const tarballDirectory = join(temporaryRoot, 'tarballs');
  await mkdir(tarballDirectory, { recursive: true });
  const tarballs = await packPackages(tarballDirectory);

  if (!packOnly) {
    const browser = await launchPackedConsumerBrowser();
    const consumerErrors = [];
    try {
      for (const consumer of consumers) {
        try {
          await verifyConsumer(browser, temporaryRoot, consumer, tarballs);
        } catch (error) {
          consumerErrors.push(error);
          console.error(`Packed ${consumer.fixture} consumer failed.`, error);
        }
      }
    } finally {
      await browser.close();
    }

    if (consumerErrors.length > 0) {
      throw new AggregateError(
        consumerErrors,
        `${String(consumerErrors.length)} packed consumer verification(s) failed.`,
      );
    }
  }
} finally {
  if (keepTemporaryFiles) {
    console.log(`Kept consumer verification files at ${temporaryRoot}.`);
  } else {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}
