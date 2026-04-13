import { defineConfig, register as apitrailRegister } from 'apitrail'
import { postgresAdapter } from '@apitrail/postgres'

const databaseUrl = process.env.APITRAIL_DATABASE_URL ?? process.env.DATABASE_URL

const config = defineConfig({
  serviceName: 'apitrail-example',
  debug: true,
  batch: { maxSize: 10, intervalMs: 2000 },
  adapter: databaseUrl
    ? postgresAdapter({
        connectionString: databaseUrl,
        autoMigrate: true,
        poolConfig: { ssl: { rejectUnauthorized: false } },
      })
    : undefined, // falls back to console adapter
})

export function register() {
  return apitrailRegister(config)
}
