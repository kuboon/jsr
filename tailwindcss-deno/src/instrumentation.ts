import * as env from "./env.ts";

// See: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html#:~:text=Symbol.dispose,-??=%20Symbol(%22Symbol.dispose
// @ts-expect-error — Ensure Symbol.dispose exists
Symbol.dispose ??= Symbol("Symbol.dispose");
// @ts-expect-error — Ensure Symbol.asyncDispose exists
Symbol.asyncDispose ??= Symbol("Symbol.asyncDispose");

class DefaultMap<K, V> extends Map<K, V> {
  constructor(private factory: (key: K) => V) {
    super();
  }

  override get(key: K): V {
    if (!this.has(key)) {
      this.set(key, this.factory(key));
    }
    return super.get(key)!;
  }
}

/**
 * Convert performance.now() timestamp to nanoseconds as BigInt
 * for high-precision timing measurements
 */
function performanceNow(): bigint {
  return BigInt(Math.floor(performance.now() * 1_000_000));
}

/**
 * Performance instrumentation for measuring compilation times and counts.
 */
export class Instrumentation implements Disposable {
  #hits = new DefaultMap(() => ({ value: 0 }));
  #timers = new DefaultMap(() => ({ value: 0n }));
  #timerStack: {
    id: string;
    label: string;
    namespace: string;
    value: bigint;
  }[] = [];

  constructor(
    private defaultFlush = (message: string): void => {
      const encoder = new TextEncoder();
      Deno.stderr.writeSync(encoder.encode(`${message}\n`));
    },
  ) {}

  /**
   * Records a hit (count) for a specific label.
   *
   * @param label - The label to record a hit for
   */
  hit(label: string) {
    this.#hits.get(label).value++;
  }

  /**
   * Starts a timer for a specific label.
   *
   * @param label - The label to start a timer for
   */
  start(label: string) {
    const namespace = this.#timerStack.map((t) => t.label).join("//");
    const id = `${namespace}${namespace.length === 0 ? "" : "//"}${label}`;

    this.#hits.get(id).value++;

    // Create the timer if it doesn't exist yet
    this.#timers.get(id);

    this.#timerStack.push({ id, label, namespace, value: performanceNow() });
  }

  /**
   * Ends the current timer for a specific label.
   *
   * @param label - The label to end the timer for (must match the current active timer)
   * @throws Error if the label doesn't match the current active timer
   */
  end(label: string) {
    const end = performanceNow();

    if (this.#timerStack[this.#timerStack.length - 1].label !== label) {
      throw new Error(
        `Mismatched timer label: \`${label}\`, expected \`${
          this.#timerStack[this.#timerStack.length - 1].label
        }\``,
      );
    }

    const parent = this.#timerStack.pop()!;
    const elapsed = end - parent.value;
    this.#timers.get(parent.id).value += elapsed;
  }

  /**
   * Resets all recorded measurements.
   */
  reset() {
    this.#hits.clear();
    this.#timers.clear();
    this.#timerStack.splice(0);
  }

  /**
   * Reports the collected measurements.
   *
   * @param flush - Callback to output the report (defaults to writing to stderr)
   */
  report(flush = this.defaultFlush) {
    const output: string[] = [];
    let hasHits = false;

    // Auto end any pending timers
    for (let i = this.#timerStack.length - 1; i >= 0; i--) {
      this.end(this.#timerStack[i].label);
    }

    for (const [label, { value: count }] of this.#hits.entries()) {
      if (this.#timers.has(label)) continue;
      if (output.length === 0) {
        hasHits = true;
        output.push("Hits:");
      }

      const depth = (label as string).split("//").length;
      output.push(`${"  ".repeat(depth)}${label} ${dim(blue(`× ${count}`))}`);
    }

    if (this.#timers.size > 0 && hasHits) {
      output.push("\nTimers:");
    }

    let max = -Infinity;
    const computed = new Map<string, string>();
    for (const [label, { value }] of this.#timers) {
      const x = `${(Number(value) / 1e6).toFixed(2)}ms`;
      computed.set(label as string, x);
      max = Math.max(max, x.length);
    }

    for (const label of this.#timers.keys()) {
      const depth = (label as string).split("//").length;
      output.push(
        `${dim(`[${computed.get(label as string)!.padStart(max, " ")}]`)}${
          "  ".repeat(depth - 1)
        }${depth === 1 ? " " : dim(" ↳ ")}${
          (label as string).split("//").pop()
        } ${
          this.#hits.get(label as string).value === 1
            ? ""
            : dim(blue(`× ${this.#hits.get(label as string).value}`))
        }`.trimEnd(),
      );
    }

    flush(`\n${output.join("\n")}\n`);
    this.reset();
  }

  [Symbol.dispose]() {
    env.DEBUG && this.report();
  }
}

function dim(input: string) {
  return `\u001b[2m${input}\u001b[22m`;
}

function blue(input: string) {
  return `\u001b[34m${input}\u001b[39m`;
}
