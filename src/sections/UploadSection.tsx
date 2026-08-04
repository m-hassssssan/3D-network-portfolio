import { useState, useCallback, useRef, useEffect } from 'react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { cn } from '@/lib/utils';
import ForceGraph2D from 'react-force-graph-2d';
import {
  Upload,
  FileText,
  AlertTriangle,
  X,
  Plus,
  Trash2,
  Sparkles,
  BookOpen,
} from 'lucide-react';

/* ────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────── */

interface UploadedPaper {
  id: string;
  title: string;
  authors: string;
  year: number;
  journal: string;
  doi: string;
  abstract: string;
  keywords: string;
  citations: number;
  community: number;
  community_name: string;
  isNew: boolean;
  val: number;
}

interface GraphNode {
  id: string;
  title: string;
  community: number;
  community_name: string;
  val: number;
  year: number;
  citations: number;
  x?: number;
  y?: number;
  isNew?: boolean;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  value: number;
}

/* ────────────────────────────────────────────────
   Constants
   ──────────────────────────────────────────────── */

import { SCHOOL_COLORS } from '@/lib/colors';

const STORAGE_KEY = 'connectome-uploaded-papers';

const DEFAULT_COMMUNITY_NAMES: Record<number, string> = {
  0: 'Foundations & Graph Theory',
  1: 'Resting-State fMRI & Default Mode',
  2: 'Structural Connectivity & dMRI',
  3: 'Dynamic FC & Brain States',
  4: 'Clinical Applications',
  5: 'Hubs, Rich-Club & Gradients',
  6: 'Precision Mapping & Individual Differences',
  7: 'Methods, Tools & Parcellations',
  8: 'Recent Advances (arXiv)',
};

/* ────────────────────────────────────────────────
   BibTeX Parser (simple regex-based)
   ──────────────────────────────────────────────── */

