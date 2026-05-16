import {matchCategory, validateRegexPattern} from '../src/features/categories/services/categorizationService';
import {CategoryRule} from '../src/types';

const makeRule = (overrides: Partial<CategoryRule>): CategoryRule => ({
  id: 'rule1',
  category_id: 'cat1',
  pattern: 'grocery',
  target_field: 'title',
  priority: 1,
  is_enabled: true,
  created_at: '',
  updated_at: '',
  ...overrides,
});

describe('categorizationService', () => {
  describe('matchCategory', () => {
    it('matches title by regex pattern (case-insensitive)', () => {
      const rules = [makeRule({pattern: 'grocery', category_id: 'cat-grocery'})];
      expect(matchCategory('Weekly Grocery Run', null, rules)).toBe('cat-grocery');
    });

    it('returns null when no rules match', () => {
      const rules = [makeRule({pattern: 'grocery'})];
      expect(matchCategory('Uber Eats', null, rules)).toBeNull();
    });

    it('skips disabled rules', () => {
      const rules = [makeRule({pattern: 'grocery', is_enabled: false, category_id: 'cat-grocery'})];
      expect(matchCategory('Weekly Grocery Run', null, rules)).toBeNull();
    });

    it('respects priority order (lower number = higher priority)', () => {
      const rules: CategoryRule[] = [
        makeRule({id: 'r1', pattern: 'uber', category_id: 'cat-transport', priority: 1}),
        makeRule({id: 'r2', pattern: 'uber', category_id: 'cat-food', priority: 2}),
      ];
      expect(matchCategory('Uber ride', null, rules)).toBe('cat-transport');
    });

    it('matches against note field', () => {
      const rules = [makeRule({pattern: 'fuel', target_field: 'note' as const, category_id: 'cat-transport'})];
      expect(matchCategory('Purchase', 'filled up fuel tank', rules)).toBe('cat-transport');
    });

    it('skips rules with invalid regex without throwing', () => {
      const invalidRules = [makeRule({pattern: '[invalid(', category_id: 'cat-x'})];
      const validRules = [makeRule({id: 'r2', pattern: 'grocery', category_id: 'cat-grocery', priority: 2})];
      expect(matchCategory('Grocery Store', null, [...invalidRules, ...validRules])).toBe('cat-grocery');
    });

    it('returns null when rules array is empty', () => {
      expect(matchCategory('anything', null, [])).toBeNull();
    });

    it('handles both title and note being null/empty', () => {
      const rules = [makeRule({pattern: 'test'})];
      expect(matchCategory('', null, rules)).toBeNull();
    });
  });

  describe('validateRegexPattern', () => {
    it('returns null for a valid pattern', () => {
      expect(validateRegexPattern('grocery|food')).toBeNull();
      expect(validateRegexPattern('^uber.*eats$')).toBeNull();
    });

    it('returns an error string for invalid regex', () => {
      const result = validateRegexPattern('[invalid(');
      expect(result).not.toBeNull();
      expect(typeof result).toBe('string');
    });

    it('returns null for empty string (matches everything)', () => {
      // Empty string is valid JS regex
      expect(validateRegexPattern('')).toBeNull();
    });
  });
});
