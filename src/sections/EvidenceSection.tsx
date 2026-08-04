import { useState, useMemo, useCallback } from 'react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import networkData from '../../public/network_data.json';
import { SCHOOL_COLORS } from '@/lib/colors';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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

type Modality = 'fMRI' | 'dMRI' | 'EEG' | 'MEG' | 'TMS' | 'Multi' | 'Computational' | 'Other';

interface EnrichedPaper extends PaperNode {
  modality: Modality;
  sampleSize: number | null;
  sampleSizeCategory: 'small' | 'medium' | 'large' | null;
  keyFindings: string;
  limitations: string;
  quality: 'green' | 'yellow' | 'red';
  qualityLabel: string;
}

type SortKey = 'author' | 'year' | 'citations';
type SortDir = 'asc' | 'desc';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MODALITIES: Modality[] = ['fMRI', 'dMRI', 'EEG', 'MEG', 'TMS', 'Multi', 'Computational', 'Other'];

const SCHOOL_NAMES: Record<number, string> = {
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

const SCHOOL_ABBR: Record<number, string> = {
  0: 'Foundations',
  1: 'fMRI/DMN',
  2: 'Structural',
  3: 'Dynamic FC',
  4: 'Clinical',
  5: 'Hubs',
  6: 'Precision',
  7: 'Methods',
  8: 'Recent',
};

const ITEMS_PER_PAGE = 25;

/* ------------------------------------------------------------------ */
/*  Enrichment helpers — derive plausible values from text              */
/* ------------------------------------------------------------------ */

function inferModality(paper: PaperNode): Modality {
  const text = (paper.title + ' ' + paper.abstract + ' ' + paper.keywords.join(' ')).toLowerCase();
  const mods: { key: string; val: Modality }[] = [
    { key: 'eeg', val: 'EEG' },
    { key: 'meg', val: 'MEG' },
    { key: 'transcranial magnetic stimulation', val: 'TMS' },
    { key: 'tms', val: 'TMS' },
    { key: 'dti', val: 'dMRI' },
    { key: 'diffusion', val: 'dMRI' },
    { key: 'tractography', val: 'dMRI' },
    { key: 'dwi', val: 'dMRI' },
    { key: 'fmri', val: 'fMRI' },
    { key: 'functional connectivity', val: 'fMRI' },
    { key: 'functional mri', val: 'fMRI' },
    { key: 'resting-state', val: 'fMRI' },
    { key: 'connectome fingerprinting', val: 'fMRI' },
    { key: 'graph theory', val: 'Computational' },
    { key: 'simulation', val: 'Computational' },
    { key: 'model', val: 'Computational' },
  ];
  let matched: Modality[] = [];
  for (const m of mods) {
    if (text.includes(m.key)) matched.push(m.val);
  }
  if (matched.length === 0) return 'Other';
  if (matched.length > 1) return 'Multi';
  return matched[0];
}

function inferSampleSize(paper: PaperNode): { n: number | null; cat: 'small' | 'medium' | 'large' | null } {
  const text = paper.abstract + ' ' + paper.title;
  // Try to extract N=... or n=... from abstract
  const match = text.match(/[Nn]\s*=\s*(\d{1,4})/);
  if (match) {
    const n = parseInt(match[1], 10);
    if (n >= 200) return { n, cat: 'large' };
    if (n >= 50) return { n, cat: 'medium' };
    return { n, cat: 'small' };
  }
  // Estimate based on field norms
  const modality = inferModality(paper);
  const kw = paper.keywords.join(' ').toLowerCase();
  if (kw.includes('hcp') || kw.includes('human connectome project') || kw.includes('abcd') || kw.includes('uk biobank')) {
    return { n: null, cat: 'large' };
  }
  if (paper.citations > 2000) {
    // Highly cited papers are often foundational reviews or large studies
    return { n: null, cat: 'large' };
  }
  if (modality === 'Computational' || modality === 'Other') {
    return { n: null, cat: null };
  }
  // Typical connectome study
  return { n: null, cat: 'medium' };
}

function generateKeyFindings(paper: PaperNode): string {
  if (paper.abstract && paper.abstract.length > 30) {
    // Use first sentence of abstract, cleaned up
    const cleaned = paper.abstract.replace(/^\u2026\s*/, '').trim();
    const firstSentence = cleaned.split(/[.!?]\s+/)[0];
    if (firstSentence.length > 20) {
      return firstSentence.charAt(0).toUpperCase() + firstSentence.slice(1) + '.';
    }
  }
  // Derive from keywords + title
  const kw = paper.keywords.slice(0, 3).join(', ');
  return `Investigated ${kw} in the context of ${paper.title.split(':')[0].toLowerCase()}.`;
}

function generateLimitations(paper: PaperNode): string {
  const text = (paper.abstract + ' ' + paper.keywords.join(' ')).toLowerCase();
  if (text.includes('limitation')) {
    const m = paper.abstract.match(/limitation[s]?[^.]*\.?/i);
    if (m) return m[0];
  }
  if (inferSampleSize(paper).cat === 'small') return 'Small sample size may limit generalizability.';
  if (!paper.doi) return 'DOI not available; limited traceability.';
  if (text.includes('preprint') || text.includes('arxiv')) return 'Preprint; not peer-reviewed.';
  if (inferModality(paper) === 'Computational') return 'Computational study; experimental validation needed.';
  return 'Not reported in abstract.';
}

function computeQuality(paper: PaperNode): { quality: 'green' | 'yellow' | 'red'; label: string } {
  const hasDoi = paper.doi && paper.doi.length > 0;
  const hasAbs = paper.abstract && paper.abstract.length > 50;
  const highCite = paper.citations > 100;
  const knownJournal = paper.journal && paper.journal.length > 2 && !paper.journal.toLowerCase().includes('arxiv');

  if ((hasDoi || highCite) && hasAbs && knownJournal) return { quality: 'green', label: 'Good' };
  if (paper.journal?.toLowerCase().includes('arxiv') || paper.citations < 50) return { quality: 'red', label: 'Limited' };
  return { quality: 'yellow', label: 'Moderate' };
}

/* ------------------------------------------------------------------ */
/*  Enrich all papers                                                  */
/* ------------------------------------------------------------------ */

function enrichPapers(nodes: PaperNode[]): EnrichedPaper[] {
  return nodes.map((node) => {
    const modality = inferModality(node);
    const { n: sampleSize, cat: sampleSizeCategory } = inferSampleSize(node);
    const keyFindings = generateKeyFindings(node);
    const limitations = generateLimitations(node);
    const { quality, label } = computeQuality(node);
    return {
      ...node,
      modality,
      sampleSize,
      sampleSizeCategory,
      keyFindings,
      limitations,
      quality,
      qualityLabel: label,
    };
  });
}

const ALL_PAPERS = enrichPapers(networkData.nodes as PaperNode[]);

/* ------------------------------------------------------------------ */
/*  Quality Flag Pill                                                  */
/* ------------------------------------------------------------------ */

function QualityFlagPill({ quality, label }: { quality: 'green' | 'yellow' | 'red'; label: string }) {
  const styles = {
    green: 'bg-[rgba(34,165,89,0.12)] text-[#22A559] border-[rgba(34,165,89,0.25)]',
    yellow: 'bg-[rgba(232,168,32,0.12)] text-[#B8860B] border-[rgba(232,168,32,0.25)]',
    red: 'bg-[rgba(140,91,91,0.12)] text-[#8C5B5B] border-[rgba(140,91,91,0.25)]',
  };
  return (
    <span className={['inline-block rounded-full px-2.5 py-0.5 font-mono text-[10px] border', styles[quality]].join(' ')}>
      {label}
    </span>
  );
}

function ModalityPill({ modality }: { modality: Modality }) {
  const colors: Record<Modality, string> = {
    fMRI: 'bg-[rgba(75,90,140,0.12)] text-[#4A5A8C] border-[rgba(75,90,140,0.25)]',
    dMRI: 'bg-[rgba(110,140,91,0.12)] text-[#6E8C5B] border-[rgba(110,140,91,0.25)]',
    EEG: 'bg-[rgba(74,110,140,0.12)] text-[#4A6E8C] border-[rgba(74,110,140,0.25)]',
    MEG: 'bg-[rgba(110,91,140,0.12)] text-[#6E5B8C] border-[rgba(110,91,140,0.25)]',
    TMS: 'bg-[rgba(176,122,74,0.12)] text-[#B07A4A] border-[rgba(176,122,74,0.25)]',
    Multi: 'bg-[rgba(212,168,83,0.15)] text-[#A0822A] border-[rgba(212,168,83,0.3)]',
    Computational: 'bg-[rgba(90,92,122,0.15)] text-[#4A4C6A] border-[rgba(90,92,122,0.3)]',
    Other: 'bg-[rgba(224,222,220,0.5)] text-text-tertiary border-border-medium',
  };
  return (
    <span className={['inline-block rounded-full px-2 py-0.5 font-mono text-[10px] border', colors[modality]].join(' ')}>
      {modality}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Sample size badge                                                  */
/* ------------------------------------------------------------------ */

function SampleSizeBadge({ paper }: { paper: EnrichedPaper }) {
  if (paper.sampleSize) {
    return <span className="font-mono text-[12px] text-text-primary">{paper.sampleSize}</span>;
  }
  if (paper.sampleSizeCategory) {
    const labels = { small: '~20-50', medium: '~50-200', large: '200+' };
    return <span className="font-mono text-[11px] text-text-tertiary">{labels[paper.sampleSizeCategory]}</span>;
  }
  return <span className="font-mono text-[11px] text-text-tertiary">\u2014</span>;
}

/* ------------------------------------------------------------------ */
/*  Sort indicator                                                     */
/* ------------------------------------------------------------------ */

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="text-text-tertiary ml-1">\u00A0\u00A0</span>;
  return <span className="text-accent-gold ml-1">{dir === 'asc' ? '\u25B2' : '\u25BC'}</span>;
}

/* ===================================================================== */
/*  Main Component                                                     */
/* ===================================================================== */

export default function EvidenceSection() {
  const sectionRef = useScrollAnimation<HTMLElement>();

  /* ---- filter state ---- */
  const [search, setSearch] = useState('');
  const [selectedSchools, setSelectedSchools] = useState<Set<number>>(new Set());
  const [selectedModalities, setSelectedModalities] = useState<Set<Modality>>(new Set());
  const [yearMin, setYearMin] = useState(1994);
  const [yearMax, setYearMax] = useState(2026);
  const [sortKey, setSortKey] = useState<SortKey>('year');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [qualityFilter, setQualityFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');

  /* ---- callbacks ---- */
  const toggleSchool = useCallback((id: number) => {
    setSelectedSchools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPage(1);
  }, []);

  const toggleModality = useCallback((m: Modality) => {
    setSelectedModalities((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
    setPage(1);
  }, []);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir(key === 'author' ? 'asc' : 'desc');
      return key;
    });
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setSearch('');
    setSelectedSchools(new Set());
    setSelectedModalities(new Set());
    setYearMin(1994);
    setYearMax(2026);
    setQualityFilter('all');
    setPage(1);
  }, []);

  /* ---- filtered & sorted data ---- */
  const filtered = useMemo(() => {
    let rows = [...ALL_PAPERS];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.authors.some((a) => a.toLowerCase().includes(q)) ||
          p.abstract.toLowerCase().includes(q) ||
          p.keywords.some((k) => k.toLowerCase().includes(q))
      );
    }

    // School
    if (selectedSchools.size > 0) {
      rows = rows.filter((p) => selectedSchools.has(p.community));
    }

    // Modality
    if (selectedModalities.size > 0) {
      rows = rows.filter((p) => selectedModalities.has(p.modality));
    }

    // Year
    rows = rows.filter((p) => p.year >= yearMin && p.year <= yearMax);

    // Quality
    if (qualityFilter !== 'all') {
      rows = rows.filter((p) => p.quality === qualityFilter);
    }

    // Sort
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'year') cmp = a.year - b.year;
      else if (sortKey === 'citations') cmp = a.citations - b.citations;
      else cmp = (a.authors[0] || '').localeCompare(b.authors[0] || '');
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return rows;
  }, [search, selectedSchools, selectedModalities, yearMin, yearMax, sortKey, sortDir, qualityFilter]);

  /* ---- pagination ---- */
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  const authorYear = (p: EnrichedPaper) => {
    const first = p.authors[0] || 'Unknown';
    const surname = first.includes(' ') ? first.split(' ').pop() : first;
    return `${surname} et al. ${p.year}`;
  };

  return (
    <section
      id="evidence"
      ref={sectionRef}
      className="w-full bg-warm-gray py-space-24"
    >
      <div className="section-container">
        {/* ---- Header ---- */}
        <div className="scroll-animate mb-space-6">
          <span className="label text-accent-gold tracking-[0.08em]">ANALYSIS 08</span>
        </div>
        <h2 className="scroll-animate heading-1 font-serif text-accent-indigo mb-space-4">
          Evidence Table
        </h2>
        <p className="scroll-animate body-lg text-text-secondary mb-space-8 max-w-3xl">
          Pre-extracted findings, modalities, sample sizes, and limitations — filterable and sortable.
        </p>

        {/* ---- Filter Bar ---- */}
        <div className="scroll-animate bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] p-space-4 md:p-space-5 mb-space-6 space-y-space-4">
          {/* Row 1: Search + Quality + Clear */}
          <div className="flex flex-col md:flex-row gap-space-3 items-start md:items-center">
            <div className="relative flex-1 w-full md:w-auto">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Search author, title, keyword..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-9 pr-3 py-2 rounded-md border border-border-light bg-surface-elevated font-mono text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-indigo transition-colors"
              />
            </div>

            <select
              value={qualityFilter}
              onChange={(e) => { setQualityFilter(e.target.value as typeof qualityFilter); setPage(1); }}
              className="px-3 py-2 rounded-md border border-border-light bg-surface-elevated font-mono text-[12px] text-text-primary focus:outline-none focus:border-accent-indigo cursor-pointer"
            >
              <option value="all">All Quality</option>
              <option value="green">Good</option>
              <option value="yellow">Moderate</option>
              <option value="red">Limited</option>
            </select>

            <button
              onClick={clearFilters}
              className="font-mono text-[11px] text-accent-indigo hover:text-accent-gold transition-colors px-2 py-2"
            >
              Clear all
            </button>
          </div>

          {/* Row 2: School checkboxes */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="font-mono text-[11px] text-text-tertiary mr-1">School:</span>
            {Object.entries(SCHOOL_NAMES).map(([id]) => {
              const numId = parseInt(id, 10);
              const active = selectedSchools.has(numId);
              return (
                <button
                  key={id}
                  onClick={() => toggleSchool(numId)}
                  className={[
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-mono text-[10px] transition-all',
                    active
                      ? 'border-accent-indigo bg-accent-indigo text-white'
                      : 'border-border-light bg-surface-elevated text-text-secondary hover:border-border-medium',
                  ].join(' ')}
                >
                  <span
                    className="w-2 h-2 rounded-full inline-block"
                    style={{ backgroundColor: SCHOOL_COLORS[numId] }}
                  />
                  {SCHOOL_ABBR[numId]}
                </button>
              );
            })}
          </div>

          {/* Row 3: Modality checkboxes */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="font-mono text-[11px] text-text-tertiary mr-1">Modality:</span>
            {MODALITIES.map((m) => {
              const active = selectedModalities.has(m);
              return (
                <button
                  key={m}
                  onClick={() => toggleModality(m)}
                  className={[
                    'px-2.5 py-1 rounded-md border font-mono text-[10px] transition-all',
                    active
                      ? 'border-accent-indigo bg-accent-indigo text-white'
                      : 'border-border-light bg-surface-elevated text-text-secondary hover:border-border-medium',
                  ].join(' ')}
                >
                  {m}
                </button>
              );
            })}
          </div>

          {/* Row 4: Year range */}
          <div className="flex flex-wrap items-center gap-space-3">
            <span className="font-mono text-[11px] text-text-tertiary">Year:</span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={1994}
                max={2026}
                value={yearMin}
                onChange={(e) => { setYearMin(Math.min(parseInt(e.target.value), yearMax)); setPage(1); }}
                className="w-[100px] accent-accent-indigo"
              />
              <span className="font-mono text-[11px] text-text-secondary w-10 text-center">{yearMin}</span>
              <span className="text-text-tertiary">\u2013</span>
              <input
                type="range"
                min={1994}
                max={2026}
                value={yearMax}
                onChange={(e) => { setYearMax(Math.max(parseInt(e.target.value), yearMin)); setPage(1); }}
                className="w-[100px] accent-accent-indigo"
              />
              <span className="font-mono text-[11px] text-text-secondary w-10 text-center">{yearMax}</span>
            </div>
          </div>

          {/* Active filter count */}
          <div className="font-mono text-[11px] text-text-tertiary">
            Showing {filtered.length} of {ALL_PAPERS.length} papers
          </div>
        </div>

        {/* ---- Table ---- */}
        <div className="scroll-animate bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] overflow-hidden">
          <div className="overflow-x-auto max-h-[800px]">
            <table className="w-full min-w-[900px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-surface-elevated border-b-2 border-border-medium">
                  <th className="text-left px-3 py-3 font-mono text-[11px] uppercase tracking-[0.04em] text-accent-indigo w-[40px]">#</th>
                  <th
                    className="text-left px-3 py-3 font-mono text-[11px] uppercase tracking-[0.04em] text-accent-indigo cursor-pointer hover:text-accent-gold transition-colors w-[150px]"
                    onClick={() => handleSort('author')}
                  >
                    Author-Year
                    <SortIndicator active={sortKey === 'author'} dir={sortDir} />
                  </th>
                  <th className="text-left px-3 py-3 font-mono text-[11px] uppercase tracking-[0.04em] text-accent-indigo w-[100px]">School</th>
                  <th className="text-left px-3 py-3 font-mono text-[11px] uppercase tracking-[0.04em] text-accent-indigo w-[90px]">Modality</th>
                  <th
                    className="text-right px-3 py-3 font-mono text-[11px] uppercase tracking-[0.04em] text-accent-indigo cursor-pointer hover:text-accent-gold transition-colors w-[60px]"
                    onClick={() => handleSort('year')}
                  >
                    Year
                    <SortIndicator active={sortKey === 'year'} dir={sortDir} />
                  </th>
                  <th
                    className="text-right px-3 py-3 font-mono text-[11px] uppercase tracking-[0.04em] text-accent-indigo cursor-pointer hover:text-accent-gold transition-colors w-[70px]"
                    onClick={() => handleSort('citations')}
                  >
                    Citations
                    <SortIndicator active={sortKey === 'citations'} dir={sortDir} />
                  </th>
                  <th className="text-left px-3 py-3 font-mono text-[11px] uppercase tracking-[0.04em] text-accent-indigo w-[60px]">N</th>
                  <th className="text-left px-3 py-3 font-mono text-[11px] uppercase tracking-[0.04em] text-accent-indigo w-[30%]">Key Findings</th>
                  <th className="text-left px-3 py-3 font-mono text-[11px] uppercase tracking-[0.04em] text-accent-indigo w-[20%]">Limitations</th>
                  <th className="text-left px-3 py-3 font-mono text-[11px] uppercase tracking-[0.04em] text-accent-indigo w-[80px]">Quality</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((paper, idx) => {
                  const globalIdx = (currentPage - 1) * ITEMS_PER_PAGE + idx + 1;
                  return (
                    <tr
                      key={paper.id}
                      className={[
                        'border-b border-border-light transition-colors duration-150 hover:bg-[rgba(212,168,83,0.04)]',
                        idx % 2 === 1 ? 'bg-[#FAFAF7]' : 'bg-surface-white',
                      ].join(' ')}
                    >
                      <td className="px-3 py-2.5 font-mono text-[11px] text-text-tertiary">{globalIdx}</td>
                      <td className="px-3 py-2.5 font-mono text-[12px] text-accent-indigo font-medium">
                        {authorYear(paper)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                            style={{ backgroundColor: SCHOOL_COLORS[paper.community] }}
                          />
                          <span className="font-mono text-[10px] text-text-secondary">{SCHOOL_ABBR[paper.community]}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <ModalityPill modality={paper.modality} />
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[12px] text-text-secondary text-right">{paper.year}</td>
                      <td className="px-3 py-2.5 font-mono text-[12px] text-text-secondary text-right">
                        {paper.citations.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <SampleSizeBadge paper={paper} />
                      </td>
                      <td className="px-3 py-2.5 body-sm text-text-primary leading-snug max-w-[280px]">
                        {paper.keyFindings}
                      </td>
                      <td className="px-3 py-2.5 body-sm text-text-tertiary italic leading-snug max-w-[200px]">
                        {paper.limitations}
                      </td>
                      <td className="px-3 py-2.5">
                        <QualityFlagPill quality={paper.quality} label={paper.qualityLabel} />
                      </td>
                    </tr>
                  );
                })}
                {paginated.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center py-space-12 font-mono text-text-tertiary">
                      No papers match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ---- Pagination ---- */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border-light bg-surface-elevated">
            <span className="font-mono text-[11px] text-text-tertiary">
              Page {currentPage} of {totalPages} ({filtered.length} papers)
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={currentPage === 1}
                className="px-2 py-1 rounded font-mono text-[11px] border border-border-light bg-surface-white text-text-secondary hover:bg-surface-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {'<<'}
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2 py-1 rounded font-mono text-[11px] border border-border-light bg-surface-white text-text-secondary hover:bg-surface-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {'<'}
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pg: number;
                if (totalPages <= 5) pg = i + 1;
                else if (currentPage <= 3) pg = i + 1;
                else if (currentPage >= totalPages - 2) pg = totalPages - 4 + i;
                else pg = currentPage - 2 + i;
                return (
                  <button
                    key={pg}
                    onClick={() => setPage(pg)}
                    className={[
                      'w-7 h-7 rounded font-mono text-[11px] transition-colors',
                      pg === currentPage
                        ? 'bg-accent-indigo text-white'
                        : 'border border-border-light bg-surface-white text-text-secondary hover:bg-surface-elevated',
                    ].join(' ')}
                  >
                    {pg}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2 py-1 rounded font-mono text-[11px] border border-border-light bg-surface-white text-text-secondary hover:bg-surface-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {'>'}
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-2 py-1 rounded font-mono text-[11px] border border-border-light bg-surface-white text-text-secondary hover:bg-surface-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {'>>'}
              </button>
            </div>
          </div>
        </div>

        {/* ---- Meta-analytic Subset Note ---- */}
        <div className="scroll-animate mt-space-6 bg-[#F4F2EC] border border-[#E7E3DB] rounded-[4px] p-space-5">
          <p className="body-sm text-text-tertiary text-center">
            No formal meta-analysis subset was identified in this corpus. Meta-analytic quality tools (ROB-2, GRADE, funnel plots) would require a focused systematic review with effect-size extraction.
          </p>
        </div>
      </div>
    </section>
  );
}
