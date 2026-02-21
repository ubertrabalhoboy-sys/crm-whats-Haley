export function matchesOnlyIf(
  onlyIf: unknown,
  context: Record<string, unknown> | null | undefined
) {
  if (!onlyIf || typeof onlyIf !== "object" || Array.isArray(onlyIf)) return true;
  if (!context || typeof context !== "object") return false;

  const ruleEntries = Object.entries(onlyIf as Record<string, unknown>);
  for (const [key, expected] of ruleEntries) {
    if ((context as Record<string, unknown>)[key] !== expected) return false;
  }
  return true;
}