function parseBibTeX(content: string): Array<{
  title: string;
  authors: string;
  year: number;
  journal: string;
  doi: string;
  abstract: string;
  keywords: string;
}> {
  const entries: Array<{
    title: string;
    authors: string;
    year: number;
    journal: string;
    doi: string;
    abstract: string;
    keywords: string;
  }> = [];

  // Split into individual entries
  const entryRegex = /@\w+\s*\{[\s\S]*?\n\s*\}/g;
  const entries_raw = content.match(entryRegex) || [];

  for (const raw of entries_raw) {
    const extractField = (name: string): string => {
      // Try brace-delimited value
      const bracePattern = name + '[ \t]*=[ \t]*\\{([ ^}]*(?:\\{[^}]*\\}[^}]*)*)\\}';
      const braceRe = new RegExp(bracePattern, 'i');
      let m = raw.match(braceRe);
      if (m && m[1]) {
        return m[1].replace(/\\([{}&%$#_~^\\])/g, '$1').trim();
      }
      // Try quote-delimited value
      const quotePattern = name + '[ \t]*=[ \t]*"([^"]*)"';
      const quoteRe = new RegExp(quotePattern, 'i');
      m = raw.match(quoteRe);
      if (m && m[1]) {
        return m[1].replace(/\\([{}&%$#_~^\\])/g, '$1').trim();
      }
      return '';
    };

    const title = extractField('title');
    const authorRaw = extractField('author');
    const yearStr = extractField('year');
    const journal = extractField('journal') || extractField('booktitle') || extractField('journaltitle') || '';
    const doi = extractField('doi');
    const abstract = extractField('abstract');
    const keywords = extractField('keywords');

    const authors = authorRaw
      .split(/\s+and\s+/i)
      .map((a: string) => a.trim())
      .filter(Boolean)
      .join(', ');

    const year = parseInt(yearStr, 10);

    if (title && !isNaN(year)) {
      entries.push({ title, authors, year, journal, doi, abstract, keywords });
    }
  }

  return entries;
}

/* ────────────────────────────────────────────────
   Utility functions
   ──────────────────────────────────────────────── */

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a.map((s) => s.toLowerCase().trim()));
  const setB = new Set(b.map((s) => s.toLowerCase().trim()));
  const intersection = [...setA].filter((x) => setB.has(x));
  const union = new Set([...setA, ...setB]);
  return intersection.length / union.size;
}

function authorOverlap(authorsA: string, authorsB: string): number {
  if (!authorsA || !authorsB) return 0;
  const a = authorsA.split(',').map((s) => s.trim().toLowerCase());
  const b = authorsB.split(',').map((s) => s.trim().toLowerCase());
  let matches = 0;
  for (const name of a) {
    if (name.length < 2) continue;
    for (const other of b) {
      if (other.includes(name) || name.includes(other)) {
        matches++;
        break;
      }
    }
  }
  return matches;
}

function yearProximity(yearA: number, yearB: number): number {
  const diff = Math.abs(yearA - yearB);
  if (diff <= 2) return 1;
  if (diff <= 5) return 0.5;
  if (diff <= 10) return 0.2;
  return 0;
}

/* ────────────────────────────────────────────────
   Main Component
   ──────────────────────────────────────────────── */

export default function UploadSection() {
  const sectionRef = useScrollAnimation<HTMLElement>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [isDragOver, setIsDragOver] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseStatus, setParseStatus] = useState('');
  const [newPapers, setNewPapers] = useState<UploadedPaper[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [graphData, setGraphData] = useState<{
    nodes: GraphNode[];
    links: GraphLink[];
  }>({ nodes: [], links: [] });
  const [showPreview, setShowPreview] = useState(false);

  // Manual entry form
  const [manualForm, setManualForm] = useState({
    title: '',
    authors: '',
    year: '',
    journal: '',
    doi: '',
    abstract: '',
    keywords: '',
  });

  // Load existing papers on mount and build preview
  useEffect(() => {
    if (newPapers.length > 0) {
      buildPreview(newPapers);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newPapers));
    }
  }, [newPapers]);

  // Placement Logic
  const assignCommunity = useCallback(
    (
      paper: {
        title: string;
        authors: string;
        year: number;
        journal: string;
        doi: string;
        abstract: string;
        keywords: string;
      },
      existingNodes: GraphNode[]
    ): { community: number; community_name: string } => {
      if (existingNodes.length === 0) return { community: 0, community_name: DEFAULT_COMMUNITY_NAMES[0] };

      const communityScores: Record<number, number> = {};

      for (const node of existingNodes) {
        if (!node || typeof node.community !== 'number') continue;
        let score = 0;

        // Keyword overlap (Jaccard)
        const paperKeywords = paper.keywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean);
        const nodeKeywords = (node.title || '').split(/\s+/).map((w) => w.trim().toLowerCase());
        const kwSim = jaccardSimilarity(paperKeywords, nodeKeywords);
        score += kwSim * 3;

        // Author overlap
        const authSim = authorOverlap(paper.authors, node.title || '');
        score += authSim * 2;

        // Year proximity
        score += yearProximity(paper.year, node.year || 0) * 0.5;

        const comm = node.community;
        communityScores[comm] = (communityScores[comm] || 0) + score;
      }

      let bestComm = 0;
      let bestScore = -Infinity;
      for (const [comm, score] of Object.entries(communityScores)) {
        if (score > bestScore) {
          bestScore = score;
          bestComm = parseInt(comm, 10);
        }
      }

      return {
        community: bestComm,
        community_name: DEFAULT_COMMUNITY_NAMES[bestComm] || 'Community ' + bestComm,
      };
    },
    []
  );

  // Build preview graph
  const buildPreview = useCallback(
    async (papers: UploadedPaper[]) => {
      try {
        const res = await fetch('/network_data.json');
        const data = await res.json();

        const existingNodes: GraphNode[] = (data.nodes || [])
          .slice(0, 80)
          .map((n: Record<string, unknown>) => ({
            id: String(n.id ?? n.title),
            title: String(n.title || ''),
            community: Number(n.community ?? 0),
            community_name: String(n.community_name || ''),
            val: Math.sqrt(Number(n.citations ?? 1)) * 0.15,
            year: Number(n.year ?? 0),
            citations: Number(n.citations ?? 0),
            isNew: false,
          }));

        const newNodes: GraphNode[] = papers.map((p) => ({
          id: p.id,
          title: p.title,
          community: p.community,
          community_name: p.community_name,
          val: 6,
          year: p.year,
          citations: p.citations,
          isNew: true,
        }));

        const allNodes = [...existingNodes, ...newNodes];

        // Build similarity links between new and existing nodes
        const links: GraphLink[] = [];
        for (const newNode of newNodes) {
          for (const existing of existingNodes) {
            const paperKeywords = (papers.find((p) => p.id === newNode.id)?.keywords || '')
              .split(',')
              .map((k) => k.trim())
              .filter(Boolean);
            const existingKeywords = (existing.title || '').split(/\s+/);
            const sim = jaccardSimilarity(paperKeywords, existingKeywords);
            if (sim > 0.05) {
              links.push({
                source: newNode.id,
                target: existing.id,
                value: sim,
              });
            }
          }
        }

        // Add some intra-existing edges for structure
        const existingLinks = (data.links || [])
          .filter(
            (l: Record<string, unknown>) =>
              existingNodes.some((n: GraphNode) => n.id === (l.source as string)) &&
              existingNodes.some((n: GraphNode) => n.id === (l.target as string))
          )
          .slice(0, 120)
          .map((l: Record<string, unknown>) => ({
            source: String(l.source),
            target: String(l.target),
            value: Number(l.value ?? 1),
          }));

        setGraphData({
          nodes: allNodes,
          links: [...existingLinks, ...links],
        });
        setShowPreview(true);
      } catch (err) {
        console.warn('Failed to load network data for preview:', err);
      }
    },
    []
  );

  // Process file
  const processFile = useCallback(
    async (file: File) => {
      setIsParsing(true);
      const ext = file.name.split('.').pop()?.toLowerCase();
      const papers: UploadedPaper[] = [];

      if (ext === 'bib') {
        setParseStatus('Parsing BibTeX...');
        const text = await file.text();
        const entries = parseBibTeX(text);
        for (const e of entries) {
          const tempId = 'upload_' + Math.random().toString(36).slice(2, 9);
          papers.push({
            id: tempId,
            title: e.title,
            authors: e.authors,
            year: e.year,
            journal: e.journal,
            doi: e.doi,
            abstract: e.abstract,
            keywords: e.keywords,
            citations: 0,
            ...assignCommunity(e, graphData.nodes),
            isNew: true,
            val: 5,
          });
        }
      } else if (ext === 'pdf') {
        setParseStatus('Reading PDF (using filename for metadata)...');
        await new Promise((r) => setTimeout(r, 500));
        const title = file.name.replace(/\.pdf$/i, '').replace(/[_-]/g, ' ');
        const paperData = {
          title,
          authors: '',
          year: new Date().getFullYear(),
          journal: '',
          doi: '',
          abstract: '',
          keywords: '',
        };
        const tempId = 'upload_' + Math.random().toString(36).slice(2, 9);
        papers.push({
          id: tempId,
          title: paperData.title,
          authors: paperData.authors,
          year: paperData.year,
          journal: paperData.journal,
          doi: paperData.doi,
          abstract: paperData.abstract,
          keywords: paperData.keywords,
          citations: 0,
          ...assignCommunity(paperData, graphData.nodes),
          isNew: true,
          val: 5,
        });
      } else if (ext === 'txt') {
        setParseStatus('Reading DOI list...');
        const text = await file.text();
        const dois = text
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 0 && l.startsWith('10.'));
        for (const doi of dois) {
          const tempId = 'upload_' + Math.random().toString(36).slice(2, 9);
          papers.push({
            id: tempId,
            title: 'DOI: ' + doi,
            authors: '',
            year: new Date().getFullYear(),
            journal: '',
            doi,
            abstract: 'DOI metadata fetched client-side; detailed info requires external API.',
            keywords: '',
            citations: 0,
            community: 0,
            community_name: DEFAULT_COMMUNITY_NAMES[0],
            isNew: true,
            val: 5,
          });
        }
      }

      setParseStatus('Added ' + papers.length + ' paper(s)');
      setIsParsing(false);

      if (papers.length > 0) {
        setNewPapers((prev) => [...prev, ...papers]);
        const allPapers = [...newPapers, ...papers];
        buildPreview(allPapers);
      }
    },
    [assignCommunity, graphData.nodes, newPapers, buildPreview]
  );

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        processFile(file);
      }
    },
    [processFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        processFile(file);
      }
      e.target.value = '';
    },
    [processFile]
  );

  // Manual add
  const handleManualAdd = useCallback(() => {
    const year = parseInt(manualForm.year, 10);
    if (!manualForm.title.trim() || isNaN(year)) return;

    const paperData = {
      title: manualForm.title,
      authors: manualForm.authors,
      year,
      journal: manualForm.journal,
      doi: manualForm.doi,
      abstract: manualForm.abstract,
      keywords: manualForm.keywords,
    };

    const tempId = 'upload_' + Math.random().toString(36).slice(2, 9);
    const newPaper: UploadedPaper = {
      id: tempId,
      ...paperData,
      citations: 0,
      ...assignCommunity(paperData, graphData.nodes),
      isNew: true,
      val: 5,
    };

    setNewPapers((prev) => [...prev, newPaper]);
    buildPreview([...newPapers, newPaper]);

    setManualForm({
      title: '',
      authors: '',
      year: '',
      journal: '',
      doi: '',
      abstract: '',
      keywords: '',
    });
  }, [manualForm, assignCommunity, graphData.nodes, newPapers, buildPreview]);

  // Delete paper
  const handleDelete = useCallback(
    (id: string) => {
      const updated = newPapers.filter((p) => p.id !== id);
      setNewPapers(updated);
      if (updated.length > 0) {
        buildPreview(updated);
      } else {
        setShowPreview(false);
      }
    },
    [newPapers, buildPreview]
  );

  // Clear all
  const handleClearAll = useCallback(() => {
    if (window.confirm('Remove all uploaded papers?')) {
      setNewPapers([]);
      setShowPreview(false);
      setGraphData({ nodes: [], links: [] });
    }
  }, []);

  // Canvas painter for graph
  const paintNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const r = Math.max(3, (node.val || 3) * (node.isNew ? 1.2 : 0.8));
      const color = SCHOOL_COLORS[node.community] || '#888';

      // Pulsing ring for new nodes
      if (node.isNew) {
        const pulse = Math.sin(Date.now() / 300) * 0.3 + 0.7;
        ctx.beginPath();
        ctx.arc(node.x ?? 0, node.y ?? 0, r + 6 * pulse, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(212, 168, 83, ' + (0.4 * pulse).toFixed(2) + ')';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Main node
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI);
      ctx.fillStyle = node.isNew ? '#D4A853' : color;
      ctx.fill();

      // Border
      ctx.strokeStyle = node.isNew ? '#D4A853' : '#fff';
      ctx.lineWidth = node.isNew ? 2 : 1;
      ctx.stroke();

      // Label for new nodes or high zoom
      if (node.isNew || globalScale > 1.5) {
        ctx.font = (node.isNew ? '600' : '400') + ' ' + (node.isNew ? 11 : 9) + 'px "Logotype Frenzy", "Kaushan Script", "Mr Dafoe", cursive, sans-serif';
        ctx.fillStyle = node.isNew ? '#D4A853' : '#1A1B3A';
        ctx.textAlign = 'center';
        ctx.fillText(
          node.title.length > 30 ? node.title.slice(0, 30) + '...' : node.title,
          node.x ?? 0,
          (node.y ?? 0) + r + 12
        );
      }
    },
    []
  );

  /* RENDER */

  return (
    <section
      id="upload"
      ref={sectionRef}
      className="w-full bg-warm-gray py-space-24"
    >
      <div className="section-container">
        {/* Header */}
        <div className="scroll-animate mb-space-4">
          <span className="label text-accent-gold tracking-[0.08em]">
            UPLOAD
          </span>
        </div>
        <h2 className="scroll-animate heading-1 font-serif text-accent-indigo mb-space-4">
          Add Your Papers
        </h2>
        <p className="scroll-animate body-lg text-text-secondary mb-space-12 max-w-3xl">
          Upload DOIs, BibTeX, or PDFs to add them to the network. All processing
          happens in your browser — no data leaves your computer.
        </p>

        {/* Drop Zone */}
        <div className="scroll-animate mb-space-8">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'mx-auto max-w-[700px] h-[240px] rounded-2xl border-2 border-dashed cursor-pointer flex flex-col items-center justify-center gap-3 transition-all duration-300',
              isDragOver
                ? 'border-accent-indigo bg-[rgba(26,27,58,0.04)]'
                : 'border-border-medium bg-surface-white hover:bg-[rgba(26,27,58,0.02)] hover:border-accent-indigo'
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".bib,.pdf,.txt"
              multiple
              className="hidden"
              onChange={handleFileInput}
            />
            <Upload
              size={48}
              className={cn(
                'transition-colors duration-300',
                isDragOver ? 'text-accent-indigo' : 'text-text-tertiary'
              )}
            />
            <p className="heading-3 text-text-secondary text-center">
              Drag &amp; drop files here, or{' '}
              <span className="text-accent-indigo underline">click to browse</span>
            </p>
            <p className="body-sm text-text-tertiary">
              Accepts: .bib (BibTeX), .pdf, .txt (DOI list)
            </p>
          </div>
        </div>

        {/* Parsing Status */}
        {isParsing && (
          <div className="scroll-animate flex items-center justify-center gap-2 mb-space-6">
            <Sparkles size={16} className="text-accent-gold animate-spin" />
            <span className="mono text-text-secondary">{parseStatus}</span>
          </div>
        )}

        {!isParsing && parseStatus && (
          <div className="scroll-animate flex items-center justify-center gap-2 mb-space-6">
            <Sparkles size={16} className="text-success" />
            <span className="mono text-text-secondary">{parseStatus}</span>
          </div>
        )}

        {/* Manual Entry */}
        <div className="scroll-animate mb-space-8">
          <div className="mx-auto max-w-[700px]">
            <h3 className="heading-4 font-serif text-accent-indigo mb-space-4 flex items-center gap-2">
              <BookOpen size={18} className="text-accent-gold" />
              Or Add Manually
            </h3>
            <div className="bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] p-space-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block label text-text-tertiary mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={manualForm.title}
                    onChange={(e) =>
                      setManualForm((f) => ({ ...f, title: e.target.value }))
                    }
                    placeholder="Paper title"
                    className="w-full border border-border-light rounded-md px-3 py-2 font-mono text-[13px] text-accent-indigo placeholder:text-text-tertiary focus:outline-none focus:border-accent-indigo transition-colors"
                  />
                </div>
                <div>
                  <label className="block label text-text-tertiary mb-1">
                    Authors
                  </label>
                  <input
                    type="text"
                    value={manualForm.authors}
                    onChange={(e) =>
                      setManualForm((f) => ({ ...f, authors: e.target.value }))
                    }
                    placeholder="Last, First, Last2, First2"
                    className="w-full border border-border-light rounded-md px-3 py-2 font-mono text-[13px] text-accent-indigo placeholder:text-text-tertiary focus:outline-none focus:border-accent-indigo transition-colors"
                  />
                </div>
                <div>
                  <label className="block label text-text-tertiary mb-1">
                    Year *
                  </label>
                  <input
                    type="number"
                    value={manualForm.year}
                    onChange={(e) =>
                      setManualForm((f) => ({ ...f, year: e.target.value }))
                    }
                    placeholder="2024"
                    className="w-full border border-border-light rounded-md px-3 py-2 font-mono text-[13px] text-accent-indigo placeholder:text-text-tertiary focus:outline-none focus:border-accent-indigo transition-colors"
                  />
                </div>
                <div>
                  <label className="block label text-text-tertiary mb-1">
                    Journal
                  </label>
                  <input
                    type="text"
                    value={manualForm.journal}
                    onChange={(e) =>
                      setManualForm((f) => ({ ...f, journal: e.target.value }))
                    }
                    placeholder="Journal name"
                    className="w-full border border-border-light rounded-md px-3 py-2 font-mono text-[13px] text-accent-indigo placeholder:text-text-tertiary focus:outline-none focus:border-accent-indigo transition-colors"
                  />
                </div>
                <div>
                  <label className="block label text-text-tertiary mb-1">
                    DOI
                  </label>
                  <input
                    type="text"
                    value={manualForm.doi}
                    onChange={(e) =>
                      setManualForm((f) => ({ ...f, doi: e.target.value }))
                    }
                    placeholder="10.xxxx/xxxxx"
                    className="w-full border border-border-light rounded-md px-3 py-2 font-mono text-[13px] text-accent-indigo placeholder:text-text-tertiary focus:outline-none focus:border-accent-indigo transition-colors"
                  />
                </div>
                <div>
                  <label className="block label text-text-tertiary mb-1">
                    Keywords (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={manualForm.keywords}
                    onChange={(e) =>
                      setManualForm((f) => ({ ...f, keywords: e.target.value }))
                    }
                    placeholder="connectome, graph theory, fMRI"
                    className="w-full border border-border-light rounded-md px-3 py-2 font-mono text-[13px] text-accent-indigo placeholder:text-text-tertiary focus:outline-none focus:border-accent-indigo transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="block label text-text-tertiary mb-1">
                  Abstract
                </label>
                <textarea
                  value={manualForm.abstract}
                  onChange={(e) =>
                    setManualForm((f) => ({ ...f, abstract: e.target.value }))
                  }
                  placeholder="Paper abstract (optional)"
                  rows={3}
                  className="w-full border border-border-light rounded-md px-3 py-2 font-mono text-[13px] text-accent-indigo placeholder:text-text-tertiary focus:outline-none focus:border-accent-indigo transition-colors resize-y"
                />
              </div>
              <button
                onClick={handleManualAdd}
                disabled={!manualForm.title.trim() || !manualForm.year}
                className={cn(
                  'inline-flex items-center gap-2 font-mono text-[13px] font-medium rounded-md px-4 py-2.5 transition-all duration-200',
                  manualForm.title.trim() && manualForm.year
                    ? 'bg-accent-gold text-accent-indigo hover:bg-star-gold'
                    : 'bg-border-light text-text-tertiary cursor-not-allowed'
                )}
              >
                <Plus size={16} />
                Add Paper
              </button>
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="scroll-animate mb-space-8">
          <div className="mx-auto max-w-[900px] bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] p-space-4 flex gap-3">
            <AlertTriangle size={20} className="text-warning shrink-0 mt-0.5" />
            <p className="body-sm text-text-secondary">
              <strong className="text-warning">Note:</strong> New paper edges
              and school assignments are approximate since reference lists are not
              available. Full citation network analysis requires complete
              reference data. Papers are placed based on keyword overlap,
              author matching, and year proximity.
            </p>
          </div>
        </div>

        {/* Uploaded Papers List */}
        {newPapers.length > 0 && (
          <div className="scroll-animate mb-space-8">
            <div className="mx-auto max-w-[900px]">
              <div className="flex items-center justify-between mb-space-4">
                <h3 className="heading-4 font-serif text-accent-indigo">
                  Uploaded Papers ({newPapers.length})
                </h3>
                <button
                  onClick={handleClearAll}
                  className="inline-flex items-center gap-1.5 font-mono text-[12px] text-danger border border-danger rounded-md px-3 py-1.5 hover:bg-danger hover:text-white transition-all duration-200"
                >
                  <Trash2 size={14} />
                  Clear all
                </button>
              </div>

              <div className="bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-surface-elevated border-b-2 border-border-medium">
                        <th className="text-left px-4 py-2.5 heading-4 text-accent-indigo font-mono text-[12px]">
                          #
                        </th>
                        <th className="text-left px-4 py-2.5 heading-4 text-accent-indigo font-mono text-[12px]">
                          Title
                        </th>
                        <th className="text-left px-4 py-2.5 heading-4 text-accent-indigo font-mono text-[12px]">
                          Authors
                        </th>
                        <th className="text-left px-4 py-2.5 heading-4 text-accent-indigo font-mono text-[12px]">
                          Year
                        </th>
                        <th className="text-left px-4 py-2.5 heading-4 text-accent-indigo font-mono text-[12px]">
                          School
                        </th>
                        <th className="text-center px-4 py-2.5 heading-4 text-accent-indigo font-mono text-[12px]">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {newPapers.map((paper, idx) => (
                        <tr
                          key={paper.id}
                          className="border-b border-border-light last:border-b-0 hover:bg-[rgba(212,168,83,0.04)] transition-colors"
                        >
                          <td className="px-4 py-3 mono-sm text-text-tertiary">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-3 mono text-accent-indigo max-w-[300px] truncate">
                            {paper.title}
                          </td>
                          <td className="px-4 py-3 mono text-text-secondary max-w-[200px] truncate">
                            {paper.authors || '—'}
                          </td>
                          <td className="px-4 py-3 mono text-text-secondary">
                            {paper.year}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="w-2.5 h-2.5 rounded-full"
                                style={{
                                  backgroundColor:
                                    SCHOOL_COLORS[paper.community] || '#888',
                                }}
                              />
                              <span className="mono-sm text-text-secondary truncate max-w-[140px]">
                                {paper.community_name}
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => handleDelete(paper.id)}
                              className="inline-flex items-center text-text-tertiary hover:text-danger transition-colors"
                              title="Remove paper"
                            >
                              <X size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Graph Preview */}
        {showPreview && graphData.nodes.length > 0 && (
          <div className="scroll-animate mb-space-8">
            <div className="mx-auto max-w-[900px]">
              <div className="flex items-center justify-between mb-space-4">
                <h3 className="heading-4 font-serif text-accent-indigo flex items-center gap-2">
                  <Sparkles size={18} className="text-accent-gold" />
                  Integration Preview
                </h3>
                <span className="mono-sm text-accent-gold bg-accent-gold-light rounded px-2 py-1">
                  {newPapers.length} new paper{newPapers.length !== 1 ? 's' : ''} added to the network
                </span>
              </div>

              <div className="bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] overflow-hidden">
                <div className="h-[300px] w-full">
                  <ForceGraph2D
                    graphData={graphData}
                    nodeCanvasObject={paintNode}
                    linkColor={() => 'rgba(212, 168, 83, 0.2)'}
                    linkWidth={(l: GraphLink) => Math.max(0.5, (l.value || 1) * 0.8)}
                    backgroundColor="#FFFFFF"
                    enableZoomInteraction={true}
                    enablePanInteraction={true}
                    enableNodeDrag={true}
                    cooldownTicks={50}
                    warmupTicks={30}
                    d3AlphaDecay={0.05}
                    d3VelocityDecay={0.3}
                  />
                </div>
              </div>

              <p className="mono-sm text-text-tertiary mt-space-2 text-center">
                New papers shown in gold with pulsing rings. Similarity edges are
                approximate (keyword Jaccard + title overlap).
              </p>
            </div>
          </div>
        )}

        {/* Persistence Info */}
        <div className="scroll-animate">
          <div className="mx-auto max-w-[700px] text-center">
            <p className="body-sm text-text-tertiary flex items-center justify-center gap-2">
              <FileText size={14} />
              Your uploaded papers are stored locally in your browser
              (localStorage). They persist across sessions but are not shared
              with any server.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
