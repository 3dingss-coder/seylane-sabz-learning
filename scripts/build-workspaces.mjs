import { spawnSync } from 'node:child_process';

const workspaces = ['@ssl/functions', '@ssl/web'];

for (const workspace of workspaces) {
  // Invoke the real npm CLI from Node instead of relying on the caller's script runner.
  // Cloudflare Workers Builds runs "bun run build"; Bun treats "-w" as watch mode,
  // so npm's shorthand "-w <workspace>" recursively reran the root build script.
  const result = spawnSync(
    'npm',
    ['run', 'build', `--workspace=${workspace}`],
    { stdio: 'inherit', env: process.env },
  );

  if (result.error) {
    console.error(`Failed to start build for ${workspace}:`, result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
