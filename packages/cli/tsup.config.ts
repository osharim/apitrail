import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { cli: 'src/cli.ts' },
  format: ['esm'],
  target: 'node20',
  clean: true,
  sourcemap: true,
  shims: true,
  banner: { js: '#!/usr/bin/env node' },
  external: ['pg', '@apitrail/postgres'],
})
