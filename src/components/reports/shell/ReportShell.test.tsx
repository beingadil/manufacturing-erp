import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReportDefinition } from '../registry/reportTypes';
import { ReportShell } from './ReportShell';

afterEach(() => cleanup());

const definition: ReportDefinition = {
  id: 'sample-report',
  category: 'purchase',
  categoryLabel: 'Purchase Reports',
  title: 'Sample Report',
  description: 'Sample description',
  component: () => null,
};

describe('ReportShell', () => {
  it('renders report identity and content', () => {
    render(<ReportShell definition={definition}><div>Report content</div></ReportShell>);
    expect(screen.getByText('Purchase Reports')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Sample Report' })).toBeTruthy();
    expect(screen.getByText('Sample description')).toBeTruthy();
    expect(screen.getByText('Report content')).toBeTruthy();
  });

  it('renders optional slots', () => {
    render(
      <ReportShell definition={definition} actions={<button>Export</button>} filters={<div>Filters</div>} summary={<div>Summary</div>}>
        <div>Content</div>
      </ReportShell>,
    );
    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy();
    expect(screen.getByText('Filters')).toBeTruthy();
    expect(screen.getByText('Summary')).toBeTruthy();
  });

  it('can hide the header', () => {
    render(<ReportShell definition={definition} showHeader={false}><div>Content</div></ReportShell>);
    expect(screen.queryByRole('heading', { name: 'Sample Report' })).toBeNull();
    expect(screen.getByText('Content')).toBeTruthy();
  });
});
