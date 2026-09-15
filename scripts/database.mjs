import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { SpacetimePersistence } from '../server/spacetimePersistence.js';
import { bootstrapAccounts } from '../server/bootstrapAccounts.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = resolve(root, '.runtime/spacetimedb/spacetimedb-cli.exe');
const cliRoot = resolve(root, '.data/spacetimedb');
const action = process.argv[2] || 'check';
const env = loadEnv('development', root, '');
const host = env.SPACETIMEDB_HOST || 'http://127.0.0.1:3000';
const database = env.SPACETIMEDB_DATABASE || 'wildwood-survival';

function run(args, quiet = false) {
  if (!existsSync(cli)) throw new Error('SpacetimeDB runtime missing. See README.md for installation.');
  const result = spawnSync(cli, ['--root-dir', cliRoot, ...args], {
    cwd: root, windowsHide: true, stdio: quiet ? 'pipe' : 'inherit', encoding: 'utf8'
  });
  if (result.error || result.status !== 0) throw new Error(`SpacetimeDB ${args[0]} failed. ${quiet ? 'Check the database configuration.' : ''}`);
}

async function health(databaseHost = host) {
  await new SpacetimePersistence({ ...env, SPACETIMEDB_HOST: databaseHost, SPACETIMEDB_DATABASE: database })
    .sql('SELECT account_id FROM account LIMIT 1');
  console.log(`Database ready: ${database} at ${databaseHost}`);
}

async function localDatabaseRunning() {
  let response;
  try {
    response = await fetch('http://127.0.0.1:3000/v1/identity/public-key', { signal: AbortSignal.timeout(3000) });
  } catch (error) {
    // Only a refused connection proves that no server is listening.
    if (error.cause?.code === 'ECONNREFUSED') return false;
    throw new Error('Port 3000 is not responding. Check the running database before starting another copy.');
  }
  const body = await response.text();
  if (!response.ok || !body.includes('-----BEGIN PUBLIC KEY-----')) {
    throw new Error('Port 3000 is occupied by another service. No additional database was started.');
  }
  return true;
}

try {
  if (action === 'start') {
    if (await localDatabaseRunning()) {
      console.log('SpacetimeDB is already running. Reusing the existing server.');
      await health('http://127.0.0.1:3000');
    } else {
      // Keep both signing keys and database files in this persistent project directory.
      run(['start', '--listen-addr', '127.0.0.1:3000', '--non-interactive']);
    }
  } else if (action === 'setup') {
    if (!['127.0.0.1', 'localhost'].includes(new URL(host).hostname)) throw new Error('This setup command only provisions the local database.');
    mkdirSync(cliRoot, { recursive: true });
    let token = env.SPACETIMEDB_TOKEN;
    if (!token) {
      const existing = await fetch(`${host}/v1/database/${encodeURIComponent(database)}/identity`, { signal: AbortSignal.timeout(5000) });
      if (existing.ok) throw new Error('Database already exists: restore its publisher token in .env before setup.');
      if (existing.status !== 404) throw new Error(`Database check failed (${existing.status}); refusing to create another identity.`);
      const response = await fetch(`${host}/v1/identity`, { method: 'POST', signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`Local identity creation failed (${response.status}).`);
      token = (await response.json()).token;
      if (!token) throw new Error('Local identity response did not contain a token.');
    }
    // Generate secrets at runtime, never print them or embed them in source files.
    const updates = {
      SPACETIMEDB_HOST: host, SPACETIMEDB_DATABASE: database, SPACETIMEDB_TOKEN: token,
      WILDWOOD_SESSION_SECRET: env.WILDWOOD_SESSION_SECRET || randomBytes(48).toString('base64url')
    };
    const path = resolve(root, '.env');
    const lines = existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/) : [];
    for (const [key, value] of Object.entries(updates)) {
      const index = lines.findIndex(line => line.startsWith(`${key}=`));
      if (index < 0) lines.push(`${key}=${value}`); else lines[index] = `${key}=${value}`;
    }
    writeFileSync(path, `${lines.filter(Boolean).join('\n')}\n`, { mode: 0o600 });
    Object.assign(env, updates);
    run(['login', '--token', token], true);
    run(['publish', '--server', host, '--module-path', 'spacetimedb', '--delete-data=never', '--yes=skip-login', database]);
    await health();
    await bootstrapAccounts(new SpacetimePersistence(env), env);
  } else if (action === 'check') {
    await health();
  } else throw new Error('Use start, setup, or check.');
} catch (error) {
  console.error(`Database: ${error.message}`);
  if (error.cause?.code === 'ECONNREFUSED' || /fetch failed|unavailable/.test(error.message)) console.error('Start the database in another terminal: npm run db:start');
  process.exitCode = 1;
}
