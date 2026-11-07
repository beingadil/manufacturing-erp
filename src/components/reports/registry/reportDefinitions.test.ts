import { describe, expect, it } from 'vitest';
import { getReportDefinition, getReportsByCategory, reportDefinitions } from './reportDefinitions';

describe('reportDefinitions', () => {
  it('resolves every registered report by id', () => {
    const definitions = Object.values(reportDefinitions);
    expect(definitions.length).toBe(56);
    expect(getReportDefinition('purchase-register')?.title).toBe('Purchase Register');
    expect(getReportDefinition('balance-sheet')?.category).toBe('financial');
    expect(getReportDefinition('manufacturing-profitability')?.category).toBe('manufacturing');
  });

  it('returns only reports in the requested category', () => {
    const processing = getReportsByCategory('processing');
    expect(processing).toHaveLength(9);
    expect(processing.every((report) => report.category === 'processing')).toBe(true);

    const manufacturing = getReportsByCategory('manufacturing');
    expect(manufacturing).toHaveLength(4);
    expect(manufacturing.every((report) => report.category === 'manufacturing')).toBe(true);
  });

  it('returns undefined for unknown report ids', () => {
    expect(getReportDefinition('unknown-report')).toBeUndefined();
  });
});
