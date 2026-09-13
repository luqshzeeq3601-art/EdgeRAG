import { render, screen, fireEvent } from '@testing-library/react';
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
  it('renders top navigation and switches between pages', async () => {
    render(<App />);

    expect(screen.getByText('EdgeRAG')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Assistant/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Documents/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Benchmarks/i })).toBeInTheDocument();

    // Default is Assistant tab
    expect(screen.getByPlaceholderText(/Ask a technical question/i)).toBeInTheDocument();

    // Switch to Documents tab
    fireEvent.click(screen.getByRole('button', { name: /Documents/i }));
    expect(screen.getByText('Document Workspace')).toBeInTheDocument();

    // Switch to Benchmarks tab
    fireEvent.click(screen.getByRole('button', { name: /Benchmarks/i }));
    expect(screen.getByText('Benchmark Dashboard')).toBeInTheDocument();
  });
});
