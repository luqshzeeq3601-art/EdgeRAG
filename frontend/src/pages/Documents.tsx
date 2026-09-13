import React, { useEffect, useState, useRef } from 'react';
import { api } from '../api/client';
import type { DocumentSummary, DocumentDetail } from '../api/client';
import { UploadCloud, FileText, Trash2, CheckCircle2, AlertTriangle, XCircle, Loader2, Eye, RefreshCw } from 'lucide-react';

export const DocumentsPage: React.FC = () => {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DocumentDetail | null>(null);
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
      setDocuments(prev => {
        const hasProcessing = prev.some(d => d.status === 'processing');
        if (hasProcessing) {
          fetchDocuments();
        }
        return prev;
      });
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Only PDF documents (.pdf) are supported.');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setUploadError('File size exceeds the 25 MB limit.');
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
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload document');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string, filename: string) => {
    if (!window.confirm(`Delete document "${filename}" and its vector index embeddings?`)) {
      return;
    }
    try {
      await api.deleteDocument(id);
      setDocuments(prev => prev.filter(d => d.id !== id));
      if (selectedDoc?.id === id) {
        setSelectedDoc(null);
      }
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleInspect = async (id: string) => {
    try {
      const detail = await api.getDocument(id);
      setSelectedDoc(detail);
    } catch (err: any) {
      alert(`Failed to inspect document: ${err.message}`);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Document Workspace</h1>
          <p className="text-sm text-slate-400">
            Upload local technical manuals and specifications. Extracted pages are chunked, embedded, and stored locally in FAISS & SQLite.
          </p>
        </div>
        <button
          onClick={fetchDocuments}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Upload Box */}
      <div className="border-2 border-dashed border-slate-700 hover:border-sky-500 rounded-xl p-8 text-center bg-slate-900/60 transition-colors">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="application/pdf"
          className="hidden"
          id="pdf-upload"
          disabled={isUploading}
        />
        <label htmlFor="pdf-upload" className="cursor-pointer flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-400">
            {isUploading ? <Loader2 className="w-7 h-7 animate-spin" /> : <UploadCloud className="w-7 h-7" />}
          </div>
          <div>
            <span className="text-base font-medium text-white hover:text-sky-400 transition-colors">
              {isUploading ? 'Processing and embedding PDF...' : 'Click to upload or drag & drop technical PDF'}
            </span>
            <p className="text-xs text-slate-400 mt-1">Maximum 25 MB and 300 pages. English text extraction.</p>
          </div>
        </label>

        {uploadError && (
          <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-sm flex items-center justify-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {uploadError}
          </div>
        )}
      </div>

      {/* Documents List Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="font-semibold text-slate-200">Ingested Documents ({documents.length})</h2>
          <span className="text-xs text-slate-500">Authoritative SQLite + FAISS Index</span>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center items-center gap-2 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin text-sky-400" />
            Loading documents...
          </div>
        ) : documents.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            No documents ingested yet. Upload a technical PDF above to begin.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800/60 text-slate-400 font-medium uppercase text-xs">
                <tr>
                  <th className="py-3 px-4">Document</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4">Pages</th>
                  <th className="py-3 px-4">Chunks</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {documents.map(doc => (
                  <tr key={doc.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-white flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-sky-400 shrink-0" />
                      <span className="truncate max-w-xs">{doc.filename}</span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">{formatBytes(doc.size_bytes)}</td>
                    <td className="py-3.5 px-4 text-slate-400">{doc.page_count}</td>
                    <td className="py-3.5 px-4 text-slate-400">{doc.chunk_count}</td>
                    <td className="py-3.5 px-4">
                      {doc.status === 'ready' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                        </span>
                      )}
                      {doc.status === 'processing' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Ingesting
                        </span>
                      )}
                      {doc.status === 'failed' && (
                        <span
                          title={doc.error || 'Ingestion failed'}
                          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 cursor-help"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Failed
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleInspect(doc.id)}
                          className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-slate-800 rounded transition-colors"
                          title="Inspect Chunks"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(doc.id, doc.filename)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                          title="Delete Document"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Chunks Inspector Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">{selectedDoc.filename}</h3>
                <p className="text-xs text-slate-400">
                  {selectedDoc.chunks.length} Chunks | SHA-256: {selectedDoc.sha256.substring(0, 16)}...
                </p>
              </div>
              <button
                onClick={() => setSelectedDoc(null)}
                className="text-slate-400 hover:text-white text-lg font-bold px-2 py-1"
              >
                &times;
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {selectedDoc.chunks.map((chunk, idx) => (
                <div key={chunk.id} className="p-4 bg-slate-800/50 border border-slate-700/60 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-sky-400">Chunk #{idx + 1} (ID: {chunk.chunk_id})</span>
                    <span>Page {chunk.page_number} | {chunk.token_count} Tokens | Vector #{chunk.vector_id}</span>
                  </div>
                  <p className="text-sm text-slate-200 font-mono whitespace-pre-wrap leading-relaxed bg-slate-900/60 p-3 rounded border border-slate-800">
                    {chunk.text}
                  </p>
                </div>
              ))}
            </div>

            <div className="px-6 py-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedDoc(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-sm transition-colors"
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
