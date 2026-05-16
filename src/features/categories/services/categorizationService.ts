import {CategoryRule} from '../../types';

/**
 * Pure auto-categorization helper.
 * Returns a matching category ID or null.
 * Only looks at enabled rules in priority order.
 * Invalid regex patterns are safely skipped.
 */
export function matchCategory(
  title: string,
  note: string | null,
  rules: CategoryRule[],
): string | null {
  const enabledRules = rules
    .filter(r => r.is_enabled)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of enabledRules) {
    let regex: RegExp;
    try {
      regex = new RegExp(rule.pattern, 'i');
    } catch {
      // Invalid pattern - skip
      continue;
    }

    const testTitle = rule.target_field === 'title' || rule.target_field === 'both';
    const testNote = rule.target_field === 'note' || rule.target_field === 'both';

    if (testTitle && regex.test(title)) {
      return rule.category_id;
    }
    if (testNote && note && regex.test(note)) {
      return rule.category_id;
    }
  }
  return null;
}

/**
 * Validate a regex pattern - returns null if valid, error string if not.
 */
export function validateRegexPattern(pattern: string): string | null {
  try {
    new RegExp(pattern);
    return null;
  } catch (e: any) {
    return e.message ?? 'Invalid regex pattern';
  }
}
