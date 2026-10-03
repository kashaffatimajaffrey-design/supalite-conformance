import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** True when the module at `metaUrl` is the script node was started with (works on Windows too). */
export function isMain(metaUrl: string): boolean {
  if (!process.argv[1]) return false;
  const norm = (p: string) => {
    const r = resolve(p);
    return process.platform === 'win32' ? r.toLowerCase() : r;
  };
  return norm(fileURLToPath(metaUrl)) === norm(process.argv[1]);
}
