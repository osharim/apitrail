import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'adapters/console': 'src/adapters/console.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  target: 'node20',
  external: ['next', '@opentelemetry/api', '@vercel/otel'],
})
