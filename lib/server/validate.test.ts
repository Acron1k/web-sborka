import { describe, expect, it } from 'vitest';
import { isUuid, isListType, isCategoryOrNull, isImportance } from './validate';

describe('isUuid', () => {
  it('принимает валидный uuid', () => {
    expect(isUuid('a3bb189e-8bf9-3888-9912-ace4e6543002')).toBe(true);
  });
  it('отклоняет мусор, null и SQL-инъекции', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid("'; drop table trips; --")).toBe(false);
  });
});

describe('isListType', () => {
  it('принимает common/personal/food', () => {
    expect(isListType('common')).toBe(true);
    expect(isListType('personal')).toBe(true);
    expect(isListType('food')).toBe(true);
  });
  it('отклоняет прочее', () => {
    expect(isListType('shopping')).toBe(false);
    expect(isListType(null)).toBe(false);
  });
});

describe('isCategoryOrNull', () => {
  it('принимает null и валидные категории', () => {
    expect(isCategoryOrNull(null)).toBe(true);
    expect(isCategoryOrNull('meat')).toBe(true);
    expect(isCategoryOrNull('other')).toBe(true);
  });
  it('отклоняет неизвестные категории', () => {
    expect(isCategoryOrNull('fish')).toBe(false);
  });
});

describe('isImportance', () => {
  it('принимает critical/recommended/optional', () => {
    expect(isImportance('critical')).toBe(true);
    expect(isImportance('optional')).toBe(true);
  });
  it('отклоняет прочее', () => {
    expect(isImportance('meh')).toBe(false);
  });
});
