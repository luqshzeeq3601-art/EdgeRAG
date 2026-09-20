import React, { useEffect, useState, useRef } from 'react';
import { api } from '../api/client';
import type { DocumentSummary, DocumentDetail } from '../api/client';
import {
  FileText,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Eye,
  RefreshCw,
  Search,
  Copy,
  Check,
  X,
  FileUp,
} from 'lucide-react';

export const DocumentsPage: React.FC = () => {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DocumentDetail | null>(null);
  const [chunkSearch, setChunkSearch] = useState<string>('');
  const [copiedChunkId, setCopiedChunkId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = async () => {
    try {
      const data = await api.listDocuments();
      setDocuments(data);
    } catch (err: any) {
      console.error('Failed to load documents:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
    // Poll if any document is processing
    const interval = setInterval(() => {
      setDocuments((prev) => {
        const hasProcessing = prev.some((d) => d.status === 'processing');
        if (hasProcessing) {
          fetchDocuments();
        }
        return prev;
      });
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const processFiles = async (files: File[]) => {
    const pdfs = files.filter((f) => f.name.toLowerCase().endsWith('.pdf'));
    if (pdfs.length === 0) {
      setUploadError('Only PDF documents (.pdf) are supported.');
      return;
    }
    const oversized = pdfs.find((f) => f.size > 25 * 1024 * 1024);
    if (oversized) {
      setUploadError(`“${oversized.name}” exceeds the 25 MB limit.`);
      return;
    }

    setUploadError(null);
    setIsUploading(true);

    try {
      for (const file of pdfs) {
        await api.uploadDocument(file);
      }
      await fetchDocuments();
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload document');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      processFiles(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length > 0) {
      processFiles(files);
    }
  };

  const handleDelete = async (id: string, filename: string) => {
    if (!window.confirm(`Remove "${filename}"? You won't be able to ask about it anymore.`)) {
      return;
    }
    setListError(null);
    try {
      await api.deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      if (selectedDoc?.id === id) {
        setSelectedDoc(null);
      }
    } catch (err: any) {
      setListError(err.message || 'Delete failed');
    }
  };

  const handleInspect = async (id: string) => {
    setListError(null);
    try {
      const detail = await api.getDocument(id);
      setSelectedDoc(detail);
      setChunkSearch('');
    } catch (err: any) {
      setListError(err.message || 'Failed to inspect document');
    }
  };

  const handleCopyChunk = (chunkId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedChunkId(chunkId);
    setTimeout(() => setCopiedChunkId(null), 2000);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const filteredDocuments = documents
    .filter((doc) =>
      doc.filename.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const filteredChunks = selectedDoc
    ? selectedDoc.chunks.filter((c) =>
        c.text.toLowerCase().includes(chunkSearch.toLowerCase())
      )
    : [];

  return (
    <div className="documents-page w-full space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
        <div className="max-w-3xl">
          <h1 className="text-[32px] sm:text-[36px] leading-[1.15] font-bold text-slate-900 tracking-[-0.03em]">
            Manuals
          </h1>
          <p className="text-base leading-6 text-slate-600 mt-2">
            Drop in your PDF manuals. Once one says Ready, you can ask about it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1 shrink-0">
          <button
            onClick={fetchDocuments}
            disabled={isLoading}
            className="inline-flex h-11 min-h-11 items-center gap-2 px-4 bg-white border border-slate-300 hover:bg-slate-100 hover:border-slate-400 hover:text-slate-900 text-slate-700 rounded-xl text-sm font-semibold shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh documents list"
          >
            <RefreshCw className={`w-4 h-4 text-slate-600 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="application/pdf"
        multiple
        className="hidden"
        id="pdf-upload"
        disabled={isUploading}
      />

      {/* Unified Single-Layer Dropzone */}
      <div
        onClick={() => {
          if (!isUploading) fileInputRef.current?.click();
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border border-dashed rounded-xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5 transition-colors ${
          isDragging
            ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600/20'
            : 'border-slate-300 bg-white hover:border-emerald-700 hover:bg-slate-50 shadow-[0_1px_3px_rgba(15,23,42,0.06)]'
        }`}
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
            {isUploading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : isDragging ? (
              <FileUp className="w-6 h-6 animate-bounce" />
            ) : (
              <FileUp className="w-6 h-6" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 leading-snug">
              Drop technical PDFs here or{' '}
              <span className="text-emerald-800 font-semibold underline underline-offset-2">
                browse
              </span>
            </p>
            <p className="text-sm text-slate-600 mt-1">
              PDF files only, up to 25 MB each
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={isUploading}
          onClick={(e) => {
            e.stopPropagation();
            if (!isUploading) fileInputRef.current?.click();
          }}
          className="inline-flex h-11 min-h-11 px-5 items-center justify-center gap-2 text-white text-sm font-semibold rounded-xl shadow-[0_1px_3px_rgba(15,23,42,0.06)] shrink-0 bg-emerald-700 hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FileText className="w-4 h-4 text-white" />
          {isUploading ? 'Uploading…' : 'Choose Files'}
        </button>
      </div>

      {uploadError && (
        <div
          role="alert"
          className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{uploadError}</span>
          </div>
          <button
            onClick={() => setUploadError(null)}
            aria-label="Dismiss upload error"
            className="flex items-center justify-center min-w-9 min-h-9 p-2 text-rose-600 hover:text-rose-800 hover:bg-rose-100 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Bottom Section: Knowledge Base (N) */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        {/* Table Header Controls */}
        <div className="px-5 sm:px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-emerald-700" strokeWidth={1.8} />
            <h2 className="font-bold text-xl leading-tight text-slate-900 tracking-[-0.02em]">
              Your manuals ({filteredDocuments.length})
            </h2>
          </div>

          <div className="relative flex items-center w-full sm:w-auto">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search manuals…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search manuals"
              className="w-full sm:w-72 h-11 min-h-11 pl-10 pr-11 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-1.5 flex items-center justify-center min-w-9 min-h-9 p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {listError && (
          <div role="alert" className="mx-5 sm:mx-6 mt-4 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm flex items-center justify-between gap-2">
            <span>{listError}</span>
            <button onClick={() => setListError(null)} className="flex items-center justify-center min-w-9 min-h-9 p-2 text-rose-600 hover:text-rose-800 hover:bg-rose-100 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600" aria-label="Dismiss error">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="py-16 flex justify-center items-center gap-2 text-slate-600 text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
            Loading documents…
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="py-16 text-center text-slate-600 text-sm space-y-2">
            <FileText className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="font-medium text-slate-900">
              {documents.length === 0
                ? 'No manuals yet.'
                : 'No manuals match your search.'}
            </p>
            <p className="text-sm text-slate-600">
              {documents.length === 0
                ? 'Drop a PDF manual into the box above to get started.'
                : 'Try adjusting your search terms.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto document-table-scroll">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-xs tracking-wider">
                <tr>
                  <th className="py-4 px-6">Manual</th>
                  <th className="py-4 px-4 text-center">Status</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredDocuments.map((doc) => {
                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/60 transition-colors group">
                      {/* Document info */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-900 text-white font-bold text-[10px] tracking-wider flex items-center justify-center shrink-0">
                            PDF
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={() => handleInspect(doc.id)}
                              className="font-semibold text-slate-900 hover:text-emerald-800 hover:underline underline-offset-2 cursor-pointer block text-sm transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded"
                              title="Click to see the extracted text"
                            >
                              {doc.filename}
                            </button>
                            <span className="block text-xs font-mono text-slate-600 mt-0.5 tabular-nums">
                              {formatBytes(doc.size_bytes)}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4 text-center">
                        {doc.status === 'ready' && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                            Ready
                          </span>
                        )}
                        {doc.status === 'processing' && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            <Loader2 className="w-3 h-3 animate-spin text-amber-700" />
                            Reading…
                          </span>
                        )}
                        {doc.status === 'failed' && (
                          <span
                            title={doc.error || 'Could not read this file'}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 cursor-help"
                          >
                            <XCircle className="w-3.5 h-3.5 text-rose-600" />
                            Couldn't read
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleInspect(doc.id)}
                            aria-label={`See extracted text for ${doc.filename}`}
                            className="flex items-center justify-center min-w-11 min-h-11 p-2.5 text-slate-500 hover:text-emerald-800 hover:bg-emerald-50 rounded-xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                            title="See extracted text"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(doc.id, doc.filename)}
                            aria-label={`Delete ${doc.filename}`}
                            className="flex items-center justify-center min-w-11 min-h-11 p-2.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
                            title="Delete Document"
                          >
                            <Trash2 className="w-4 h-4" />
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

      {/* Chunks Inspector Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 bg-slate-950/50 z-50 flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-label={`Extracted text for ${selectedDoc.filename}`} className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">{selectedDoc.filename}</h3>
                  <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full font-mono tabular-nums">
                    {selectedDoc.chunks.length} excerpts
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">How the app split this manual for searching.</p>
              </div>
              <button
                onClick={() => setSelectedDoc(null)}
                aria-label="Close extracted text viewer"
                className="flex items-center justify-center min-w-11 min-h-11 p-2.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter inside chunks */}
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search in this text…"
                  value={chunkSearch}
                  onChange={(e) => setChunkSearch(e.target.value)}
                  aria-label="Search in this text"
                  className="w-full h-11 min-h-11 pl-9 pr-3 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
                />
              </div>
              <span className="text-xs text-slate-600 font-mono tabular-nums whitespace-nowrap">
                Showing {filteredChunks.length} of {selectedDoc.chunks.length}
              </span>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {filteredChunks.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-600">
                  No excerpts match “{chunkSearch}”.
                </div>
              ) : (
                filteredChunks.map((chunk, idx) => (
                  <div key={chunk.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold text-xs text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 font-mono">
                        Excerpt #{idx + 1} • Page {chunk.page_number}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCopyChunk(chunk.chunk_id, chunk.text)}
                          className="inline-flex items-center gap-1.5 h-9 min-h-9 px-3 text-xs font-semibold text-slate-700 hover:text-emerald-800 bg-white border border-slate-300 hover:border-emerald-700 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                          title="Copy excerpt text"
                        >
                          {copiedChunkId === chunk.chunk_id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-700" />
                              <span className="text-emerald-800">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-white p-4 rounded-xl border border-slate-200 select-text">
                      {chunk.text}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex justify-end items-center bg-slate-50 rounded-b-2xl">
              <button
                onClick={() => setSelectedDoc(null)}
                className="inline-flex items-center justify-center h-11 min-h-11 px-5 bg-white border border-slate-300 hover:bg-slate-100 hover:text-slate-900 text-slate-700 font-semibold rounded-xl text-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
