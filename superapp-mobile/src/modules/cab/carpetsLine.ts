/** How many carpets are awake, in words — works for 0, 1, a handful or dozens of riders. */
export function carpetsLine(n: number, paused = false): string {
  if (paused) return 'Carpets are resting right now. Please try later.';
  if (n <= 0) return 'All carpets are busy right now — make your wish, we will find one';
  if (n === 1) return '🧞 1 carpet awake near you';
  if (n < 10) return `🧞 ${n} carpets awake near you`;
  return '🧞 10+ carpets awake near you';
}

export function vehicleFreeLabel(n: number): string {
  if (n <= 0) return 'none free';
  return n >= 10 ? '10+ free' : `${n} free`;
}
