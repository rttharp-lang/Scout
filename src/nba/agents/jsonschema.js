// Minimal JSON Schema checker for the subset the Home Court roster uses
// (type, properties, required, additionalProperties:false, items, enum,
// minItems/maxItems, minimum/maximum, pattern). Returns a list of
// human-readable errors with JSON paths; empty means valid.
export function check(schema, value, path = "$") {
  const errs = [];
  const t = schema.type;
  const typeOf = (v) => (Array.isArray(v) ? "array" : v === null ? "null" : Number.isInteger(v) ? "integer" : typeof v);
  const actual = typeOf(value);
  const typeOk = t === "number" ? actual === "number" || actual === "integer" : t === actual;
  if (t && !typeOk) return [`${path}: expected ${t}, got ${actual}`];
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${path}: "${value}" not in [${schema.enum.join(", ")}]`);
  if (t === "string") {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errs.push(`${path}: "${value}" does not match ${schema.pattern}`);
  }
  if (t === "integer" || t === "number") {
    if (schema.minimum != null && value < schema.minimum) errs.push(`${path}: ${value} < minimum ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) errs.push(`${path}: ${value} > maximum ${schema.maximum}`);
  }
  if (t === "array") {
    if (schema.minItems != null && value.length < schema.minItems) errs.push(`${path}: ${value.length} items < minItems ${schema.minItems}`);
    if (schema.maxItems != null && value.length > schema.maxItems) errs.push(`${path}: ${value.length} items > maxItems ${schema.maxItems}`);
    if (schema.items) value.forEach((v, i) => errs.push(...check(schema.items, v, `${path}[${i}]`)));
  }
  if (t === "object") {
    const props = schema.properties || {};
    for (const k of schema.required || []) if (!(k in value)) errs.push(`${path}: missing required "${k}"`);
    if (schema.additionalProperties === false) for (const k of Object.keys(value)) if (!(k in props)) errs.push(`${path}: unexpected property "${k}"`);
    for (const [k, s] of Object.entries(props)) if (k in value) errs.push(...check(s, value[k], `${path}.${k}`));
  }
  return errs;
}
