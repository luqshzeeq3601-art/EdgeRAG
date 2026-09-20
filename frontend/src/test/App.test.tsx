import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { App } from '../App';

vi.mock('../api/client', () => ({
  api: {
    getHealth: vi.fn().mockResolvedValue({
      status: 'healthy',
      sqlite: { ready: true },
      ollama: { ready: true },
    }),
    listDocuments: vi.fn().mockResolvedValue([]),
    listModels: vi.fn().mockResolvedValue([
      { name: 'smollm2:135m', size: 270000000, details: {} },
    ]),
    listSuites: vi.fn().mockResolvedValue([
      { id: 'quick_dev', name: 'Quick Dev', questions: [] },
    ]),
    listBenchmarks: vi.fn().mockResolvedValue([]),
  },
}));

describe('App Component', () => {
  it('renders sidebar navigation and switches between pages', async () => {
    render(<App />);

    expect(screen.getByText('EdgeRAG')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: /Primary navigation/i });
    expect(within(nav).getByRole('button', { name: /^Ask$/i })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: /^Manuals$/i })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: /^Compare$/i })).toBeInTheDocument();

    // Default is Ask tab
    expect(screen.getByPlaceholderText(/Ask about your manuals/i)).toBeInTheDocument();

    // Switch to Manuals tab
    fireEvent.click(within(nav).getByRole('button', { name: /^Manuals$/i }));
    expect(screen.getByRole('heading', { name: 'Manuals' })).toBeInTheDocument();

    // Switch to Compare tab
    fireEvent.click(within(nav).getByRole('button', { name: /^Compare$/i }));
    expect(screen.getByRole('heading', { name: 'Benchmark' })).toBeInTheDocument();
  });

  it('toggles sidebar collapse on desktop', () => {
    localStorage.clear();
    render(<App />);

    const collapseButtons = screen.getAllByRole('button', { name: /Collapse sidebar/i });
    expect(collapseButtons.length).toBeGreaterThan(0);

    // Click collapse button
    fireEvent.click(collapseButtons[0]);

    // Expand button should now be present
    const expandButtons = screen.getAllByRole('button', { name: /Expand sidebar/i });
    expect(expandButtons.length).toBeGreaterThan(0);

    // Click expand button to restore
    fireEvent.click(expandButtons[0]);
    expect(screen.getAllByRole('button', { name: /Collapse sidebar/i }).length).toBeGreaterThan(0);
  });
});
