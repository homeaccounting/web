import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card';

describe('CardTitle', () => {
  it('renders at text-lg, not the stock shadcn text-2xl, so titles sit below the page h1', () => {
    render(<CardTitle>Section title</CardTitle>);
    const title = screen.getByText('Section title');
    expect(title.className).toContain('text-lg');
    expect(title.className).not.toContain('text-2xl');
  });

  it('keeps the semibold weight and tight tracking from the stock shadcn styles', () => {
    render(<CardTitle>Section title</CardTitle>);
    const title = screen.getByText('Section title');
    expect(title.className).toContain('font-semibold');
    expect(title.className).toContain('leading-none');
    expect(title.className).toContain('tracking-tight');
  });

  it('merges a caller-provided className alongside the default styles', () => {
    render(<CardTitle className="custom-class">Section title</CardTitle>);
    const title = screen.getByText('Section title');
    expect(title.className).toContain('custom-class');
    expect(title.className).toContain('text-lg');
  });
});

describe('Card composition', () => {
  it('renders header, title, description, content, and footer together', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Details about the account</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );
    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.getByText('Details about the account')).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });
});
