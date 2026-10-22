import { defineConfig } from 'vite';
import { coopRelay } from './server/relay';

export default defineConfig({
  plugins: [coopRelay()],
  server: { port: 5190 },
  // in production `vite preview` sits behind Traefik, so requests come in with the public domain as Host
  preview: { allowedHosts: true },
});
