// Deno native environment variable access
/**
 * Indicates whether debug mode is enabled based on the DEBUG environment variable.
 * Supports `DEBUG=*`, `DEBUG=tailwindcss`, and specific project debugging patterns.
 */
export const DEBUG: boolean = resolveDebug(Deno.env.get("DEBUG"));

function resolveDebug(debug: string | undefined): boolean {
  if (typeof debug === "boolean") {
    return debug;
  }

  if (debug === undefined) {
    return false;
  }

  // Environment variables are strings, so convert to boolean
  if (debug === "true" || debug === "1") {
    return true;
  }

  if (debug === "false" || debug === "0") {
    return false;
  }

  // Keep the debug convention into account:
  // DEBUG=* -> This enables all debug modes
  // DEBUG=projectA,projectB,projectC -> This enables debug for projectA, projectB and projectC
  // DEBUG=projectA:* -> This enables all debug modes for projectA (if you have sub-types)
  // DEBUG=projectA,-projectB -> This enables debug for projectA and explicitly disables it for projectB

  if (debug === "*") {
    return true;
  }

  const debuggers = debug.split(",").map((d) => d.split(":")[0]);

  // Ignoring tailwindcss
  if (debuggers.includes("-tailwindcss")) {
    return false;
  }

  // Including tailwindcss
  if (debuggers.includes("tailwindcss")) {
    return true;
  }

  return false;
}
