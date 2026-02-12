import { defineConfig } from 'vite';
import polyx from '@polyx/vite-plugin';

export default defineConfig({
  plugins: [polyx()],
});
