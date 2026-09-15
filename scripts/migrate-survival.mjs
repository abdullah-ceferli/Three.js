import { loadEnv } from 'vite';
import { SpacetimePersistence } from '../server/spacetimePersistence.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const env=loadEnv('development',process.cwd(),''),db=new SpacetimePersistence(env);
const accounts=await db.sql('SELECT * FROM account'),players=await db.sql('SELECT * FROM player_state');
mkdirSync('.data/backups',{recursive:true});
const backup='.data/backups/pre-survival-'+Date.now()+'.json';
writeFileSync(backup,JSON.stringify({accounts,players}),{mode:0o600});
const result=spawnSync(process.execPath,['scripts/database.mjs','setup'],{stdio:'inherit',windowsHide:true});
if(result.status!==0)throw new Error('Migration failed; private pre-migration backup retained at '+backup);
const afterAccounts=await db.sql('SELECT * FROM account'),afterPlayers=await db.sql('SELECT * FROM player_state');
for(const row of accounts)assert.deepEqual(afterAccounts.find(next=>next[0]===row[0]),row,'Existing account must not change');
for(const row of players)assert.deepEqual(afterPlayers.find(next=>next[0]===row[0]),row,'Existing player progress must not change');
console.log('Verified '+accounts.length+' existing accounts and '+players.length+' legacy saves unchanged. Private backup: '+backup);
for(const name of ['admin','superadmin']){const account=await db.accountByUsername(name);assert.ok(account);assert.equal((await db.loadPlayer(account.accountId)).role,name);}
console.log('Admin and Superadmin roles provisioned; existing passwords preserved.');
