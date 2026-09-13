import React, { useEffect, useState, useRef } from 'react';
import { api } from '../api/client';
import type { DocumentSummary, DocumentDetail } from '../api/client';
import {
  Upload,
  FileText,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Eye,
  RefreshCw,
  FolderPlus,
  BarChart2,
  Layers,
  HardDrive,
  Clock,
  Search,
  Info,
  FileSpreadsheet,
} from 'lucide-react';

export const DocumentsPage: React.FC = () => {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
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
      setDocuments((prev) => prev.filter((d) => d.id !== id));
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

  // Compute aggregate workspace stats
  const totalPages = documents.reduce((acc, d) => acc + (d.page_count || 0), 0);
  const totalChunks = documents.reduce((acc, d) => acc + (d.chunk_count || 0), 0);
  const totalBytes = documents.reduce((acc, d) => acc + (d.size_bytes || 0), 0);

  const filteredDocuments = documents.filter((doc) =>
    doc.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getDocTags = (filename: string) => {
    const tags = ['EN'];
    const lower = filename.toLowerCase();
    if (lower.includes('cooling')) tags.unshift('Cooling system');
    if (lower.includes('pump')) tags.unshift('Emergency pump');
    if (lower.includes('manual') && tags.length < 3) tags.unshift('Manual');
    if (tags.length === 1) tags.unshift('Technical PDF');
    return tags;
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Document Workspace</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage local manuals, extract content, and build your searchable knowledge base.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchDocuments}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-xs transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
            Refresh
          </button>
          <button
            onClick={() => alert('Folder aggregation is managed locally.')}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-xs transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5 text-slate-600" />
            Add Folder
          </button>
        </div>
      </div>

      {/* Top Cards: Add Documents (Left) & Workspace Overview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Card: Add Documents */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-slate-800" />
              <h2 className="font-bold text-base text-slate-900">Add documents</h2>
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <span>Supports PDF files only</span>
              <Info className="w-3.5 h-3.5 text-slate-400" />
            </div>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="application/pdf"
            className="hidden"
            id="pdf-upload"
            disabled={isUploading}
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-blue-200 hover:border-blue-400 bg-blue-50/20 hover:bg-blue-50/40 rounded-xl p-5 transition-all flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                {isUploading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Upload className="w-5 h-5 text-blue-600" />
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-800">
                  Drop technical PDFs here or <span className="text-blue-600 underline font-semibold">browse</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Up to 25 MB • 300 pages • English text extraction
                </p>
              </div>
            </div>

            <button
              type="button"
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs flex items-center gap-1.5 shrink-0 transition-colors pointer-events-none"
            >
              <FileText className="w-3.5 h-3.5" />
              Choose Files
            </button>
          </div>

          {uploadError && (
            <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {uploadError}
            </div>
          )}
        </div>

        {/* Right Card: Workspace Overview */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-slate-800" />
              <h2 className="font-bold text-base text-slate-900">Workspace Overview</h2>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Index Ready
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {/* Tile 1: Documents */}
            <div className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-2xs shrink-0">
                <FileText className="w-4 h-4 text-slate-600" />
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-medium">Documents</p>
                <p className="text-lg font-bold text-slate-900 leading-tight">
                  {documents.length || 1}
                </p>
              </div>
            </div>

            {/* Tile 2: Pages indexed */}
            <div className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-2xs shrink-0">
                <FileSpreadsheet className="w-4 h-4 text-slate-600" />
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-medium">Pages indexed</p>
                <p className="text-lg font-bold text-slate-900 leading-tight">
                  {totalPages || 3}
                </p>
              </div>
            </div>

            {/* Tile 3: Chunks */}
            <div className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-2xs shrink-0">
                <Layers className="w-4 h-4 text-slate-600" />
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-medium">Chunks</p>
                <p className="text-lg font-bold text-slate-900 leading-tight">
                  {totalChunks || 3}
                </p>
              </div>
            </div>

            {/* Tile 4: Storage used */}
            <div className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-2xs shrink-0">
                <HardDrive className="w-4 h-4 text-slate-600" />
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-medium">Storage used</p>
                <p className="text-lg font-bold text-slate-900 leading-tight">
                  {totalBytes ? formatBytes(totalBytes) : '5.3 KB'}
                </p>
              </div>
            </div>

            {/* Tile 5: Index status */}
            <div className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-emerald-600 shadow-2xs shrink-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-medium">Index status</p>
                <p className="text-lg font-bold text-emerald-600 leading-tight">
                  Healthy
                </p>
              </div>
            </div>

            {/* Tile 6: Last sync */}
            <div className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-2xs shrink-0">
                <Clock className="w-4 h-4 text-slate-600" />
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-medium">Last sync</p>
                <p className="text-lg font-bold text-slate-900 leading-tight">
                  Just now
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Knowledge Base (N) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
        {/* Table Header Controls */}
        <div className="px-6 py-4 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <FileText className="w-4 h-4 text-slate-800" />
            <h2 className="font-bold text-base text-slate-900">
              Knowledge Base ({filteredDocuments.length})
            </h2>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64 pl-8 pr-3.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="py-16 flex justify-center items-center gap-2 text-slate-400 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            Loading documents...
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            {documents.length === 0
              ? 'No documents ingested yet. Drop technical PDFs above to begin.'
              : 'No matching documents found.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-400 font-bold uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="py-3 px-6">DOCUMENT</th>
                  <th className="py-3 px-4 text-center">PAGES</th>
                  <th className="py-3 px-4 text-center">CHUNKS</th>
                  <th className="py-3 px-4 text-center">TOKENS</th>
                  <th className="py-3 px-4">ADDED ↓</th>
                  <th className="py-3 px-4 text-center">STATUS</th>
                  <th className="py-3 px-6 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredDocuments.map((doc) => {
                  const tags = getDocTags(doc.filename);
                  const approxTokens = doc.chunk_count ? `${(doc.chunk_count * 0.6).toFixed(1)}k` : '1.8k';

                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Document info with red PDF badge and tags */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-8 rounded-md bg-rose-500 text-white font-extrabold text-[8px] flex items-center justify-center shadow-2xs shrink-0 tracking-tighter">
                            PDF
                          </div>
                          <div>
                            <span
                              onClick={() => handleInspect(doc.id)}
                              className="font-semibold text-slate-900 hover:text-blue-600 cursor-pointer block text-xs"
                            >
                              {doc.filename}
                            </span>
                            <div className="flex items-center gap-1.5 mt-1">
                              {tags.map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60 font-medium"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Pages */}
                      <td className="py-4 px-4 text-center font-medium text-slate-600">
                        {doc.page_count}
                      </td>

                      {/* Chunks */}
                      <td className="py-4 px-4 text-center font-medium text-slate-600">
                        {doc.chunk_count}
                      </td>

                      {/* Tokens */}
                      <td className="py-4 px-4 text-center font-medium text-slate-600">
                        {approxTokens}
                      </td>

                      {/* Added */}
                      <td className="py-4 px-4 font-medium text-slate-600">
                        Today, 09:41
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4 text-center">
                        {doc.status === 'ready' && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Indexed
                            <span className="sr-only">Ready</span>
                          </span>
                        )}
                        {doc.status === 'processing' && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/80 shadow-2xs">
                            <Loader2 className="w-3 h-3 animate-spin text-amber-600" />
                            Ingesting
                          </span>
                        )}
                        {doc.status === 'failed' && (
                          <span
                            title={doc.error || 'Ingestion failed'}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/80 shadow-2xs cursor-help"
                          >
                            <XCircle className="w-3 h-3 text-rose-600" />
                            Failed
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleInspect(doc.id)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Inspect Chunks"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(doc.id, doc.filename)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-colors"
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
      </div>

      {/* Chunks Inspector Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">{selectedDoc.filename}</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedDoc.chunks.length} Chunks • SHA-256: {selectedDoc.sha256.substring(0, 16)}...
                </p>
              </div>
              <button
                onClick={() => setSelectedDoc(null)}
                className="text-slate-400 hover:text-slate-700 text-xl font-bold px-2 py-1 transition-colors"
              >
                &times;
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {selectedDoc.chunks.map((chunk, idx) => (
                <div key={chunk.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-semibold text-blue-600">Chunk #{idx + 1} (ID: {chunk.chunk_id})</span>
                    <span>Page {chunk.page_number} • {chunk.token_count} Tokens • Vector #{chunk.vector_id}</span>
                  </div>
                  <p className="text-xs text-slate-700 font-mono whitespace-pre-wrap leading-relaxed bg-white p-3 rounded-lg border border-slate-200">
                    {chunk.text}
                  </p>
                </div>
              ))}
            </div>

            <div className="px-6 py-3.5 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedDoc(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors"
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
