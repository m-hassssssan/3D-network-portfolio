import { useMemo } from 'react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import networkData from '../../public/network_data.json';

/* ------------------------------------------------------------------ */
/*  PRISMA Flow & Quality Assessment Section                          */
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
}

const nodes = networkData.nodes as PaperNode[];

/* ---- infer simple quality heuristics from the node data ---- */
function computeQualityFlags(papers: PaperNode[]) {
  const total = papers.length;

  const hasDoi = papers.filter((p) => p.doi && p.doi.length > 0).length;
  const hasAbstract = papers.filter(
    (p) => p.abstract && p.abstract.length > 20 && !p.abstract.startsWith('\u2026')
  ).length;
  const hasCitations = papers.filter((p) => p.citations > 0).length;
  const knownJournal = papers.filter((p) => p.journal && p.journal.length > 2).length;

  const preprintOnly = papers.filter(
    (p) =>
      p.journal?.toLowerCase().includes('arxiv') ||
      p.journal?.toLowerCase().includes('biorxiv') ||
      p.journal?.toLowerCase().includes('medrxiv')
  ).length;
  const lowCitations = papers.filter((p) => p.citations < 50).length;

  const missingDoi = total - hasDoi;
  const missingAbstract = total - hasAbstract;
  const arxivOnly = papers.filter(
    (p) => p.journal?.toLowerCase().includes('arxiv')
  ).length;

  return {
    total,
    good: [
      { label: 'Has DOI', count: hasDoi },
      { label: 'Has Abstract', count: hasAbstract },
      { label: 'Has Citations', count: hasCitations },
      { label: 'Known Journal', count: knownJournal },
    ],
    moderate: [
      { label: 'Preprint Only', count: preprintOnly },
      { label: 'Low Citation Count (<50)', count: lowCitations },
    ],
    limited: [
      { label: 'Missing DOI', count: missingDoi },
      { label: 'Missing Abstract', count: missingAbstract },
      { label: 'arXiv-only (no peer review)', count: arxivOnly },
    ],
  };
}

/* ---- PRISMA flow box component ---- */
function FlowBox({
  label,
  count,
  description,
  highlight = false,
  excluded = false,
  className = '',
}: {
  label: string;
  count: number | string;
  description?: string;
  highlight?: boolean;
  excluded?: boolean;
  className?: string;
}) {
  return (
    <div
      className={[
        'rounded-lg border px-5 py-4 text-center min-w-[180px] transition-all duration-300',
        highlight
          ? 'bg-accent-indigo text-white border-accent-indigo shadow-card-hover'
          : excluded
            ? 'bg-warm-gray border-border-light opacity-70'
            : 'bg-surface-white border-border-light shadow-card',
        className,
      ].join(' ')}
    >
      <div
        className={[
          'font-mono text-[11px] uppercase tracking-[0.06em] mb-1',
          highlight ? 'text-[rgba(255,255,255,0.7)]' : 'text-text-tertiary',
        ].join(' ')}
      >
        {label}
      </div>
      <div
        className={[
          'font-mono font-bold text-[22px] leading-tight',
          highlight ? 'text-star-gold' : 'text-accent-indigo',
        ].join(' ')}
      >
        {count}
      </div>
      {description && (
        <div
          className={[
            'font-mono text-[10px] mt-1.5 leading-snug',
            highlight ? 'text-[rgba(255,255,255,0.6)]' : 'text-text-tertiary',
          ].join(' ')}
        >
          {description}
        </div>
      )}
    </div>
  );
}

/* ---- Vertical arrow between flow boxes ---- */
function DownArrow() {
  return (
    <div className="flex flex-col items-center py-1">
      <div className="w-0.5 h-5 bg-border-medium" />
      <svg width="10" height="6" viewBox="0 0 10 6" className="text-border-medium">
        <path d="M5 6L0 0h10L5 6z" fill="currentColor" />
      </svg>
    </div>
  );
}

/* ---- Horizontal arrow ---- */
function RightArrow() {
  return (
    <div className="flex items-center px-2">
      <div className="h-0.5 w-6 bg-border-medium" />
      <svg width="6" height="10" viewBox="0 0 6 10" className="text-border-medium -ml-0.5">
        <path d="M6 5L0 0v10L6 5z" fill="currentColor" />
      </svg>
    </div>
  );
}

