import { defaultSchema } from "rehype-sanitize";
import type { Schema } from "hast-util-sanitize";

/**
 * Sanitize schema for the Markdown-authored parts of the document
 * (headings, links, tables, GFM footnotes, ...).
 *
 * Unlike `rehype-sanitize`'s default, `id`s and the ARIA attributes that
 * reference them pass through unprefixed: {@linkcode rehypeHeadingLinks},
 * run after every id is in place, makes them clobber-safe instead, so it can
 * keep in-document links pointing at them.
 */
export const markdownSchema: Schema = {
  ...defaultSchema,
  clobber: ["name"],
};

/** Presentation attributes Pele puts on any of its shapes. */
const paint = [
  "className",
  "style",
  "dataId",
  "fill",
  "fillOpacity",
  "stroke",
  "strokeWidth",
  "strokeDashArray",
  "strokeLineCap",
  "strokeLineJoin",
];

/**
 * Sanitize schema for SVG produced by our Mermaid renderer,
 * {@link https://pele.run | Pele}.
 *
 * The allow-list is exactly what Pele emits (links and images off): shapes,
 * text, nested `<svg>` for icons, and presentation attributes. Pele colors
 * everything through CSS variables in `style`, so `style` has to stay. It
 * emits no ids, so nothing here can clobber.
 */
export const mermaidSvgSchema: Schema = {
  clobber: [],
  clobberPrefix: "",
  strip: [
    "script",
    "style",
    "foreignObject",
    "animate",
    "animateMotion",
    "animateTransform",
    "set",
    "use",
    "image",
    "a",
  ],
  tagNames: [
    "svg",
    "g",
    "path",
    "polygon",
    "polyline",
    "rect",
    "circle",
    "ellipse",
    "line",
    "text",
    "tspan",
    "title",
    "desc",
  ],
  attributes: {
    svg: [
      ...paint,
      "xmlns",
      "viewBox",
      "x",
      "y",
      "width",
      "height",
      "role",
      "ariaRoleDescription",
      "dataIcon",
    ],
    g: [...paint, "transform", "fontSize", "textAnchor"],
    path: [...paint, "d", "transform"],
    polygon: [...paint, "points"],
    polyline: [...paint, "points"],
    rect: [...paint, "x", "y", "width", "height", "rx", "ry"],
    circle: [...paint, "cx", "cy", "r"],
    ellipse: [...paint, "cx", "cy", "rx", "ry"],
    line: [...paint, "x1", "y1", "x2", "y2"],
    text: [
      ...paint,
      "x",
      "y",
      "dx",
      "dy",
      "textAnchor",
      "fontSize",
      "fontWeight",
      "fontStyle",
      "xmlSpace",
    ],
    tspan: [...paint, "x", "y", "dx", "dy", "fontWeight", "fontStyle"],
  },
};

/**
 * Sanitize schema for the syntax-highlighted HTML produced by Shiki.
 *
 * Shiki's `codeToHast()` builds its hast tree by hand and uses literal
 * HTML attribute names (`class`, `tabindex`) rather than hast's usual
 * camelCase property names (`className`, `tabIndex`), so the schema below
 * intentionally matches those literal names instead of the hast
 * convention used in {@linkcode mermaidSvgSchema}.
 */
export const shikiSchema: Schema = {
  clobber: [],
  clobberPrefix: "",
  tagNames: ["pre", "code", "span"],
  attributes: {
    pre: ["class", "style", "tabindex"],
    code: ["class", "style"],
    span: ["class", "style"],
  },
};
