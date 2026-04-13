# apitrail

> The API logger for Next.js (and beyond) — your data, your database.

## Install

```bash
npm install apitrail
```

## Usage

```ts
// instrumentation.ts
export { register } from 'apitrail'
```

With custom config:

```ts
// instrumentation.ts
import { register as apitrailRegister, defineConfig } from 'apitrail'
import { consoleAdapter } from 'apitrail/adapters/console'

const config = defineConfig({
  serviceName: 'my-app',
  adapter: consoleAdapter({ pretty: true }),
  skipPaths: ['/api/health', /^\/_next\//],
  slowMs: 300,
})

export function register() {
  return apitrailRegister(config)
}
```

## Adapters

- `apitrail/adapters/console` — bundled, default for dev
- `@apitrail/postgres` — coming soon
- `@apitrail/mongodb` — coming soon

## License

MIT
