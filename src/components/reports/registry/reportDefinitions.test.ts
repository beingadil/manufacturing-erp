import { describe, expect, it } from 'vitest';
import { getReportDefinition, getReportsByCategory, reportDefinitions } from './reportDefinitions';

describe('reportDefinitions', () => {
  it('resolves every registered report by id', () => {
    const definitions = Object.values(reportDefinitions);
    expect(definitions.length).toBe(52);
    expect(getReportDefinition('purchase-register')?.title).toBe('Purchase Register');
    expect(getReportDefinition('balance-sheet')?.category).toBe('financial');
  });

  it('returns only reports in the requested category', () => {
    const processing = getReportsByCategory('processing');
    expect(processing).toHaveLength(9);
    expect(processing.every((report) => report.category === 'processing')).toBe(true);
  });

  it('returns undefined for unknown report ids', () => {
    expect(getReportDefinition('unknown-report')).toBeUndefined();
  });
});