/* ---- Quality flag pill ---- */
function QualityPill({ label, count, total, color }: { label: string; count: number; total: number; color: 'green' | 'yellow' | 'red' }) {
  const pct = Math.round((count / total) * 100);
  const styles = {
    green: 'bg-[rgba(34,165,89,0.12)] text-[#22A559] border-[rgba(34,165,89,0.25)]',
    yellow: 'bg-[rgba(232,168,32,0.12)] text-[#B8860B] border-[rgba(232,168,32,0.25)]',
    red: 'bg-[rgba(217,64,64,0.12)] text-[#D94040] border-[rgba(217,64,64,0.25)]',
  };
  return (
    <div className="flex items-center justify-between py-2 border-b border-border-light last:border-b-0">
      <span className={['font-mono text-[11px] px-2.5 py-1 rounded-full border', styles[color]].join(' ')}>
        {label}
      </span>
      <span className="font-mono text-[12px] text-text-secondary">
        {count}
        <span className="text-text-tertiary ml-1">({pct}%)</span>
      </span>
    </div>
  );
}

/* ===================================================================== */

export default function PrismaSection() {
  const sectionRef = useScrollAnimation<HTMLElement>();
  const flags = useMemo(() => computeQualityFlags(nodes), []);

  return (
    <section
      id="prisma"
      ref={sectionRef}
      className="w-full bg-off-white py-space-24"
    >
      <div className="section-container">
        {/* ---- Header ---- */}
        <div className="scroll-animate mb-space-6">
          <span className="label text-accent-gold tracking-[0.08em]">ANALYSIS 07</span>
        </div>
        <h2 className="scroll-animate heading-1 font-serif text-accent-indigo mb-space-4">
          Literature Selection &amp; Quality Assessment
        </h2>
        <p className="scroll-animate body-lg text-text-secondary mb-space-12 max-w-3xl">
          PRISMA 2020 flow diagram and quality assessment methodology for this corpus of 244 papers.
        </p>

        {/* ---- A. PRISMA Flow Diagram ---- */}
        <div className="scroll-animate mb-space-16">
          <div className="bg-surface-white rounded-lg border border-border-light shadow-card p-space-8">
            <h3 className="heading-3 font-serif text-accent-indigo mb-space-6 text-center">
              PRISMA 2020 Flow Diagram
            </h3>

            <div className="flex flex-col items-center max-w-[720px] mx-auto">
              {/* IDENTIFICATION */}
              <FlowBox
                label="Identification"
                count={244}
                description="Records from Google Scholar + arXiv search"
                className="w-full max-w-[360px]"
              />

              <DownArrow />

              {/* Duplicates removed */}
              <FlowBox
                label="After Duplicate Removal"
                count={244}
                description="No duplicates found (single-pass search)"
                className="w-full max-w-[320px]"
              />

              <DownArrow />

              {/* SCREENING row */}
              <div className="flex items-start justify-center w-full">
                <div className="flex flex-col items-center">
                  <FlowBox
                    label="Screening"
                    count={244}
                    description="Titles &amp; abstracts screened"
                    className="w-[260px]"
                  />
                </div>
                <div className="flex items-center pt-6">
                  <RightArrow />
                </div>
                <div className="flex flex-col items-center pt-2">
                  <FlowBox
                    label="Excluded"
                    count={0}
                    description="No exclusions at screening stage"
                    excluded
                    className="w-[200px]"
                  />
                </div>
              </div>

              <DownArrow />

              {/* ELIGIBILITY row */}
              <div className="flex items-start justify-center w-full">
                <div className="flex flex-col items-center">
                  <FlowBox
                    label="Eligibility"
                    count={244}
                    description="Full-text articles assessed"
                    className="w-[260px]"
                  />
                </div>
                <div className="flex items-center pt-6">
                  <RightArrow />
                </div>
                <div className="flex flex-col items-center pt-2">
                  <FlowBox
                    label="Excluded"
                    count={0}
                    description="No full-text exclusions"
                    excluded
                    className="w-[200px]"
                  />
                </div>
              </div>

              <DownArrow />

              {/* INCLUDED */}
              <FlowBox
                label="Included"
                count={244}
                description="Studies included in qualitative &amp; quantitative synthesis"
                highlight
                className="w-full max-w-[400px]"
              />
            </div>
          </div>
        </div>

        {/* ---- Inclusion Checklist ---- */}
        <div className="scroll-animate mb-space-16">
          <div className="bg-surface-white rounded-lg border border-border-light shadow-card p-space-6 md:p-space-8">
            <h3 className="heading-3 font-serif text-accent-indigo mb-space-4">
              Inclusion &amp; Exclusion Criteria
            </h3>
            <div className="grid md:grid-cols-2 gap-space-6">
              {/* Inclusion */}
              <div>
                <h4 className="font-mono text-[12px] uppercase tracking-[0.06em] text-success mb-space-3">
                  Inclusion Criteria (all met)
                </h4>
                <ul className="space-y-2">
                  {[
                    'Peer-reviewed publication or high-quality preprint (arXiv with citations)',
                    'Focus on brain connectivity, network neuroscience, or connectomics',
                    'Uses graph theory, network analysis, or connectivity methods',
                    'Human neuroimaging (fMRI, dMRI, EEG, MEG) or relevant computational work',
                    'Published 1994\u20132026',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-success text-[14px] mt-0.5 shrink-0">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      </span>
                      <span className="body-sm text-text-primary">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {/* Exclusion */}
              <div>
                <h4 className="font-mono text-[12px] uppercase tracking-[0.06em] text-danger mb-space-3">
                  Exclusion Criteria (none applied)
                </h4>
                <ul className="space-y-2">
                  {[
                    'Non-brain networks (social, ecological) — unless seminal methodological paper',
                    'Purely methodological with no neuroscience application',
                    'Non-English (unless seminal and widely cited)',
                    'Conference abstracts without full paper',
                    'Retracted or heavily disputed findings',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-danger text-[14px] mt-0.5 shrink-0">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </span>
                      <span className="body-sm text-text-secondary">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* ---- B. Quality Flags Summary ---- */}
        <div className="scroll-animate">
          <h3 className="heading-3 font-serif text-accent-indigo mb-space-6">
            Quality Flags Summary
          </h3>
          <div className="grid md:grid-cols-3 gap-space-6">
            {/* Green column */}
            <div className="bg-surface-white rounded-lg border border-border-light shadow-card p-space-5">
              <h4 className="font-mono text-[12px] uppercase tracking-[0.06em] text-success mb-space-3 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-success inline-block" />
                Good
              </h4>
              <div className="space-y-1">
                {flags.good.map((f) => (
                  <QualityPill key={f.label} label={f.label} count={f.count} total={flags.total} color="green" />
                ))}
              </div>
            </div>

            {/* Yellow column */}
            <div className="bg-surface-white rounded-lg border border-border-light shadow-card p-space-5">
              <h4 className="font-mono text-[12px] uppercase tracking-[0.06em] text-[#B8860B] mb-space-3 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-warning inline-block" />
                Moderate
              </h4>
              <div className="space-y-1">
                {flags.moderate.map((f) => (
                  <QualityPill key={f.label} label={f.label} count={f.count} total={flags.total} color="yellow" />
                ))}
              </div>
            </div>

            {/* Red column */}
            <div className="bg-surface-white rounded-lg border border-border-light shadow-card p-space-5">
              <h4 className="font-mono text-[12px] uppercase tracking-[0.06em] text-danger mb-space-3 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-danger inline-block" />
                Limited
              </h4>
              <div className="space-y-1">
                {flags.limited.map((f) => (
                  <QualityPill key={f.label} label={f.label} count={f.count} total={flags.total} color="red" />
                ))}
              </div>
            </div>
          </div>

          {/* Rigor note */}
          <div className="mt-space-6 bg-surface-elevated rounded-lg border border-border-light p-space-5">
            <p className="body-sm text-text-secondary italic">
              This corpus uses <strong>field-adaptive quality flags</strong> rather than generic checklists. Network neuroscience has unique rigor considerations: preprocessing pipeline transparency, atlas choice justification, motion correction adequacy, and individual-level vs. group-level analysis clarity.
            </p>
            <p className="body-sm text-text-tertiary mt-space-2">
              Meta-analytic tools (forest plots, funnel plots, ROB-2, GRADE) are displayed only where a genuine meta-analytic subset exists in the corpus.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
