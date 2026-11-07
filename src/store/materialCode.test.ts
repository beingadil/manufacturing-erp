import { beforeEach, describe, expect, it } from 'vitest';
import { findMaterialCodeConflict } from '../lib/business/ProductAssemblyService';
import { useERPStore } from './useERPStore';

/**
 * A material's `No.` is how the shop says "that one" — "give me 4 No" must
 * mean exactly one material. So the designation has to be unique, and the
 * comparison has to be forgiving about case and stray spaces, because that is
 * how it is typed at the counter.
 *
 * The rule is enforced in the store so the form, the quick-add modal and any
 * import all get it; these tests pin the pure rule and the store's refusal.
 */

const st = () => useERPStore.getState();

const circle = { id: 'mat-circle', name: 'Circle 12½ Inch', code: '4 No' };
const handle = { id: 'mat-handle', name: 'Handle', code: 'H-1' };
const sheet = { id: 'mat-sheet', name: 'Steel Sheet', code: undefined };

describe('findMaterialCodeConflict', () => {
  it('reports the material already holding this No.', () => {
    expect(findMaterialCodeConflict([circle, handle], '4 No')).toBe('Circle 12½ Inch');
    expect(findMaterialCodeConflict([circle, handle], 'H-1')).toBe('Handle');
  });

  it('returns null when the No. is free', () => {
    expect(findMaterialCodeConflict([circle, handle], 'K-9')).toBeNull();
  });

  it('ignores case and surrounding spaces — it is the same designation', () => {
    expect(findMaterialCodeConflict([circle], '  4 nO  ')).toBe('Circle 12½ Inch');
  });

  it('treats a blank No. as never conflicting', () => {
    // Most materials predate the field and have none; "no number" may apply to
    // any number of them.
    expect(findMaterialCodeConflict([sheet], undefined)).toBeNull();
    expect(findMaterialCodeConflict([sheet, { ...sheet, id: 'b' }], '')).toBeNull();
    expect(findMaterialCodeConflict([sheet, { ...sheet, id: 'b' }], '   ')).toBeNull();
  });

  it('does not treat the edited material as a clash with itself', () => {
    // Saving a material without touching its No. must not be refused.
    expect(findMaterialCodeConflict([circle, handle], '4 No', 'mat-circle')).toBeNull();
  });
});

describe('the store refuses a duplicate No.', () => {
  beforeEach(() => {
    useERPStore.setState({
      materials: [], products: [], categories: [],
    } as any);
    st().addRawMaterial({ name: 'Circle 12½ Inch', code: '4 No', categoryId: 'c' } as any);
    st().addRawMaterial({ name: 'Handle', code: 'H-1', categoryId: 'c' } as any);
  });

  it('accepts a free No.', () => {
    expect(() =>
      st().addRawMaterial({ name: 'Kalsi', code: 'K-1', categoryId: 'c' } as any),
    ).not.toThrow();
    expect(st().materials.find(m => m.code === 'K-1')?.name).toBe('Kalsi');
  });

  it('accepts a blank No. any number of times', () => {
    expect(() => st().addRawMaterial({ name: 'Plain A', categoryId: 'c' } as any)).not.toThrow();
    expect(() => st().addRawMaterial({ name: 'Plain B', categoryId: 'c' } as any)).not.toThrow();
  });

  it('refuses a second material claiming the same No.', () => {
    expect(() =>
      st().addRawMaterial({ name: 'Imposter Circle', code: '4 no', categoryId: 'c' } as any),
    ).toThrow(/already used by "Circle 12½ Inch"/);
    expect(st().materials.find(m => m.name === 'Imposter Circle')).toBeUndefined();
  });

  it('refuses an edit that would move a No. onto another material', () => {
    const circleId = st().materials.find(m => m.code === '4 No')!.id;
    expect(() =>
      st().updateModuleItem('materials', circleId, { code: 'H-1' }),
    ).toThrow(/already used by "Handle"/);
  });

  it('allows an edit that keeps the material its own No.', () => {
    const handleId = st().materials.find(m => m.code === 'H-1')!.id;
    expect(() =>
      st().updateModuleItem('materials', handleId, { code: 'H-1', description: 'Steel bar handle' }),
    ).not.toThrow();
    expect(st().materials.find(m => m.id === handleId)?.description).toBe('Steel bar handle');
  });
});