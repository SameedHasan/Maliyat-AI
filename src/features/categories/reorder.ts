/**
 * Moves `id` one place up (-1) or down (+1) among its siblings and returns the new
 * order, or null when it is already at that end.
 */
export function moveSibling(
  siblingIds: readonly string[],
  id: string,
  direction: -1 | 1,
): string[] | null {
  const index = siblingIds.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= siblingIds.length) return null;
  const next = [...siblingIds];
  next[index] = siblingIds[target]!;
  next[target] = id;
  return next;
}
