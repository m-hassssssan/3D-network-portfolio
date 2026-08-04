import { useState, useEffect, useCallback } from 'react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { cn } from '@/lib/utils';
import {
  Download,
  FileJson,
  BookOpen,
  FileArchive,
  AlertCircle,
  Check,
} from 'lucide-react';

/* ────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────── */

interface PaperNode {
  id: string;
  title: string;
  authors: string[];
  year: number;
  journal: string;
  citations: number;
  community: number;
  community_name: string;
  abstract: string;
  doi: string;
  keywords: string[];
  val: number;
}

interface NetworkData {
  nodes: PaperNode[];
  links: Array<{
    source: string;
    target: string;
    value: number;
  }>;
}

/* ────────────────────────────────────────────────
   BibTeX Key Generator
   ──────────────────────────────────────────────── */

function makeBibKey(paper: PaperNode): string {
  const firstAuthor = (paper.authors[0] || 'Unknown')
    .split(' ')
    .pop()
    ?.replace(/[^a-zA-Z]/g, '') || 'Unknown';
  const year = paper.year;
  const firstWord = paper.title
    .split(' ')[0]
    ?.replace(/[^a-zA-Z]/g, '')
    .toLowerCase() || 'paper';
  return `${firstAuthor}${year}_${firstWord}`;
}

function escapeBibTeX(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/~/g, '\\~{}')
    .replace(/\^/g, '\\^{}')
    .replace(/\$/g, '\\$')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/#/g, '\\#');
}

function paperToBibTeX(paper: PaperNode): string {
  const key = makeBibKey(paper);
  const lines = [
    `@article{${key},`,
    `  title = {${escapeBibTeX(paper.title)}},`,
    `  author = {${paper.authors.map(escapeBibTeX).join(' and ')}},`,
    `  year = {${paper.year}},`,
  ];
  if (paper.journal) {
    lines.push(`  journal = {${escapeBibTeX(paper.journal)}},`);
  }
  if (paper.doi) {
    lines.push(`  doi = {${paper.doi}},`);
  }
  if (paper.abstract) {
    lines.push(`  abstract = {${escapeBibTeX(paper.abstract)}},`);
  }
  if (paper.keywords && paper.keywords.length > 0) {
    lines.push(`  keywords = {${paper.keywords.map(escapeBibTeX).join(', ')}},`);
  }
  lines.push(`  citations = {${paper.citations}}`);
  lines.push(`}`);
  return lines.join('\n');
}

/* ────────────────────────────────────────────────
   CSV Generator
   ──────────────────────────────────────────────── */

