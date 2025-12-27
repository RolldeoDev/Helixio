/**
 * Issue Number Utilities
 *
 * Centralized logic for parsing issue numbers and computing sort keys.
 * Handles formats like: "1", "1.5", "100", "Annual 1", "Special", etc.
 */

export interface ParsedIssueNumber {
  numericValue: number | null;
  hasNumber: boolean;
}

/**
 * Parse an issue number string to extract its numeric value.
 *
 * @param numberStr - The issue number string (e.g., "1", "1.5", "Annual 1")
 * @returns Object with numericValue (null if non-numeric) and hasNumber flag
 */
export function parseIssueNumber(
  numberStr: string | null | undefined
): ParsedIssueNumber {
  if (!numberStr) {
    return { numericValue: null, hasNumber: false };
  }

  // Try direct number parse first (handles "1", "1.5", "10", etc.)
  const directParse = parseFloat(numberStr);
  if (!isNaN(directParse) && isFinite(directParse)) {
    return { numericValue: directParse, hasNumber: true };
  }

  // Try extracting number from string (handles "Annual 1", "Issue #5", etc.)
  const match = numberStr.match(/(\d+(?:\.\d+)?)/);
  if (match?.[1]) {
    const extracted = parseFloat(match[1]);
    if (!isNaN(extracted) && isFinite(extracted)) {
      return { numericValue: extracted, hasNumber: true };
    }
  }

  // No number found
  return { numericValue: null, hasNumber: false };
}

/**
 * Compute the sort key for an issue number.
 * Returns null for non-numeric issues (they'll sort to end with NULLS LAST).
 *
 * @param numberStr - The issue number string
 * @returns The numeric sort key or null
 */
export function computeIssueNumberSort(
  numberStr: string | null | undefined
): number | null {
  return parseIssueNumber(numberStr).numericValue;
}

/**
 * Prepare metadata fields for database update, including the sort key.
 * Use this whenever setting the `number` field to ensure sync.
 *
 * @param number - The issue number string (or null)
 * @returns Object with both `number` and `issueNumberSort` fields
 */
export function withIssueNumberSort(number: string | null | undefined): {
  number: string | null;
  issueNumberSort: number | null;
} {
  return {
    number: number ?? null,
    issueNumberSort: computeIssueNumberSort(number),
  };
}
