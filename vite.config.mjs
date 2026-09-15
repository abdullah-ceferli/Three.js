import { gameServerPlugin } from './server/gameServerPlugin.js';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
  plugins: [gameServerPlugin(env)],
  server: {
    hmr: false,
    allowedHosts: ['.trycloudflare.com'],
    fs: { deny: ['.env', '.env.*', '**/.env', '**/.env.*', '**/.data/**', '**/.runtime/**', '**/server/**', '**/scripts/**', '**/spacetimedb/**', '**/*.{crt,pem}', '**/.git/**'] },
    watch: { ignored: ['**/assets/Models/**', '**/.data/**', '**/.runtime/**'] }
  }
  };
});
