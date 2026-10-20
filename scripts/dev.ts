// Runs the API server (with --watch) and the Vite dev server side by side.
import { spawn } from 'node:child_process';

// shell: true so Windows resolves npm.cmd (spawning .cmd files directly fails with ENOENT/EINVAL).
const procs = [
  spawn('npm run dev:server', { stdio: 'inherit', shell: true }),
  spawn('npm run dev:client', { stdio: 'inherit', shell: true }),
];
const stop = () => { for (const p of procs) p.kill('SIGTERM'); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', stop);
