import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DocumentsPage } from '../pages/Documents';
import { api } from '../api/client';

vi.mock('../api/client', () => ({
  api: {
    listDocuments: vi.fn(),
    uploadDocument: vi.fn(),
    deleteDocument: vi.fn(),
    getDocument: vi.fn(),
  },
}));

describe('DocumentsPage', () => {
  it('renders uploaded document list from API', async () => {
    vi.mocked(api.listDocuments).mockResolvedValue([
      {
        id: 'doc_1',
        filename: 'cooling_pump.pdf',
        sha256: 'abc1234567890',
        size_bytes: 1048576,
        page_count: 5,
        chunk_count: 12,
        status: 'ready',
        error: null,
      },
    ]);

    render(<DocumentsPage />);

    expect(screen.getByText('Manuals')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('cooling_pump.pdf')).toBeInTheDocument();
      expect(screen.getByText('Ready')).toBeInTheDocument();
      expect(screen.getByText('1.00 MB')).toBeInTheDocument();
    });
  });
});
