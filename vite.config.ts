import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({ base: './', plugins: [react()], resolve: { alias: { '@': resolve(process.cwd()) } }, server: { host: '127.0.0.1', port: 5173, strictPort: true } });
