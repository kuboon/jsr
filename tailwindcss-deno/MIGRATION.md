# Migration from Node.js to Deno

This document describes the changes made to migrate `@tailwindcss/node` to Deno.

## Key Changes

### 1. Module Resolution and Loading

**Before (Node.js):**

```typescript
import EnhancedResolve from "enhanced-resolve";
import { createJiti, type Jiti } from "jiti";

const resolver = EnhancedResolve.ResolverFactory.createResolver({
  fileSystem: new EnhancedResolve.CachedInputFileSystem(fs, 4000),
  // ... config
});

let jiti = createJiti(import.meta.url, { moduleCache: false });
```

**After (Deno):**

```typescript
import { ResolutionMode, Workspace } from "@deno/loader";

const workspace = new Workspace({
  nodeConditions: ["deno", "import", "default"],
  noConfig: false,
  noLock: false,
});

const loader = await workspace.createLoader({
  entrypoints: [toFileUrl(base).href],
});

const resolved = loader.resolve(id, referrer, ResolutionMode.Import);
```

### 2. File System Operations

**Before (Node.js):**

```typescript
import fs from "node:fs";
import fsPromises from "node:fs/promises";

const content = await fsPromises.readFile(path, "utf-8");
const stats = await fsPromises.stat(path);
```

**After (Deno):**

```typescript
const content = await Deno.readTextFile(path);
const stats = await Deno.stat(path);
```

### 3. Path Utilities

**Before (Node.js):**

```typescript
import path from "node:path";
import { pathToFileURL } from "node:url";

const dir = path.dirname(filePath);
const url = pathToFileURL(filePath);
```

**After (Deno):**

```typescript
import { dirname } from "@std/path";
import { toFileUrl } from "@std/path/to-file-url";

const dir = dirname(filePath);
const url = toFileUrl(filePath);
```

### 4. Environment Variables

**Before (Node.js):**

```typescript
const debug = process.env.DEBUG;
const nodeEnv = process.env.NODE_ENV;
```

**After (Deno):**

```typescript
const debug = Deno.env.get("DEBUG");
const nodeEnv = Deno.env.get("NODE_ENV");
```

### 5. High-Resolution Timers

**Before (Node.js):**

```typescript
const start = process.hrtime.bigint();
const elapsed = process.hrtime.bigint() - start;
```

**After (Deno):**

```typescript
const start = performance.now() * 1_000_000n;
const elapsed = (performance.now() * 1_000_000n) - start;
```

### 6. Buffer Operations

**Before (Node.js):**

```typescript
const buffer = Buffer.from(input);
const base64 = buffer.toString("base64");
```

**After (Deno):**

```typescript
const encoder = new TextEncoder();
const data = encoder.encode(input);
const base64 = btoa(String.fromCharCode(...data));
```

### 7. Module Registration Hooks

**Before (Node.js):**

```typescript
import * as Module from "node:module";
import { pathToFileURL } from "node:url";

Module.register?.(
  pathToFileURL(require.resolve("@tailwindcss/node/esm-cache-loader")),
);
```

**After (Deno):**

```typescript
// Not needed in Deno - module loading is handled natively
// The @deno/loader is used internally for module resolution
```

## Dependencies Mapping

| Node.js Package         | Deno Alternative        | Purpose              |
| ----------------------- | ----------------------- | -------------------- |
| `enhanced-resolve`      | `@deno/loader`          | Module resolution    |
| `jiti`                  | Native `import()`       | TypeScript loading   |
| `node:fs`               | `Deno` APIs             | File system          |
| `node:path`             | `@std/path`             | Path utilities       |
| `node:url`              | `@std/path/to-file-url` | URL conversion       |
| `@jridgewell/remapping` | Same (npm)              | Source map remapping |
| `lightningcss`          | Same (npm)              | CSS optimization     |
| `magic-string`          | Same (npm)              | String manipulation  |
| `source-map-js`         | Same (npm)              | Source maps          |
| `tailwindcss`           | Same (npm)              | Tailwind CSS core    |

## Benefits of Deno Migration

1. **Native TypeScript Support**: No transpilation needed
2. **Built-in Tooling**: Formatter, linter, test runner included
3. **Secure by Default**: Explicit permissions required
4. **Standard Library**: Consistent, well-documented APIs
5. **Modern Module System**: ESM-first, supports import maps
6. **Better Performance**: Optimized runtime built on V8

## Testing

Run tests with:

```bash
deno test --allow-read --allow-env
```

Run examples with:

```bash
deno run --allow-read --allow-env examples/basic.ts
```

## Publishing

This package can be published to JSR (JavaScript Registry):

```bash
deno publish
```

## Limitations

- Some features require the actual `tailwindcss` package to be available
- CSS parsing functions are placeholders until integrated with tailwindcss
- URL rewriting is simplified compared to the full Node.js version

## Future Work

- [ ] Full integration with tailwindcss CSS parser
- [ ] Add comprehensive tests with tailwindcss
- [ ] Benchmark performance vs Node.js version
- [ ] Add CI/CD pipeline
- [ ] Publish to JSR
