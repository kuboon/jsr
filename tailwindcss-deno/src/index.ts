import * as env from "./env.ts";

// Export all modules
export * from "./compile.ts";
export * from "./instrumentation.ts";
export * from "./normalize-path.ts";
export * from "./optimize.ts";
export * from "./source-maps.ts";
export { env };

// Note: Deno doesn't need module registration hooks like Node.js
// Module loading is handled natively by Deno's runtime
// The @deno/loader is used internally in compile.ts for module resolution
