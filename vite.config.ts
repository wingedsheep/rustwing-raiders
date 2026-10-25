import { defineConfig } from 'vite';
import { coopRelay } from './server/relay';
import { playtests } from './server/playtests';

export default defineConfig({
  plugins: [coopRelay(), playtests()],
  server: { port: 5190 },
  // in production `vite preview` sits behind Traefik, so requests come in with the public domain as Host
  preview: { allowedHosts: true },
});
