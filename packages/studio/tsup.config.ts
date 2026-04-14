import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
  },
  format: ['esm'],
  target: 'node20',
  clean: false, // don't wipe dist/ui
  sourcemap: true,
  splitting: false,
  minify: false,
  shims: true,
  banner: { js: '#!/usr/bin/env node' },
  external: ['pg', 'hono', '@hono/node-server', 'open'],
})
