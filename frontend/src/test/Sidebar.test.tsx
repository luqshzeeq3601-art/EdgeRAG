import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Sidebar } from '../components/Sidebar';

describe('Sidebar Component', () => {
  it('renders all sections matching the redesign specifications', () => {
    const onNavigate = vi.fn();
    const onToggleCollapse = vi.fn();

    render(
      <Sidebar
        currentTab="documents"
        onNavigate={onNavigate}
        isCollapsed={false}
        onToggleCollapse={onToggleCollapse}
      />
    );

    // Header elements
    expect(screen.getByText('EdgeRAG')).toBeInTheDocument();
    expect(screen.getByText('Local Assistant & Telemetry')).toBeInTheDocument();
    expect(screen.getByText('OFFLINE')).toBeInTheDocument();

    // Workspace section
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Manuals')).toBeInTheDocument();
    expect(screen.getByText('Your PDF manuals')).toBeInTheDocument();
    expect(screen.getByText('Ask')).toBeInTheDocument();
    expect(screen.getByText('Answers with sources')).toBeInTheDocument();
    expect(screen.getByText('Compare')).toBeInTheDocument();
    expect(screen.getByText('Which model is best (advanced)')).toBeInTheDocument();

    // Architecture section
    expect(screen.getByText('Architecture')).toBeInTheDocument();
    expect(screen.getByText('100% Local')).toBeInTheDocument();
    expect(screen.getByText('Retriever')).toBeInTheDocument();
    expect(screen.getByText('FAISS CPU')).toBeInTheDocument();
    expect(screen.getByText('Embedder')).toBeInTheDocument();
    expect(screen.getByText('MiniLM-L6')).toBeInTheDocument();
    expect(screen.getByText('Inference')).toBeInTheDocument();
    expect(screen.getByText('Ollama API')).toBeInTheDocument();
    expect(screen.getByText('Zero cloud egress / air-gapped')).toBeInTheDocument();

    // Footer section
    expect(screen.getByText('EdgeRAG Engine')).toBeInTheDocument();
    expect(screen.getByText('Industrial Edge Workstation')).toBeInTheDocument();
    expect(screen.getByText('v1.0')).toBeInTheDocument();

    // Navigation interaction
    fireEvent.click(screen.getByRole('button', { name: /^Ask$/i }));
    expect(onNavigate).toHaveBeenCalledWith('assistant');
  });

  it('renders correctly in collapsed mode', () => {
    const onNavigate = vi.fn();
    const onToggleCollapse = vi.fn();

    render(
      <Sidebar
        currentTab="documents"
        onNavigate={onNavigate}
        isCollapsed={true}
        onToggleCollapse={onToggleCollapse}
      />
    );

    expect(screen.getAllByLabelText('Expand sidebar').length).toBeGreaterThan(0);
    expect(screen.queryByText('Local Assistant & Telemetry')).not.toBeInTheDocument();
  });
});
