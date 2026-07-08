import { defaultSchema } from "rehype-sanitize";
import type { Schema } from "hast-util-sanitize";

/**
 * Sanitize schema for the Markdown-authored parts of the document
 * (headings, links, tables, GFM footnotes, ...).
 */
export const markdownSchema: Schema = defaultSchema;

/**
 * Sanitize schema for SVG produced by our own Mermaid renderer.
 *
 * `clobber`/`clobberPrefix` are disabled here: the ids are fixed strings
 * chosen by the renderer (e.g. `arrowhead`), never derived from user
 * input, and `marker-end="url(#arrowhead)"`-style references would break
 * if the id got the usual `user-content-` clobber prefix applied.
 */
export const mermaidSvgSchema: Schema = {
  clobber: [],
  clobberPrefix: "",
  strip: [
    "script",
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
    "defs",
    "marker",
    "path",
    "polygon",
    "polyline",
    "rect",
    "circle",
    "ellipse",
    "line",
    "text",
    "tspan",
    "style",
    "title",
    "desc",
  ],
  attributes: {
    svg: ["xmlns", "viewBox", "width", "height", "style", "className"],
    g: ["className", "style", "transform"],
    marker: [
      "id",
      "markerWidth",
      "markerHeight",
      "refX",
      "refY",
      "orient",
      "markerUnits",
    ],
    path: [
      "d",
      "fill",
      "stroke",
      "strokeWidth",
      "strokeDasharray",
      "markerStart",
      "markerEnd",
      "markerMid",
      "className",
      "style",
      "transform",
    ],
    polygon: ["points", "fill", "stroke", "strokeWidth", "className"],
    polyline: [
      "points",
      "fill",
      "stroke",
      "strokeWidth",
      "markerStart",
      "markerEnd",
      "markerMid",
      "className",
    ],
    rect: [
      "x",
      "y",
      "width",
      "height",
      "rx",
      "ry",
      "fill",
      "stroke",
      "strokeWidth",
      "className",
    ],
    circle: ["cx", "cy", "r", "fill", "stroke", "strokeWidth", "className"],
    ellipse: [
      "cx",
      "cy",
      "rx",
      "ry",
      "fill",
      "stroke",
      "strokeWidth",
      "className",
    ],
    line: [
      "x1",
      "y1",
      "x2",
      "y2",
      "stroke",
      "strokeWidth",
      "strokeDasharray",
      "markerStart",
      "markerEnd",
      "className",
    ],
    text: [
      "x",
      "y",
      "dx",
      "dy",
      "textAnchor",
      "fill",
      "fontSize",
      "fontWeight",
      "fontStyle",
      "fontFamily",
      "className",
    ],
    tspan: ["x", "y", "dx", "dy", "fill", "className"],
  },
};

/**
 * Sanitize schema for the syntax-highlighted HTML produced by Shiki.
 *
 * Shiki's `codeToHast()` builds its hast tree by hand and uses literal
 * HTML attribute names (`class`, `tabindex`) rather than hast's usual
 * camelCase property names (`className`, `tabIndex`), so the schema below
 * intentionally matches those literal names instead of the hast
 * convention used in `mermaidSvgSchema`.
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