function escapeCSV(s: string | number): string {
  const str = String(s || '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function generateCSV(papers: PaperNode[]): string {
  const headers = ['ID', 'Title', 'Authors', 'Year', 'Journal', 'DOI', 'Citations', 'Keywords', 'School'];
  const rows = papers.map((p) =>
    [
      p.id,
      p.title,
      p.authors.join(', '),
      p.year,
      p.journal,
      p.doi,
      p.citations,
      (p.keywords || []).join(', '),
      p.community_name,
    ]
      .map(escapeCSV)
      .join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

/* ────────────────────────────────────────────────
   Download helper
   ──────────────────────────────────────────────── */

function triggerDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ────────────────────────────────────────────────
   Card Sub-Component
   ──────────────────────────────────────────────── */

function DownloadCard({
  icon,
  title,
  description,
  children,
  delay = 0,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <div
      className="scroll-animate bg-surface-white border border-border-light rounded-lg p-space-6 shadow-card hover:shadow-card-hover hover:border-border-medium transition-all duration-200 flex flex-col"
      style={{ transitionDelay: `${delay}s` }}
    >
      <div className="flex items-center gap-3 mb-space-4">
        <div className="w-10 h-10 rounded-lg bg-accent-gold-light flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div>
          <h3 className="heading-3 font-serif text-accent-indigo">{title}</h3>
        </div>
      </div>
      <p className="body-sm text-text-secondary mb-space-6 flex-1">
        {description}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/* ────────────────────────────────────────────────
   Main Component
   ──────────────────────────────────────────────── */

export default function DownloadSection() {
  const sectionRef = useScrollAnimation<HTMLElement>();
  const [networkData, setNetworkData] = useState<NetworkData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [jsonSize, setJsonSize] = useState('~2.1 MB');
  const [downloaded, setDownloaded] = useState<string | null>(null);

  // Fetch network data on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/network_data.json');
        if (!cancelled) {
          // Try to get content-length for accurate size
          const contentLength = res.headers.get('content-length');
          if (contentLength) {
            const mb = (parseInt(contentLength, 10) / (1024 * 1024)).toFixed(1);
            setJsonSize(`~${mb} MB`);
          }
        }
        const data: NetworkData = await res.json();
        if (!cancelled) {
          setNetworkData(data);
          setIsLoading(false);
        }
      } catch (err) {
        console.warn('Failed to load network data:', err);
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Download handlers
  const downloadJSON = useCallback(async () => {
    try {
      const res = await fetch('/network_data.json');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'network_data.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloaded('json');
      setTimeout(() => setDownloaded(null), 2000);
    } catch {
      alert('Failed to download JSON');
    }
  }, []);

  const downloadBibTeX = useCallback(() => {
    if (!networkData || networkData.nodes.length === 0) {
      alert('Network data not loaded yet');
      return;
    }
    const bibEntries = networkData.nodes.map(paperToBibTeX);
    const content = bibEntries.join('\n\n');
    triggerDownload(content, 'bibliography.bib', 'text/plain');
    setDownloaded('bib');
    setTimeout(() => setDownloaded(null), 2000);
  }, [networkData]);

  const downloadCSV = useCallback(() => {
    if (!networkData || networkData.nodes.length === 0) {
      alert('Network data not loaded yet');
      return;
    }
    const csv = generateCSV(networkData.nodes);
    triggerDownload(csv, 'bibliography.csv', 'text/csv');
    setDownloaded('csv');
    setTimeout(() => setDownloaded(null), 2000);
  }, [networkData]);

  /* ═══════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════ */

  return (
    <section
      id="download"
      ref={sectionRef}
      className="w-full bg-off-white py-space-24 pb-space-16"
    >
      <div className="section-container">
        {/* ── Header ────────────────────────── */}
        <div className="scroll-animate mb-space-4">
          <span className="label text-accent-gold tracking-[0.08em]">
            DOWNLOAD
          </span>
        </div>
        <h2 className="scroll-animate heading-1 font-serif text-accent-indigo mb-space-4">
          Download the Corpus
        </h2>
        <p className="scroll-animate body-lg text-text-secondary mb-space-12 max-w-2xl">
          All data is pre-computed and freely available. Export in multiple
          formats for your own analysis.
        </p>

        {/* ── Download Cards ────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-space-12">
          {/* A. JSON Corpus Card */}
          <DownloadCard
            icon={<FileJson size={20} className="text-accent-gold" />}
            title="Full Corpus (JSON)"
            description="244 papers with complete metadata, edges, communities, and analysis results."
            delay={0}
          >
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-surface-elevated text-mono text-text-tertiary text-[11px] mr-2">
              {jsonSize}
            </span>
            <button
              onClick={downloadJSON}
              disabled={isLoading}
              className={cn(
                'inline-flex items-center gap-2 font-mono text-[12px] font-medium rounded-md px-4 py-2.5 border transition-all duration-200',
                downloaded === 'json'
                  ? 'bg-success border-success text-white'
                  : 'border-accent-indigo text-accent-indigo hover:bg-accent-indigo hover:text-white',
                isLoading && 'opacity-50 cursor-not-allowed'
              )}
            >
              {downloaded === 'json' ? (
                <>
                  <Check size={14} />
                  Downloaded
                </>
              ) : (
                <>
                  <Download size={14} />
                  Download JSON
                </>
              )}
            </button>
          </DownloadCard>

          {/* B. Bibliography Card */}
          <DownloadCard
            icon={<BookOpen size={20} className="text-accent-gold" />}
            title="Bibliography (BibTeX + CSV)"
            description="All 244 papers formatted for citation management."
            delay={0.08}
          >
            <button
              onClick={downloadBibTeX}
              disabled={isLoading}
              className={cn(
                'inline-flex items-center gap-2 font-mono text-[12px] font-medium rounded-md px-3 py-2.5 border transition-all duration-200',
                downloaded === 'bib'
                  ? 'bg-success border-success text-white'
                  : 'border-accent-indigo text-accent-indigo hover:bg-accent-indigo hover:text-white',
                isLoading && 'opacity-50 cursor-not-allowed'
              )}
            >
              {downloaded === 'bib' ? (
                <>
                  <Check size={14} />
                  BibTeX
                </>
              ) : (
                'Download BibTeX'
              )}
            </button>
            <button
              onClick={downloadCSV}
              disabled={isLoading}
              className={cn(
                'inline-flex items-center gap-2 font-mono text-[12px] font-medium rounded-md px-3 py-2.5 border transition-all duration-200',
                downloaded === 'csv'
                  ? 'bg-success border-success text-white'
                  : 'border-accent-indigo text-accent-indigo hover:bg-accent-indigo hover:text-white',
                isLoading && 'opacity-50 cursor-not-allowed'
              )}
            >
              {downloaded === 'csv' ? (
                <>
                  <Check size={14} />
                  CSV
                </>
              ) : (
                'Download CSV'
              )}
            </button>
          </DownloadCard>

          {/* C. PDF Collection Card */}
          <DownloadCard
            icon={<FileArchive size={20} className="text-accent-gold" />}
            title="Open-Access PDFs"
            description="PDFs that could be downloaded from open-access sources."
            delay={0.16}
          >
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-accent-gold-light text-mono text-accent-indigo text-[11px] mr-2">
              Coming soon
            </span>
            <button
              disabled
              className="inline-flex items-center gap-2 font-mono text-[12px] font-medium rounded-md px-4 py-2.5 border border-border-light text-text-tertiary cursor-not-allowed opacity-60"
              title="PDF download requires batch fetching from publisher APIs"
            >
              <AlertCircle size={14} />
              Download ZIP (N/A)
            </button>
          </DownloadCard>
        </div>

        {/* ── Data Transparency Statement ───── */}
        <div className="scroll-animate max-w-[900px] mx-auto">
          <div className="bg-surface-white border border-border-light rounded-lg p-space-6">
            <h4 className="heading-4 font-serif text-accent-indigo mb-space-4 flex items-center gap-2">
              <AlertCircle size={18} className="text-accent-gold" />
              Data Transparency
            </h4>
            <div className="space-y-2">
              <p className="mono-sm text-text-secondary">
                <strong>Data mode:</strong> Keyword co-occurrence network
                (reference lists were not available from data sources)
              </p>
              <p className="mono-sm text-text-secondary">
                <strong>Completeness:</strong> 100% titles/authors/years, ~95%
                DOIs, ~90% abstracts, ~85% citation counts
              </p>
              <p className="mono-sm text-text-secondary">
                <strong>Edge type:</strong> Keyword Jaccard similarity + author
                overlap + year proximity + journal match
              </p>
              <p className="mono-sm text-text-secondary">
                <strong>Integrity:</strong> No papers or edges were invented —
                all data comes from real Google Scholar and arXiv searches
              </p>
              <p className="mono-sm text-text-tertiary mt-space-3 pt-space-3 border-t border-border-light">
                Network: 244 papers · 9 schools · 21,285 connections · 1994–2026
                · Modularity Q = 0.08 (Louvain)
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
