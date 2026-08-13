import type { GraphEntityShapeVariant } from "./graphTheme";

export const ENTITY_SHAPE_ALIASES: Array<[GraphEntityShapeVariant, RegExp]> = [
  ["concept", /\b(concept|concepto)\b/i],
  ["field", /\b(field|campo|variable)\b/i],
  ["classifier", /\b(classifier|clasificador)\b/i],
  ["operation", /\b(operation|operacion|transform)\b/i],
  ["source", /\b(source|fuente|dataset|origin)\b/i],
  ["normative", /\b(normative|normativa|regulation|legal)\b/i],
];

export function classifyEntityShape(
  nodeType?: string,
  semanticGroup?: string,
  content?: string,
  properties?: Record<string, unknown>,
): GraphEntityShapeVariant {
  const values = [
    nodeType,
    semanticGroup,
    content,
    String(properties?.type ?? ""),
    String(properties?.category ?? ""),
    String(properties?.label ?? ""),
  ]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join(" ");

  for (const [shape, pattern] of ENTITY_SHAPE_ALIASES) {
    if (pattern.test(values)) {
      return shape;
    }
  }

  return "entity";
}
