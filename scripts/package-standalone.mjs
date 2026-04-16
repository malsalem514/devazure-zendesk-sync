import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const releaseRoot = path.join(projectRoot, 'release', 'devazure-zendesk-sync');

await rm(releaseRoot, { recursive: true, force: true });
await mkdir(releaseRoot, { recursive: true });

const filesToCopy = [
  '.env.example',
  'README.md',
  'CLIENT-HANDOFF.md',
  'tsconfig.json',
];

for (const relativePath of filesToCopy) {
  await cp(path.join(projectRoot, relativePath), path.join(releaseRoot, relativePath));
}

const directoriesToCopy = ['dist', 'src'];

for (const relativePath of directoriesToCopy) {
  await cp(path.join(projectRoot, relativePath), path.join(releaseRoot, relativePath), {
    recursive: true,
  });
}

const rawPackageJson = await readFile(path.join(projectRoot, 'package.json'), 'utf8');
const packageJson = JSON.parse(rawPackageJson);

delete packageJson.files;
delete packageJson.private;
packageJson.name = 'devazure-zendesk-sync';
packageJson.description = 'Standalone service for syncing Zendesk ticket events into DevAzure work items';

await writeFile(
  path.join(releaseRoot, 'package.json'),
  `${JSON.stringify(packageJson, null, 2)}\n`,
  'utf8',
);

console.log(`Standalone bundle created at ${releaseRoot}`);
