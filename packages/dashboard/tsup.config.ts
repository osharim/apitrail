import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.tsx',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  minify: false,
  target: 'es2022',
  external: ['next', 'react', 'react-dom', 'pg', 'server-only'],
  esbuildOptions(options) {
    options.jsx = 'automatic'
  },
})
