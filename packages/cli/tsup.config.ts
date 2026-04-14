import { defineConfig } from 'tsup'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  entry: { cli: 'src/cli.ts' },
  format: ['esm'],
  target: 'node20',
  clean: true,
  sourcemap: true,
  splitting: false,
  minify: false,
  shims: true,
  banner: { js: '#!/usr/bin/env node' },
  define: { __APITRAIL_VERSION__: JSON.stringify(pkg.version) },
  external: ['pg', '@apitrail/postgres'],
})
