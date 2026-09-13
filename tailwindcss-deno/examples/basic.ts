/**
 * Example: Basic usage of tailwindcss-deno
 *
 * Run with: deno run --allow-read --allow-env examples/basic.ts
 */
import { compile, Instrumentation, optimize } from "../src/index.ts";

const inst = new Instrumentation();

const css = Deno.readTextFileSync("./examples/style.css");

// Example 1: Compile Tailwind CSS
console.log("1. Compiling Tailwind CSS...");
inst.start("compile-tailwind");
const compiler = await compile(css, {
  base: Deno.cwd(),
  onDependency: (path: string) => {
    console.log(`  - Dependency: ${path}`);
  },
});
const output = compiler.build(["container", "flex", "bg-blue-500"]);
inst.end("compile-tailwind");
console.log("  ✓ Compilation successful");
console.log(`  Output CSS:\n${output}`);

// Example 3: CSS Optimization
console.log("\n3. CSS Optimization:");

try {
  inst.start("optimize-css");
  const result = optimize(output, {
    file: "example.css",
    minify: true,
  });
  inst.end("optimize-css");
  console.log("  ✓ CSS optimized successfully");
  console.log(
    `  length: from ${output.length} to ${result.code.length} characters`,
  );
} catch (error) {
  console.log(
    `  ⚠ Optimization skipped (requires lightningcss): ${
      (error as Error).message
    }`,
  );
}

// Example 4: Instrumentation
console.log("\n4. Performance Instrumentation:");

console.log("  Collecting metrics...");
inst.report((msg) => console.log(msg));

console.log("\n✅ Example completed!");
