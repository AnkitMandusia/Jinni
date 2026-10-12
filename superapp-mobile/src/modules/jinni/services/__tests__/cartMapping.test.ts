import { buildCartLines } from '../cartMapping';
import type { ProposedItem } from '../../types';

function item(overrides: Partial<ProposedItem>): ProposedItem {
  return {
    id: 'x1',
    name: 'Test Item',
    price: 10,
    quantity: 1,
    available: true,
    moduleType: 'grocery',
    ...overrides,
  };
}

describe('buildCartLines', () => {
  it('returns null when nothing is available', () => {
    const result = buildCartLines([item({ available: false })]);
    expect(result).toBeNull();
  });

  it('returns null when every available item has quantity 0', () => {
    const result = buildCartLines([item({ available: true, quantity: 0 })]);
    expect(result).toBeNull();
  });

  it('filters out unavailable items but keeps available ones', () => {
    const result = buildCartLines([
      item({ id: 'a', available: true, quantity: 2 }),
      item({ id: 'b', available: false, quantity: 1 }),
    ]);
    expect(result).not.toBeNull();
    expect(result!.lines).toHaveLength(1);
    expect(result!.lines[0].line.id).toBe('a');
  });

  it('prefers productId over id for the cart line id', () => {
    const result = buildCartLines([item({ id: 'proposed_1', productId: 'prod_42' })]);
    expect(result!.lines[0].line.id).toBe('prod_42');
  });

  it('tags the module type from the first available item', () => {
    const result = buildCartLines([item({ moduleType: 'food' })]);
    expect(result!.moduleType).toBe('food');
  });

  it('carries restaurant metadata through for food items', () => {
    const result = buildCartLines([
      item({ moduleType: 'food', restaurantId: 'r1', restaurantName: 'Test Dhaba' }),
    ]);
    expect(result!.lines[0].meta).toEqual({ restaurantId: 'r1', restaurantName: 'Test Dhaba' });
  });

  it('preserves the quantity set on each item (e.g. from a spoken "do X")', () => {
    const result = buildCartLines([item({ quantity: 2 })]);
    expect(result!.lines[0].line.quantity).toBe(2);
  });
});
