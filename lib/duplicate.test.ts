import { describe, it, expect } from 'vitest';
import { findDuplicate } from './duplicate';

describe('findDuplicate', () => {
  const existing = [
    { id: '1', title: 'Мангал' },
    { id: '2', title: 'Спальник' },
  ];

  it('matches exact (case-insensitive)', () => {
    expect(findDuplicate(existing, 'мангал')?.id).toBe('1');
  });

  it('matches with typo', () => {
    expect(findDuplicate(existing, 'Магнал')?.id).toBe('1');
  });

  it('matches substring', () => {
    expect(findDuplicate(existing, 'Большой мангал')?.id).toBe('1');
  });

  it('returns null for unrelated', () => {
    expect(findDuplicate(existing, 'Топор')).toBeNull();
  });

  it('ignores too short tokens', () => {
    expect(findDuplicate([{ id: 'a', title: 'Кот' }], 'Сок')).toBeNull();
  });
});
