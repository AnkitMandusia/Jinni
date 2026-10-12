/**
 * Monotonic unique id generator.
 *
 * Previously every transcript/message id was built from `Date.now()` alone.
 * Two calls inside the same JS event loop tick (very common — e.g. pushing a
 * user bubble and immediately setting scene/message in the same handler) can
 * land in the same millisecond and produce the SAME id. React then treats
 * the second bubble as a re-render of the first instead of a new item, which
 * is the "it always shows the same message again" symptom. A module-level
 * counter appended to the timestamp guarantees uniqueness regardless of
 * timing.
 */
let counter = 0;

export function nextId(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now()}_${counter}`;
}

export default nextId;
