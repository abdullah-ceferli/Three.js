import { hashPassword } from './security.js';

// Called only by the private setup command, never imported by browser code.
export async function bootstrapAccounts(db, env) {
  if (!env.WILDWOOD_BOOTSTRAP_PASSWORD) return;
  if (env.WILDWOOD_BOOTSTRAP_PASSWORD.length < 8) throw new Error('Bootstrap password must contain at least eight characters');
  for (const [role, username] of [['admin', env.WILDWOOD_ADMIN_USERNAME || 'admin'], ['superadmin', env.WILDWOOD_SUPERADMIN_USERNAME || 'superadmin']]) {
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) throw new Error('Invalid bootstrap username');
    let account = await db.accountByUsername(username.toLowerCase());
    if (!account) account = await db.register(username, username.toLowerCase(), await hashPassword(env.WILDWOOD_BOOTSTRAP_PASSWORD));
    await db.setRole(account.accountId, role);
    // Existing passwords, progress and inventory are deliberately not overwritten.
  }
}
