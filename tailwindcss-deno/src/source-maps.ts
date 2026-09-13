import { SourceMapGenerator } from "source-map-js";
import type { DecodedSourceMap } from "tailwindcss";
import { encodeBase64 } from "@std/encoding";

export type { DecodedSourceMap };
type DecodedSource = DecodedSourceMap["sources"][0];

/**
 * Interface for handling source maps.
 */
export interface SourceMap {
  /** The raw source map JSON string */
  readonly raw: string;
  /** The source map as an inline data URI comment */
  readonly inline: string;
  /**
   * Generates a source map comment pointing to the given URL.
   *
   * @param url - The URL where the source map is hosted
   * @returns The source map comment
   */
  comment(url: string): string;
}

class DefaultMap<T = string, V = unknown> extends Map<T, V> {
  constructor(private factory: (key: T, self: DefaultMap<T, V>) => V) {
    super();
  }
  override get(key: T): V {
    let value = super.get(key);

    if (value === undefined) {
      value = this.factory(key, this);
      this.set(key, value);
    }

    return value;
  }
}
function serializeSourceMap(map: DecodedSourceMap): string {
  const generator = new SourceMapGenerator();

  let id = 1;
  const sourceTable = new DefaultMap<
    DecodedSource | null,
    {
      url: string;
      content: string;
    }
  >((src) => {
    return {
      url: src?.url ?? `<unknown ${id++}>`,
      content: src?.content ?? "<none>",
    };
  });

  for (const mapping of map.mappings) {
    const original = sourceTable.get(mapping.originalPosition?.source ?? null);

    generator.addMapping({
      generated: mapping.generatedPosition,
      original: mapping.originalPosition,
      source: original.url,
      name: mapping.name,
    });

    generator.setSourceContent(original.url, original.content);
  }

  return generator.toString();
}

/**
 * Converts a decoded source map into a usable SourceMap object.
 *
 * @param map - The decoded source map or raw JSON string
 * @returns A SourceMap object with utilities
 */
export function toSourceMap(map: DecodedSourceMap | string): SourceMap {
  const raw = typeof map === "string" ? map : serializeSourceMap(map);

  function comment(url: string) {
    return `/*# sourceMappingURL=${url} */\n`;
  }

  return {
    raw,
    get inline() {
      const base64 = encodeBase64(raw);
      return comment(`data:application/json;base64,${base64}`);
    },
    comment,
  };
}
