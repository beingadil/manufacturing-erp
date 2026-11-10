import { describe, expect, it } from 'vitest';
import {
  buildRange,
  customRange,
  inRange,
  isoDate,
  parseDay,
  parseRange,
  rangeToParams,
} from './monitorRange';

const NOW = new Date(2026, 10, 10); // 10 Nov 2026 (local)

describe('monitorRange', () => {
  it('parses today and gives the equal prior window (yesterday)', () => {
    const r = buildRange('today', NOW);
    expect(r.id).toBe('today');
    expect(r.from).toBe('2026-11-10');
    expect(r.to).toBe('2026-11-10');
    expect(r.prior).toEqual({ from: '2026-11-09', to: '2026-11-09' });
    expect(r.days).toBe(1);
  });

  it('parses yesterday as a whole day', () => {
    const r = buildRange('yesterday', NOW);
    expect(r.from).toBe('2026-11-09');
    expect(r.to).toBe('2026-11-09');
    expect(r.prior).toEqual({ from: '2026-11-08', to: '2026-11-08' });
  });

  it('parses 7d and 30d with prior equal-length windows', () => {
    const r7 = buildRange('7d', NOW);
    expect(r7.from).toBe('2026-11-04');
    expect(r7.to).toBe('2026-11-10');
    expect(r7.prior).toEqual({ from: '2026-10-28', to: '2026-11-03' });

    const r30 = buildRange('30d', NOW);
    expect(r30.from).toBe('2026-10-12');
    expect(r30.to).toBe('2026-11-10');
    expect(r30.prior).toEqual({ from: '2026-09-12', to: '2026-10-11' });
  });

  it('parses MTD with equal-length prior MTD (same days elapsed)', () => {
    const r = buildRange('mtd', NOW);
    expect(r.from).toBe('2026-11-01');
    expect(r.to).toBe('2026-11-10');
    expect(r.prior).toEqual({ from: '2026-10-01', to: '2026-10-10' });
    expect(r.days).toBe(10);
  });

  it('parses custom ranges, normalising swapped bounds', () => {
    const r = customRange('2026-11-10', '2026-11-05');
    expect(r).not.toBeNull();
    expect(r!.from).toBe('2026-11-05');
    expect(r!.to).toBe('2026-11-10');
    expect(r!.prior).toEqual({ from: '2026-10-30', to: '2026-11-04' });
  });

  it('rejects invalid custom dates', () => {
    expect(customRange('nope', '2026-11-10')).toBeNull();
    expect(customRange('', '')).toBeNull();
  });

  it('parseRange falls back to today on garbage input', () => {
    expect(parseRange('?range=garbage').id).toBe('today');
    expect(parseRange('').id).toBe('today');
    expect(parseRange('?range=custom&from=bad&to=worse').id).toBe('today');
  });

  it('parseRange reads a valid custom window', () => {
    const r = parseRange('?range=custom&from=2026-11-01&to=2026-11-10');
    expect(r.id).toBe('custom');
    expect(r.from).toBe('2026-11-01');
    expect(r.to).toBe('2026-11-10');
  });

  it('rangeToParams round-trips presets and custom', () => {
    expect(rangeToParams(buildRange('7d', NOW))).toBe('range=7d');
    const custom = customRange('2026-11-01', '2026-11-10')!;
    expect(rangeToParams(custom)).toBe('range=custom&from=2026-11-01&to=2026-11-10');
  });

  it('inRange is inclusive and date-prefix tolerant', () => {
    expect(inRange('2026-11-05', '2026-11-01', '2026-11-10')).toBe(true);
    expect(inRange('2026-11-05T18:00:00Z', '2026-11-01', '2026-11-10')).toBe(true);
    expect(inRange('2026-11-11', '2026-11-01', '2026-11-10')).toBe(false);
    expect(inRange(undefined, '2026-11-01', '2026-11-10')).toBe(false);
  });

  it('parseDay/isoDate round-trip', () => {
    expect(isoDate(parseDay('2026-02-13')!)).toBe('2026-02-13');
    expect(parseDay('2026-13-99')).toBeNull();
  });
});
