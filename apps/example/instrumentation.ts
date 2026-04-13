import { defineConfig, register as apitrailRegister } from 'apitrail'

const config = defineConfig({
  serviceName: 'apitrail-example',
  debug: true,
  batch: { maxSize: 10, intervalMs: 2000 },
})

export function register() {
  return apitrailRegister(config)
}
