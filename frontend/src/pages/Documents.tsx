import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Database,
  Eye,
  FileText,
  FileUp,
  HardDrive,
  Info,
  Layers3,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { api } from '../api/client';
import type { DocumentDetail, DocumentSummary } from '../api/client';

type IndexTone = 'ready' | 'building' | 'attention' | 'standby';

export const DocumentsPage: React.FC = () => {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DocumentDetail | null>(null);
  const [chunkSearch, setChunkSearch] = useState('');
  const [copiedChunkId, setCopiedChunkId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = async () => {
    try {
      const data = await api.listDocuments();
      setDocuments(data);
      setLoadError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not load the local index.';
      setLoadError(message);
      console.error('Failed to load documents:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
    const interval = setInterval(() => {
      setDocuments((current) => {
        if (current.some((document) => document.status === 'processing')) {
          fetchDocuments();
        }
        return current;
      });
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const processFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Only PDF documents are supported.');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setUploadError('This file exceeds the 25 MB limit.');
      return;
    }

    setUploadError(null);
    setIsUploading(true);

    try {
      await api.uploadDocument(file);
      await fetchDocuments();
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'The PDF could not be indexed.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDelete = async (id: string, filename: string) => {
    if (!window.confirm(`Delete ${filename} and its vector index embeddings?`)) {
      return;
    }

    try {
      await api.deleteDocument(id);
      setDocuments((current) => current.filter((document) => document.id !== id));
      if (selectedDoc?.id === id) {
        setSelectedDoc(null);
      }
    } catch (err: unknown) {
      window.alert(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleInspect = async (id: string) => {
    try {
      const detail = await api.getDocument(id);
      setSelectedDoc(detail);
      setChunkSearch('');
    } catch (err: unknown) {
      window.alert(`Inspection failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleCopyChunk = async (chunkId: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedChunkId(chunkId);
    setTimeout(() => setCopiedChunkId(null), 2000);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const totalPages = documents.reduce((total, document) => total + (document.page_count || 0), 0);
  const totalChunks = documents.reduce((total, document) => total + (document.chunk_count || 0), 0);
  const totalBytes = documents.reduce((total, document) => total + (document.size_bytes || 0), 0);
  const filteredDocuments = documents.filter((document) =>
    document.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredChunks = selectedDoc
    ? selectedDoc.chunks.filter((chunk) => chunk.text.toLowerCase().includes(chunkSearch.toLowerCase()))
    : [];

  const hasProcessing = documents.some((document) => document.status === 'processing');
  const hasFailures = documents.some((document) => document.status === 'failed');
  const indexTone: IndexTone = hasFailures
    ? 'attention'
    : hasProcessing || isUploading
      ? 'building'
      : documents.length > 0
        ? 'ready'
        : 'standby';
  const indexLabel = {
    ready: 'Index ready',
    building: 'Building index',
    attention: 'Review required',
    standby: 'Index standby',
  }[indexTone];
  const indexStatusValue = {
    ready: 'Healthy',
    building: 'In progress',
    attention: 'Needs review',
    standby: 'Standby',
  }[indexTone];

  const getDocTags = (filename: string) => {
    const tags = ['EN'];
    const lower = filename.toLowerCase();
    if (lower.includes('cooling')) tags.unshift('Cooling system');
    if (lower.includes('pump')) tags.unshift('Emergency pump');
    if (lower.includes('manual') && tags.length < 3) tags.unshift('Manual');
    if (tags.length === 1) tags.unshift('Technical PDF');
    return tags;
  };

  const renderStatus = (status: DocumentSummary['status']) => {
    if (status === 'ready') {
      return (
        <span className="status status--ready">
          <CheckCircle2 size={14} strokeWidth={1.8} aria-hidden="true" />
          Indexed
          <span className="sr-only">Ready</span>
        </span>
      );
    }
    if (status === 'processing') {
      return (
        <span className="status status--building">
          <Loader2 size={14} strokeWidth={1.8} className="spin" aria-hidden="true" />
          Ingesting
        </span>
      );
    }
    return (
      <span className="status status--failed" title={status === 'failed' ? 'Ingestion failed' : undefined}>
        <XCircle size={14} strokeWidth={1.8} aria-hidden="true" />
        Failed
      </span>
    );
  };

  return (
    <div className="documents-page">
      <div className="document-heading">
        <div>
          <p className="document-kicker">Local document index</p>
          <h1 className="document-title">Document Workspace</h1>
          <p className="document-subtitle">
            Manage local manuals, extract content, and build a searchable knowledge base.
          </p>
        </div>
        <div className="page-actions">
          <button type="button" onClick={fetchDocuments} className="button button--quiet" title="Refresh documents list">
            <RefreshCw size={15} strokeWidth={1.8} className={isLoading ? 'spin' : undefined} />
            Refresh index
          </button>
        </div>
      </div>

      <div className="workspace-grid">
        <section className="panel upload-panel" aria-labelledby="upload-title">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Ingest source</p>
              <h2 id="upload-title" className="panel-title">Add documents</h2>
            </div>
            <span className="panel-note"><Info size={14} strokeWidth={1.8} /> PDF only</span>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="application/pdf"
            className="visually-hidden"
            id="pdf-upload"
            disabled={isUploading}
          />

          <button
            type="button"
            className={`drop-zone ${isDragging ? 'is-dragging' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            disabled={isUploading}
            aria-describedby="upload-help"
          >
            <span className="drop-zone__mark" aria-hidden="true">
              {isUploading ? <Loader2 size={25} className="spin" /> : isDragging ? <FileUp size={25} /> : <Upload size={25} />}
            </span>
            <span className="drop-zone__copy">
              <span className="drop-zone__title">
                {isUploading ? 'Extracting and indexing PDF' : isDragging ? 'Release to add PDF' : <>Drop a technical PDF or <u>browse</u></>}
              </span>
              <span id="upload-help" className="drop-zone__detail">Up to 25 MB / 300 pages / English text extraction</span>
            </span>
            <span className="button button--accent">Choose file <FileText size={15} strokeWidth={1.8} /></span>
          </button>

          {uploadError && (
            <div className="inline-alert inline-alert--danger" role="alert">
              <AlertTriangle size={16} strokeWidth={1.8} aria-hidden="true" />
              <span>{uploadError}</span>
              <button type="button" className="alert-close" onClick={() => setUploadError(null)} aria-label="Dismiss upload error">
                <X size={15} strokeWidth={1.8} />
              </button>
            </div>
          )}
        </section>

        <section className="panel overview-panel" aria-labelledby="overview-title">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">System telemetry</p>
              <h2 id="overview-title" className="panel-title">Workspace overview</h2>
            </div>
            <span className={`index-state index-state--${indexTone}`}>
              <span className="state-dot" aria-hidden="true" />
              {indexLabel}
            </span>
          </div>

          <div className="metrics-grid">
            <div className="metric-cell">
              <span className="metric-label"><FileText size={15} strokeWidth={1.8} /> Documents</span>
              <strong className="metric-value">{documents.length}</strong>
            </div>
            <div className="metric-cell">
              <span className="metric-label"><Layers3 size={15} strokeWidth={1.8} /> Pages indexed</span>
              <strong className="metric-value">{totalPages}</strong>
            </div>
            <div className="metric-cell">
              <span className="metric-label"><Database size={15} strokeWidth={1.8} /> Chunks</span>
              <strong className="metric-value">{totalChunks}</strong>
            </div>
            <div className="metric-cell">
              <span className="metric-label"><HardDrive size={15} strokeWidth={1.8} /> Storage used</span>
              <strong className="metric-value metric-value--mono">{formatBytes(totalBytes)}</strong>
            </div>
            <div className="metric-cell">
              <span className="metric-label"><Activity size={15} strokeWidth={1.8} /> Index status</span>
              <strong className={`metric-value metric-value--${indexTone}`}>{indexStatusValue}</strong>
            </div>
            <div className="metric-cell">
              <span className="metric-label"><Clock3 size={15} strokeWidth={1.8} /> Sync mode</span>
              <strong className="metric-value metric-value--text">Local only</strong>
            </div>
          </div>
        </section>
      </div>

      <section className="panel knowledge-panel" aria-labelledby="knowledge-title">
        <div className="knowledge-header">
          <div>
            <p className="panel-kicker">Indexed sources</p>
            <h2 id="knowledge-title" className="panel-title">Knowledge base <span className="count-mark">{filteredDocuments.length}</span></h2>
          </div>
          <label className="search-field">
            <span className="visually-hidden">Search documents</span>
            <Search size={16} strokeWidth={1.8} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search documents"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear document search">
                <X size={14} strokeWidth={1.8} />
              </button>
            )}
          </label>
        </div>

        {loadError && (
          <div className="inline-alert inline-alert--danger knowledge-alert" role="alert">
            <AlertTriangle size={16} strokeWidth={1.8} aria-hidden="true" />
            <span>{loadError}</span>
            <button type="button" className="button button--quiet" onClick={fetchDocuments}>Retry</button>
          </div>
        )}

        {isLoading ? (
          <div className="skeleton-list" aria-busy="true" aria-label="Loading documents">
            {[1, 2, 3].map((item) => <div key={item} className="skeleton-row" />)}
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="empty-state" role="status">
            <FileText size={28} strokeWidth={1.4} aria-hidden="true" />
            <h3>{documents.length === 0 ? 'No documents indexed yet' : 'No documents match this search'}</h3>
            <p>{documents.length === 0 ? 'Add a technical PDF above to create the first local source.' : 'Try a different filename or clear the search.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="document-table">
              <thead>
                <tr>
                  <th scope="col">Document</th>
                  <th scope="col">Pages</th>
                  <th scope="col">Chunks</th>
                  <th scope="col">Tokens</th>
                  <th scope="col">Added</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="align-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocuments.map((document) => {
                  const tags = getDocTags(document.filename);
                  const approxTokens = document.chunk_count ? `${(document.chunk_count * 0.6).toFixed(1)}k` : '0';
                  return (
                    <tr key={document.id}>
                      <td>
                        <div className="document-cell">
                          <span className="pdf-mark" aria-hidden="true">PDF</span>
                          <div>
                            <button type="button" onClick={() => handleInspect(document.id)} className="document-link">
                              {document.filename}
                            </button>
                            <div className="document-meta">
                              {tags.map((tag, index) => <span key={`${tag}-${index}`}>{tag}</span>)}
                              <span>Size {formatBytes(document.size_bytes)}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="numeric-cell">{document.page_count}</td>
                      <td className="numeric-cell">{document.chunk_count}</td>
                      <td className="numeric-cell">{approxTokens}</td>
                      <td className="muted-cell">Current session</td>
                      <td>{renderStatus(document.status)}</td>
                      <td className="align-right">
                        <div className="row-actions">
                          <button type="button" onClick={() => handleInspect(document.id)} className="icon-button" title="Inspect chunks" aria-label={`Inspect ${document.filename}`}>
                            <Eye size={16} strokeWidth={1.8} />
                          </button>
                          <button type="button" onClick={() => handleDelete(document.id, document.filename)} className="icon-button icon-button--danger" title="Delete document" aria-label={`Delete ${document.filename}`}>
                            <Trash2 size={16} strokeWidth={1.8} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedDoc && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedDoc(null);
        }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="inspector-title">
            <div className="modal-header">
              <div>
                <p className="panel-kicker">Document inspector</p>
                <h2 id="inspector-title" className="modal-title">{selectedDoc.filename}</h2>
                <p className="hash-line">SHA-256: {selectedDoc.sha256}</p>
              </div>
              <button type="button" onClick={() => setSelectedDoc(null)} className="icon-button" aria-label="Close document inspector">
                <X size={17} strokeWidth={1.8} />
              </button>
            </div>

            <div className="modal-toolbar">
              <label className="search-field search-field--compact">
                <span className="visually-hidden">Filter chunk text</span>
                <Search size={15} strokeWidth={1.8} aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Filter chunk text"
                  value={chunkSearch}
                  onChange={(event) => setChunkSearch(event.target.value)}
                />
              </label>
              <span className="toolbar-count">{filteredChunks.length} / {selectedDoc.chunks.length} chunks</span>
            </div>

            <div className="chunk-list">
              {filteredChunks.length === 0 ? (
                <div className="empty-state empty-state--compact" role="status">
                  <p>No chunks match this filter.</p>
                </div>
              ) : filteredChunks.map((chunk, index) => (
                <article key={chunk.id} className="chunk-card">
                  <div className="chunk-header">
                    <div>
                      <span className="chunk-index">Chunk {index + 1}</span>
                      <span className="chunk-id">{chunk.chunk_id}</span>
                    </div>
                    <div className="chunk-meta">
                      Page {chunk.page_number} / {chunk.token_count} tokens / Vector {chunk.vector_id}
                      <button type="button" onClick={() => handleCopyChunk(chunk.chunk_id, chunk.text)} className="copy-button">
                        {copiedChunkId === chunk.chunk_id ? <Check size={14} strokeWidth={1.8} /> : <Copy size={14} strokeWidth={1.8} />}
                        {copiedChunkId === chunk.chunk_id ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                  <p className="chunk-text">{chunk.text}</p>
                </article>
              ))}
            </div>

            <div className="modal-footer">
              <span>SQLite metadata / FAISS vectors</span>
              <button type="button" onClick={() => setSelectedDoc(null)} className="button button--quiet">Close</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
