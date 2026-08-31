import { describe, expect, it } from 'vitest';
import { DATE_RANGE_OPTIONS } from './ReportFilterBar';

function option(label: string) {
  const opt = DATE_RANGE_OPTIONS.find((o) => o.label === label);
  if (!opt) throw new Error(`missing option: ${label}`);
  return opt.getValue();
}

// Consumers round-trip through `new Date(range.start)` — assert LOCAL calendar
// dates (ISO strings are UTC-shifted, so UTC getters would be off-by-one in PKT).
function local(iso: string) {
  return new Date(iso);
}

describe('ReportFilterBar date-range presets', () => {
  it('Current Financial Year spans 1 July to 30 June (PK fiscal year)', () => {
    const now = new Date();
    const expectedStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    const { start, end } = option('Current Financial Year');

    const startDate = local(start);
    const endDate = local(end);

    expect(startDate.getFullYear()).toBe(expectedStartYear);
    expect(startDate.getMonth()).toBe(6); // July
    expect(startDate.getDate()).toBe(1);

    expect(endDate.getFullYear()).toBe(expectedStartYear + 1);
    expect(endDate.getMonth()).toBe(5); // June
    expect(endDate.getDate()).toBe(30);
  });

  it('Previous Financial Year starts one year earlier', () => {
    const now = new Date();
    const curStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    const { start } = option('Previous Financial Year');
    const startDate = local(start);

    expect(startDate.getFullYear()).toBe(curStartYear - 1);
    expect(startDate.getMonth()).toBe(6);
    expect(startDate.getDate()).toBe(1);
  });

  it('This Year is Jan-Dec', () => {
    const { start, end } = option('This Year');
    const startDate = local(start);
    const endDate = local(end);

    expect(startDate.getMonth()).toBe(0);
    expect(startDate.getDate()).toBe(1);
    expect(endDate.getMonth()).toBe(11);
    expect(endDate.getDate()).toBe(31);
  });
});
