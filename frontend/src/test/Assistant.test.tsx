import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AssistantPage } from '../pages/Assistant';
import { api } from '../api/client';

vi.mock('../api/client', () => ({
  api: {
    listModels: vi.fn(),
    askRAGStream: vi.fn(),
  },
}));

describe('AssistantPage', () => {
  it('loads models and renders input controls', async () => {
    vi.mocked(api.listModels).mockResolvedValue([
      {
        name: 'smollm2:135m',
        model: 'smollm2:135m',
        modified_at: '',
        size: 270000000,
        digest: 'd1',
        details: { family: 'llama' },
      },
    ]);

    render(<AssistantPage />);

    expect(screen.getByPlaceholderText(/Ask a technical question/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/smollm2:135m/i)).toBeInTheDocument();
    });
  });
});
