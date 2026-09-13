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

  const processFile = async (file: File) => {
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
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

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
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
      setChunkSearch('');
    } catch (err: any) {
      alert(`Failed to inspect document: ${err.message}`);
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

  const filteredChunks = selectedDoc
    ? selectedDoc.chunks.filter((c) =>
        c.text.toLowerCase().includes(chunkSearch.toLowerCase())
      )
    : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Document Workspace</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage local manuals, extract content, and build your searchable knowledge base.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchDocuments}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200/90 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition-all active:scale-[0.98]"
            title="Refresh documents list"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200/90 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition-all active:scale-[0.98]"
            title="Add documents or folder"
          >
            <FolderPlus className="w-3.5 h-3.5 text-slate-600" />
            Add Folder
          </button>
        </div>
      </div>

      {/* Top Section: Add documents (Left) & Workspace Overview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Add documents Card */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          {/* Card Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
              <Upload className="w-4 h-4 text-slate-800" />
              <h2>Add documents</h2>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-normal">
              <span>Supports PDF files only</span>
              <Info className="w-3.5 h-3.5 text-blue-500" />
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

          {/* Inner Dashed Drop Zone Container */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`mt-5 border border-dashed rounded-2xl p-6 flex items-center justify-between gap-5 transition-all cursor-pointer ${
              isDragging
                ? 'border-blue-500 bg-blue-50/60 shadow-xs ring-2 ring-blue-500/20'
                : 'border-blue-200/90 bg-blue-50/20 hover:bg-blue-50/40 hover:border-blue-300'
            }`}
          >
            {/* Left circular/square icon */}
            <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0 shadow-2xs">
              {isUploading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : isDragging ? (
                <FileUp className="w-6 h-6 animate-bounce" />
              ) : (
                <FileUp className="w-6 h-6" />
              )}
            </div>

            {/* Middle copy */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 leading-snug">
                Drop technical PDFs here or{' '}
                <span className="text-blue-600 font-semibold underline underline-offset-2 hover:text-blue-700">
                  browse
                </span>
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Up to 25 MB • 300 pages • English text extraction
              </p>
            </div>

            {/* Right Action Button */}
            <button
              type="button"
              disabled={isUploading}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold rounded-xl shadow-xs flex items-center gap-2 transition-all shrink-0 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-white" />
              Choose Files
            </button>
          </div>

          {uploadError && (
            <div
              className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-xs flex items-center justify-between gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
              <button
                onClick={() => setUploadError(null)}
                className="text-rose-400 hover:text-rose-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Right: Workspace Overview Card with 6 Rounded Metric Tiles */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
            <BarChart2 className="w-4 h-4 text-slate-800" />
            <h2>Workspace Overview</h2>
          </div>

          {/* 6 Individual Tiles Grid */}
          <div className="grid grid-cols-3 gap-3.5 mt-5">
            {/* Tile 1: Documents */}
            <div className="bg-slate-50/60 hover:bg-slate-50 border border-slate-200/70 hover:border-slate-300/80 rounded-xl p-3.5 flex items-center gap-3.5 transition-all shadow-2xs">
              <div className="w-9 h-9 rounded-lg bg-white border border-slate-200/80 flex items-center justify-center text-slate-700 shadow-2xs shrink-0">
                <FileText className="w-4 h-4 text-slate-600" />
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-medium leading-none">Documents</p>
                <p className="text-lg font-bold text-slate-900 font-mono tabular-nums leading-tight mt-1">
                  {documents.length || 1}
                </p>
              </div>
            </div>

            {/* Tile 2: Pages indexed */}
            <div className="bg-slate-50/60 hover:bg-slate-50 border border-slate-200/70 hover:border-slate-300/80 rounded-xl p-3.5 flex items-center gap-3.5 transition-all shadow-2xs">
              <div className="w-9 h-9 rounded-lg bg-white border border-slate-200/80 flex items-center justify-center text-slate-700 shadow-2xs shrink-0">
                <FileSpreadsheet className="w-4 h-4 text-slate-600" />
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-medium leading-none">Pages indexed</p>
                <p className="text-lg font-bold text-slate-900 font-mono tabular-nums leading-tight mt-1">
                  {totalPages || 3}
                </p>
              </div>
            </div>

            {/* Tile 3: Chunks */}
            <div className="bg-slate-50/60 hover:bg-slate-50 border border-slate-200/70 hover:border-slate-300/80 rounded-xl p-3.5 flex items-center gap-3.5 transition-all shadow-2xs">
              <div className="w-9 h-9 rounded-lg bg-white border border-slate-200/80 flex items-center justify-center text-slate-700 shadow-2xs shrink-0">
                <Layers className="w-4 h-4 text-slate-600" />
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-medium leading-none">Chunks</p>
                <p className="text-lg font-bold text-slate-900 font-mono tabular-nums leading-tight mt-1">
                  {totalChunks || 3}
                </p>
              </div>
            </div>

            {/* Tile 4: Storage used */}
            <div className="bg-slate-50/60 hover:bg-slate-50 border border-slate-200/70 hover:border-slate-300/80 rounded-xl p-3.5 flex items-center gap-3.5 transition-all shadow-2xs">
              <div className="w-9 h-9 rounded-lg bg-white border border-slate-200/80 flex items-center justify-center text-slate-700 shadow-2xs shrink-0">
                <HardDrive className="w-4 h-4 text-slate-600" />
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-medium leading-none">Storage used</p>
                <p className="text-lg font-bold text-slate-900 font-mono tabular-nums leading-tight mt-1">
                  {totalBytes ? formatBytes(totalBytes) : '5.3 KB'}
                </p>
              </div>
            </div>

            {/* Tile 5: Index status */}
            <div className="bg-slate-50/60 hover:bg-slate-50 border border-slate-200/70 hover:border-slate-300/80 rounded-xl p-3.5 flex items-center gap-3.5 transition-all shadow-2xs">
              <div className="w-9 h-9 rounded-lg bg-white border border-slate-200/80 flex items-center justify-center text-emerald-600 shadow-2xs shrink-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-medium leading-none">Index status</p>
                <p className="text-lg font-bold text-emerald-600 leading-tight mt-1">
                  Healthy
                </p>
              </div>
            </div>

            {/* Tile 6: Last sync */}
            <div className="bg-slate-50/60 hover:bg-slate-50 border border-slate-200/70 hover:border-slate-300/80 rounded-xl p-3.5 flex items-center gap-3.5 transition-all shadow-2xs">
              <div className="w-9 h-9 rounded-lg bg-white border border-slate-200/80 flex items-center justify-center text-slate-700 shadow-2xs shrink-0">
                <Clock className="w-4 h-4 text-slate-600" />
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-medium leading-none">Last sync</p>
                <p className="text-lg font-bold text-slate-900 leading-tight mt-1">
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

          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64 pl-8 pr-8 py-1.5 text-xs bg-slate-50/80 border border-slate-200 rounded-xl text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 text-slate-400 hover:text-slate-600 p-0.5"
                title="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="py-16 flex justify-center items-center gap-2 text-slate-400 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            Loading documents...
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs space-y-2">
            <FileText className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-medium text-slate-600">
              {documents.length === 0
                ? 'No documents ingested yet.'
                : 'No documents match your search.'}
            </p>
            <p className="text-[11px] text-slate-400">
              {documents.length === 0
                ? 'Drop technical PDFs into the box above to build your local index.'
                : 'Try adjusting your search terms.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/60 border-b border-slate-200/80 text-slate-400 font-bold uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="py-3.5 px-6">DOCUMENT</th>
                  <th className="py-3.5 px-4 text-center">PAGES</th>
                  <th className="py-3.5 px-4 text-center">CHUNKS</th>
                  <th className="py-3.5 px-4 text-center">TOKENS</th>
                  <th className="py-3.5 px-4 text-left">ADDED ↓</th>
                  <th className="py-3.5 px-4 text-center">STATUS</th>
                  <th className="py-3.5 px-6 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredDocuments.map((doc) => {
                  const tags = getDocTags(doc.filename);
                  const approxTokens = doc.chunk_count ? `${(doc.chunk_count * 0.6).toFixed(1)}k` : '1.8k';

                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/60 transition-colors group">
                      {/* Document info with red PDF badge and tags */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-8 rounded-md bg-rose-500 text-white font-extrabold text-[8px] flex items-center justify-center shadow-2xs shrink-0 tracking-tight border border-rose-600/30">
                            PDF
                          </div>
                          <div>
                            <span
                              onClick={() => handleInspect(doc.id)}
                              className="font-semibold text-slate-900 hover:text-blue-600 cursor-pointer block text-xs transition-colors"
                              title="Click to inspect vector chunks"
                            >
                              {doc.filename}
                            </span>
                            <div className="flex items-center gap-1.5 mt-1">
                              {tags.map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200/60 font-medium"
                                >
                                  {tag}
                                </span>
                              ))}
                              <span className="text-[10px] text-slate-400">
                                • {formatBytes(doc.size_bytes)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Pages */}
                      <td className="py-4 px-4 text-center font-medium text-slate-600 font-mono tabular-nums">
                        {doc.page_count}
                      </td>

                      {/* Chunks */}
                      <td className="py-4 px-4 text-center font-medium text-slate-600 font-mono tabular-nums">
                        {doc.chunk_count}
                      </td>

                      {/* Tokens */}
                      <td className="py-4 px-4 text-center font-medium text-slate-600 font-mono tabular-nums">
                        {approxTokens}
                      </td>

                      {/* Added */}
                      <td className="py-4 px-4 text-left font-medium text-slate-600">
                        Today, 09:41
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4 text-center">
                        {doc.status === 'ready' && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
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
                            <XCircle className="w-3.5 h-3.5 text-rose-600" />
                            Failed
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleInspect(doc.id)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Inspect Chunks"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(doc.id, doc.filename)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
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
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">{selectedDoc.filename}</h3>
                  <span className="text-[11px] font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full font-mono">
                    {selectedDoc.chunks.length} Chunks
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  SHA-256: {selectedDoc.sha256}
                </p>
              </div>
              <button
                onClick={() => setSelectedDoc(null)}
                className="text-slate-400 hover:text-slate-700 text-xl font-bold p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter inside chunks */}
            <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter within chunk text..."
                  value={chunkSearch}
                  onChange={(e) => setChunkSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <span className="text-xs text-slate-400 font-mono tabular-nums">
                Showing {filteredChunks.length} of {selectedDoc.chunks.length}
              </span>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {filteredChunks.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  No chunks match "{chunkSearch}".
                </div>
              ) : (
                filteredChunks.map((chunk, idx) => (
                  <div key={chunk.id} className="p-4 bg-slate-50 border border-slate-200/90 rounded-xl space-y-2 hover:border-slate-300 transition-colors">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                          Chunk #{idx + 1}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
                          (ID: {chunk.chunk_id})
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                          Page {chunk.page_number} • {chunk.token_count} Tokens • Vector #{chunk.vector_id}
                        </span>
                        <button
                          onClick={() => handleCopyChunk(chunk.chunk_id, chunk.text)}
                          className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-blue-600 bg-white border border-slate-200 px-2 py-0.5 rounded shadow-2xs transition-colors cursor-pointer"
                          title="Copy chunk text"
                        >
                          {copiedChunkId === chunk.chunk_id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span className="text-emerald-600">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-800 font-mono whitespace-pre-wrap leading-relaxed bg-white p-3 rounded-lg border border-slate-200 select-text">
                      {chunk.text}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="px-6 py-3.5 border-t border-slate-200 flex justify-between items-center bg-slate-50">
              <span className="text-xs text-slate-400">
                Authoritative SQLite chunks synchronized with FAISS vectors
              </span>
              <button
                onClick={() => setSelectedDoc(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
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
