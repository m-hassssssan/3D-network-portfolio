import { useState, useCallback } from 'react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import analysisData from '../../public/analysis_data.json';
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
}

interface CitationSuggestion {
  paper: PaperNode;
  sharedKeywords: string[];
  score: number;
  reason: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ARGUMENT_SPINE_STEPS = [
  {
    key: 'claim' as const,
    label: 'CLAIM',
    color: '#1A1B3A',
    textColor: '#FFFFFF',
    title: 'Claim',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
  {
    key: 'evidence' as const,
    label: 'EVIDENCE',
    color: '#3B6FC4',
    textColor: '#FFFFFF',
    title: 'Evidence',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
  {
    key: 'counter' as const,
    label: 'COUNTER',
    color: '#E8A820',
    textColor: '#1A1B3A',
    title: 'Counter-Evidence',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" />
      </svg>
    ),
  },
  {
    key: 'gap' as const,
    label: 'GAP',
    color: '#D94040',
    textColor: '#FFFFFF',
    title: 'Gap',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  },
  {
    key: 'significance' as const,
    label: 'SIGNIFICANCE',
    color: '#22A559',
    textColor: '#FFFFFF',
    title: 'Why It Matters',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20M2 12h20" />
      </svg>
    ),
  },
];

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

const DEFAULT_GAP_TEXT = analysisData.research_gap?.gap_statement ||
  'Despite extensive research on both structural connectivity (dMRI tractography) and individual variability in functional connectivity, there is a critical lack of integrative frameworks that link individual differences in structural topology to personalized functional network organization.';

/* ------------------------------------------------------------------ */
/*  Citation suggestion engine (graph-based, NO LLM)                  */
/* ------------------------------------------------------------------ */

function findMissingCitations(
  userRefs: string[],
  allPapers: PaperNode[]
): CitationSuggestion[] {
  if (!userRefs.length) return [];

  // Normalize user references: lowercase, trim punctuation
  const normalized = userRefs.map((r) => r.toLowerCase().replace(/[.,;]/g, '').trim()).filter(Boolean);

  // Build a set of paper IDs the user already cites
  const citedIds = new Set<string>();
  for (const norm of normalized) {
    for (const p of allPapers) {
      const matchStr = (p.title + ' ' + p.authors.join(' ') + ' ' + p.doi + ' ' + p.year).toLowerCase();
      if (matchStr.includes(norm) || norm.includes(p.id.toLowerCase())) {
        citedIds.add(p.id);
        break;
      }
      // Try matching author surname + year
      if (p.authors.length > 0) {
        const surname = (p.authors[0].split(' ').pop() || '').toLowerCase();
        if (norm.includes(surname) && norm.includes(String(p.year))) {
          citedIds.add(p.id);
          break;
        }
      }
    }
  }

  if (citedIds.size === 0) return [];

  // Get keywords from cited papers
  const citedKeywords = new Set<string>();
  const citedCommunities = new Set<number>();
  for (const cid of citedIds) {
    const paper = allPapers.find((p) => p.id === cid);
    if (paper) {
      paper.keywords.forEach((k) => citedKeywords.add(k.toLowerCase()));
      citedCommunities.add(paper.community);
    }
  }

  // Score uncited papers by shared keyword count
  const scored: CitationSuggestion[] = [];
  for (const paper of allPapers) {
    if (citedIds.has(paper.id)) continue;
    const shared = paper.keywords.filter((k) => citedKeywords.has(k.toLowerCase()));
    if (shared.length === 0) continue;

    const score = shared.length;
    let reason = `Shares ${shared.length} keyword${shared.length > 1 ? 's' : ''} with your references`;
    if (citedCommunities.has(paper.community)) {
      reason += `; same school (${SCHOOL_ABBR[paper.community] || paper.community_name})`;
    }
    if (paper.citations > 1000) {
      reason += '; highly cited';
    }

    scored.push({ paper, sharedKeywords: shared, score, reason });
  }

  // Sort by score descending, then citations
  scored.sort((a, b) => b.score - a.score || b.paper.citations - a.paper.citations);
  return scored.slice(0, 20);
}

/* ------------------------------------------------------------------ */
/*  Export helpers                                                     */
/* ------------------------------------------------------------------ */

function generateMarkdownExport(gapText: string): string {
  const spine = analysisData.argument_spine;
  const gap = analysisData.research_gap;

  let md = `# Literature Review: Connectome Network\n\n`;
  md += `> **Note:** This document was auto-generated by Connectome Network.\n\n`;

  md += `## Research Gap Summary\n\n${gapText}\n\n`;

  md += `## Argument Spine\n\n`;
  md += `### Claim\n${spine.claim}\n\n`;
  md += `### Evidence\n${spine.evidence_for.map((e: string) => `- ${e}`).join('\n')}\n\n`;
  md += `### Counter-Evidence\n${spine.counter_evidence.map((e: string) => `- ${e}`).join('\n')}\n\n`;
  md += `### The Gap\n${spine.the_gap}\n\n`;
  md += `### Why It Matters\n${spine.significance}\n\n`;

  if (gap.why_it_matters) {
    md += `## Why It Matters (Extended)\n\n${gap.why_it_matters}\n\n`;
  }
  if (gap.proposed_direction) {
    md += `## Proposed Direction\n\n${gap.proposed_direction}\n\n`;
  }

  // Add bibliography
  const papers = networkData.nodes as PaperNode[];
  md += `## Bibliography (${papers.length} papers)\n\n`;
  papers.sort((a, b) => (b.citations || 0) - (a.citations || 0));
  papers.forEach((p, i) => {
    const authors = p.authors.join(', ');
    md += `${i + 1}. ${authors} (${p.year}). ${p.title}. *${p.journal}*.`;
    if (p.doi) md += ` https://doi.org/${p.doi}`;
    md += `\n`;
  });

  return md;
}

function generateDocxHtml(gapText: string): string {
  const spine = analysisData.argument_spine;
  const gap = analysisData.research_gap;

  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  let html = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>Literature Review</title></head>
<body style="font-family:Georgia,serif;font-size:11pt;line-height:1.6;color:#1A1B3A;">
<h1 style="font-size:18pt;color:#1A1B3A;">Literature Review: Connectome Network</h1>
<p style="font-size:10pt;color:#5A5C7A;font-style:italic;">Auto-generated document.</p>

<h2 style="font-size:14pt;color:#1A1B3A;margin-top:24pt;">Research Gap Summary</h2>
<p>${escapeHtml(gapText)}</p>

<h2 style="font-size:14pt;color:#1A1B3A;margin-top:24pt;">Argument Spine</h2>

<h3 style="font-size:12pt;color:#3B6FC4;">Claim</h3>
<p>${escapeHtml(spine.claim)}</p>

<h3 style="font-size:12pt;color:#22A559;">Evidence</h3>
<ul>
${spine.evidence_for.map((e: string) => `<li>${escapeHtml(e)}</li>`).join('\n')}
</ul>

<h3 style="font-size:12pt;color:#E8A820;">Counter-Evidence</h3>
<ul>
${spine.counter_evidence.map((e: string) => `<li>${escapeHtml(e)}</li>`).join('\n')}
</ul>

<h3 style="font-size:12pt;color:#D94040;">The Gap</h3>
<p>${escapeHtml(spine.the_gap)}</p>

<h3 style="font-size:12pt;color:#22A559;">Why It Matters</h3>
<p>${escapeHtml(spine.significance)}</p>
`;

  if (gap.why_it_matters) {
    html += `\n<h2 style="font-size:14pt;color:#1A1B3A;margin-top:24pt;">Why It Matters (Extended)</h2>\n<p>${escapeHtml(gap.why_it_matters)}</p>\n`;
  }
  if (gap.proposed_direction) {
    html += `\n<h2 style="font-size:14pt;color:#1A1B3A;margin-top:24pt;">Proposed Direction</h2>\n<p>${escapeHtml(gap.proposed_direction)}</p>\n`;
  }

  // Bibliography
  const papers = networkData.nodes as PaperNode[];
  html += `\n<h2 style="font-size:14pt;color:#1A1B3A;margin-top:24pt;">Bibliography (${papers.length} papers)</h2>\n`;
  papers.sort((a, b) => (b.citations || 0) - (a.citations || 0));
  html += '<div style="font-size:10pt;">\n';
  papers.forEach((p, i) => {
    const authors = escapeHtml(p.authors.join(', '));
    html += `<p style="margin-bottom:6pt;text-indent:-24pt;margin-left:24pt;">${i + 1}. ${authors} (${p.year}). ${escapeHtml(p.title)}. <em>${escapeHtml(p.journal)}</em>.${p.doi ? ` https://doi.org/${escapeHtml(p.doi)}` : ''}</p>\n`;
  });
  html += '</div>\n';

  html += '</body></html>';
  return html;
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function WritingSection() {
  const sectionRef = useScrollAnimation<HTMLElement>();
  const [gapText, setGapText] = useState(() => {
    return localStorage.getItem('cc_gap_paragraph') || DEFAULT_GAP_TEXT;
  });
  const [copied, setCopied] = useState(false);

  // Argument spine
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const toggleStep = (key: string) => setExpandedStep((prev) => (prev === key ? null : key));

  // Citation suggestions
  const [userRefs, setUserRefs] = useState('');
  const [suggestions, setSuggestions] = useState<CitationSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const papers = networkData.nodes as PaperNode[];

  // Persist gap text to localStorage
  const handleGapChange = (val: string) => {
    setGapText(val);
    localStorage.setItem('cc_gap_paragraph', val);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(gapText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = gapText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleFindCitations = useCallback(() => {
    setSuggestionsLoading(true);
    // Small delay to show loading state
    setTimeout(() => {
      const refs = userRefs.split('\n').map((r) => r.trim()).filter(Boolean);
      const results = findMissingCitations(refs, papers);
      setSuggestions(results);
      setSuggestionsLoading(false);
    }, 100);
  }, [userRefs, papers]);

  const handleExportMd = () => {
    const md = generateMarkdownExport(gapText);
    downloadFile(md, 'literature_review.md', 'text/markdown');
  };

  const handleExportDocx = () => {
    const html = generateDocxHtml(gapText);
    downloadFile(html, 'literature_review.doc', 'application/msword');
  };

  // Map spine data to steps
  const spineData = analysisData.argument_spine;
  const stepContent: Record<string, { body: string; bullets: string[] }> = {
    claim: { body: spineData.claim, bullets: [] },
    evidence: { body: 'The following studies provide supporting evidence:', bullets: spineData.evidence_for },
    counter: { body: 'Limitations and contradictory findings:', bullets: spineData.counter_evidence },
    gap: { body: spineData.the_gap, bullets: [] },
    significance: { body: spineData.significance, bullets: [] },
  };

  return (
    <section
      id="writing"
      ref={sectionRef}
      className="w-full bg-off-white py-space-24"
    >
      <div className="section-container">
        {/* ---- Header ---- */}
        <div className="scroll-animate mb-space-6">
          <span className="label text-accent-gold tracking-[0.08em]">WRITING TOOLS</span>
        </div>
        <h2 className="scroll-animate heading-1 font-serif text-accent-indigo mb-space-4">
          Writing Assistant
        </h2>
        <p className="scroll-animate body-lg text-text-secondary mb-space-12 max-w-3xl">
          Pre-computed analysis to support your writing &mdash; no LLM required at runtime.
        </p>

        {/* ---- A. Gap Paragraph ---- */}
        <div className="scroll-animate mb-space-12">
          <div className="bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] overflow-hidden">
            <div className="border-l-4 border-accent-gold p-space-6 md:p-space-8">
              <div className="flex items-center justify-between mb-space-4">
                <h3 className="heading-3 font-serif text-accent-indigo">Research Gap Summary</h3>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border-light bg-surface-elevated font-mono text-[11px] text-text-secondary hover:border-accent-indigo hover:text-accent-indigo transition-colors"
                >
                  {copied ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22A559" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      <span className="text-success">Copied!</span>
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                      </svg>
                      Copy
                    </>
                  )}
                </button>
              </div>
              <textarea
                value={gapText}
                onChange={(e) => handleGapChange(e.target.value)}
                className="w-full min-h-[180px] p-space-4 rounded-md border border-border-light bg-surface-elevated font-serif text-[15px] text-text-primary leading-relaxed resize-y focus:outline-none focus:border-accent-indigo transition-colors"
              />
              <p className="mt-space-2 font-mono text-[10px] text-text-tertiary">
                Editable. Changes persist to localStorage. You can modify this text for your review.
              </p>
            </div>
          </div>
        </div>

        {/* ---- B. Argument Spine Expansion ---- */}
        <div className="scroll-animate mb-space-12">
          <h3 className="heading-3 font-serif text-accent-indigo mb-space-4">Argument Spine</h3>

          {/* Flow diagram */}
          <div className="flex flex-col md:flex-row items-stretch gap-0 mb-space-6">
            {ARGUMENT_SPINE_STEPS.map((step, i) => (
              <div key={step.key} className="flex flex-col md:flex-row items-center flex-1">
                {/* Card */}
                <button
                  onClick={() => toggleStep(step.key)}
                  className="w-full md:flex-1 flex items-center justify-center gap-2 px-4 py-4 rounded-[4px] font-mono text-[12px] font-semibold uppercase tracking-[0.06em] transition-all duration-200"
                  style={{ backgroundColor: step.color, color: step.textColor }}
                >
                  {step.icon}
                  {step.label}
                </button>
                {/* Arrow between cards */}
                {i < ARGUMENT_SPINE_STEPS.length - 1 && (
                  <div className="flex items-center justify-center py-1 md:py-0 md:px-1">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#D4A853"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="rotate-90 md:rotate-0"
                    >
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Expandable content */}
          <div className="space-y-space-3">
            {ARGUMENT_SPINE_STEPS.map((step) => {
              const isOpen = expandedStep === step.key;
              const content = stepContent[step.key];
              if (!content) return null;
              return (
                <div
                  key={step.key}
                  className="bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] overflow-hidden transition-all duration-300"
                >
                  <button
                    onClick={() => toggleStep(step.key)}
                    className="w-full flex items-center justify-between px-space-5 py-space-3 hover:bg-surface-elevated transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="w-8 h-8 rounded-md flex items-center justify-center"
                        style={{ backgroundColor: step.color, color: step.textColor }}
                      >
                        {step.icon}
                      </span>
                      <span className="heading-4 font-serif text-accent-indigo">{step.title}</span>
                    </div>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`text-text-tertiary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="px-space-5 pb-space-4 pt-space-1 border-t border-border-light">
                      <p className="body text-text-primary leading-relaxed mb-space-3">{content.body}</p>
                      {content.bullets.length > 0 && (
                        <ul className="space-y-2">
                          {content.bullets.map((item, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-accent-gold mt-1.5 shrink-0">
                                <svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor">
                                  <circle cx="3" cy="3" r="3" />
                                </svg>
                              </span>
                              <span className="body-sm text-text-secondary">{item}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ---- C. Papers You Should Cite ---- */}
        <div className="scroll-animate mb-space-12">
          <h3 className="heading-3 font-serif text-accent-indigo mb-space-4">
            Papers You Should Cite
          </h3>
          <div className="bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] p-space-5 md:p-space-6 space-y-space-4">
            {/* Input area */}
            <div>
              <label className="block font-mono text-[11px] uppercase tracking-[0.04em] text-text-tertiary mb-space-2">
                Paste your reference list (one per line)
              </label>
              <textarea
                value={userRefs}
                onChange={(e) => setUserRefs(e.target.value)}
                placeholder={"e.g.,\nSporns 2005\nBullmore 2009\nFinn et al. 2015\n10.1016/j.neuroimage.2010.01.001"}
                className="w-full min-h-[120px] p-space-3 rounded-md border border-border-light bg-surface-elevated font-mono text-[12px] text-text-primary placeholder:text-text-tertiary resize-y focus:outline-none focus:border-accent-indigo transition-colors"
              />
              <div className="flex items-center justify-between mt-space-2">
                <p className="font-mono text-[10px] text-text-tertiary">
                  Uses keyword matching and community analysis &mdash; no LLM calls.
                </p>
                <button
                  onClick={handleFindCitations}
                  disabled={!userRefs.trim() || suggestionsLoading}
                  className="px-4 py-2 rounded-md bg-accent-indigo text-white font-mono text-[12px] font-medium hover:bg-accent-indigo-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {suggestionsLoading ? 'Analyzing...' : 'Find Missing Citations'}
                </button>
              </div>
            </div>

            {/* Results */}
            {suggestions.length > 0 && (
              <div className="border-t border-border-light pt-space-4">
                <p className="font-mono text-[11px] text-text-secondary mb-space-3">
                  Found {suggestions.length} paper{suggestions.length > 1 ? 's' : ''} you may want to cite:
                </p>
                <div className="space-y-space-2 max-h-[400px] overflow-y-auto">
                  {suggestions.map((s, i) => {
                    const firstAuthor = s.paper.authors[0] || 'Unknown';
                    const surname = firstAuthor.includes(' ') ? firstAuthor.split(' ').pop() : firstAuthor;
                    return (
                      <div
                        key={s.paper.id}
                        className="flex items-start gap-3 p-space-3 rounded-[4px] border border-[#E7E3DB] hover:bg-[rgba(212,168,83,0.04)] transition-colors"
                      >
                        <span className="font-mono text-[11px] text-text-tertiary w-6 shrink-0 text-right">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[12px] font-medium text-accent-indigo">
                              {surname} et al. {s.paper.year}
                            </span>
                            <span
                              className="font-mono text-[9px] px-1.5 py-0.5 rounded border"
                              style={{
                                backgroundColor: `${SCHOOL_COLORS[s.paper.community]}18`,
                                borderColor: `${SCHOOL_COLORS[s.paper.community]}40`,
                                color: SCHOOL_COLORS[s.paper.community],
                              }}
                            >
                              {SCHOOL_ABBR[s.paper.community]}
                            </span>
                          </div>
                          <p className="body-sm text-text-secondary truncate mt-0.5">{s.paper.title}</p>
                          <p className="font-mono text-[10px] text-text-tertiary mt-0.5">
                            {s.reason} &middot; {s.paper.citations.toLocaleString()} citations
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {s.sharedKeywords.slice(0, 5).map((k) => (
                              <span key={k} className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-accent-gold-light text-accent-indigo">
                                {k}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {suggestions.length === 0 && userRefs.trim() && !suggestionsLoading && (
              <div className="border-t border-border-light pt-space-4">
                <p className="body-sm text-text-tertiary text-center">
                  No matching papers found in the corpus. Try adding author surnames or years.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ---- D. Export Options ---- */}
        <div className="scroll-animate">
          <h3 className="heading-3 font-serif text-accent-indigo mb-space-4">Export Options</h3>
          <div className="bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] p-space-6">
            <p className="body-sm text-text-secondary mb-space-5">
              Download a complete literature review document including the gap paragraph, argument spine, and full bibliography of 244 papers.
            </p>
            <div className="flex flex-wrap gap-space-4">
              <button
                onClick={handleExportDocx}
                className="flex items-center gap-2 px-5 py-3 rounded-lg border border-accent-indigo bg-accent-indigo text-white font-mono text-[13px] font-medium hover:bg-accent-indigo-light transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                Export as .docx
              </button>
              <button
                onClick={handleExportMd}
                className="flex items-center gap-2 px-5 py-3 rounded-lg border border-border-light bg-surface-elevated font-mono text-[13px] font-medium text-accent-indigo hover:border-accent-indigo transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <path d="M9 15l2 2 4-4" />
                </svg>
                Export as Markdown
              </button>
            </div>
            <p className="font-mono text-[10px] text-text-tertiary mt-space-4">
              .docx export generates Word-compatible HTML. Markdown includes APA-formatted references for all 244 papers.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
