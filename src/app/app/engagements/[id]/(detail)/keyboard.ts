/**
 * Pure curation-queue keyboard helpers (Story 3.5) — string/number in, no DOM dependency, so
 * they're unit-testable in the node test env. The client component reads `el.tagName` /
 * `el.isContentEditable` off the event target and passes them in.
 */

/** Single-key shortcuts (`j/k/e/1/2/3/x`) must NOT fire while the user is typing — suppress when
 * the focused element is a text field or contenteditable. (`Esc` is handled separately, inside
 * the field, so it can still exit an edit.) */
export function isEditableTarget(tagName: string | undefined, isContentEditable = false): boolean {
  if (isContentEditable) return true;
  const t = (tagName ?? "").toUpperCase();
  return t === "INPUT" || t === "TEXTAREA" || t === "SELECT";
}

/** Clamped `j`(down,+1) / `k`(up,−1) navigation. From no-focus (-1), `j`→first, `k`→last; never
 * wraps past the ends; an empty list → -1. */
export function nextIndex(current: number, len: number, dir: 1 | -1): number {
  if (len <= 0) return -1;
  if (current < 0) return dir === 1 ? 0 : len - 1;
  return Math.min(len - 1, Math.max(0, current + dir));
}
