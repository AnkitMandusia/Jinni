/** Per-vehicle availability wording on the "Choose your carpet" cards. */
export function nearbyLabel(available: boolean): string {
  return available ? 'Nearby' : 'None nearby';
}
