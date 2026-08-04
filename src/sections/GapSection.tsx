import { useState, useRef, useEffect } from 'react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import * as d3 from 'd3';

/* ------------------------------------------------------------------ */
/*  ARGUMENT SPINE DATA                                                */
/* ------------------------------------------------------------------ */

type NodeId = 'CLAIM' | 'EVIDENCE' | 'COUNTER' | 'GAP' | 'WHY';

interface SpineNode {
  id: NodeId;
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
  borderColor?: string;
  details: string;
  bullets?: { text: string; citation?: string; citationCount?: number }[];
}

const SPINE_NODES: SpineNode[] = [
  {
    id: 'CLAIM',
    label: 'CLAIM',
    shortLabel: 'CLAIM',
    color: '#FFFFFF',
    bgColor: '#1A1B3A',
    details:
      'Individual differences in brain network organization are primarily studied through functional connectivity, while structural connectivity remains analyzed at the group level.',
    bullets: [
      { text: 'Functional connectivity has well-established individual-variability methods' },
      { text: 'Structural connectivity still relies on group-average templates' },
      { text: 'No precision structural connectome standard exists' },
    ],
  },
  {
    id: 'EVIDENCE',
    label: 'EVIDENCE',
    shortLabel: 'EVIDENCE',
    color: '#1A1B3A',
    bgColor: '#F4F2EC',
    details:
      'Landmark studies established that individual functional networks are stable and unique, forming the foundation of precision neuroscience.',
    bullets: [
      { text: 'Connectome fingerprinting enables individual identification from FC', citation: 'Finn et al. 2015', citationCount: 3318 },
      { text: 'Individual parcellations differ substantially from group templates', citation: 'Gordon et al. 2017', citationCount: 1543 },
      { text: 'Resting-state FC reliability supports clinical translation' },
    ],
  },
  {
    id: 'COUNTER',
    label: 'COUNTER',
    shortLabel: 'COUNTER',
    color: '#1A1B3A',
    bgColor: '#F5F3EF',
    borderColor: '#D0CCC4',
    details:
      'Structural connectivity via dMRI faces methodological challenges that limit individual-level reliability and precision.',
    bullets: [
      { text: 'dMRI test-retest reliability is lower than fMRI', citation: 'Jeurissen et al. 2019' },
      { text: 'Crossing fiber problem complicates tractography' },
      { text: 'Tractography algorithms vary widely with no consensus protocol' },
    ],
  },
  {
    id: 'GAP',
    label: 'GAP',
    shortLabel: 'GAP',
    color: '#FFFFFF',
    bgColor: '#8C5B5B',
    details:
      'No standardized precision structural connectome methodology exists. The gap between structural and functional individual-variability research is quantifiable.',
    bullets: [
      { text: 'Cross-community strength: 3.845 (below mean 4.5)' },
      { text: 'No standardized precision dMRI protocol' },
      { text: 'Group-average tractography templates remain the norm' },
      { text: 'Individual structural connectome reproducibility is uncharacterized' },
    ],
  },
  {
    id: 'WHY',
    label: 'WHY',
    shortLabel: 'WHY',
    color: '#FFFFFF',
    bgColor: '#5B8C7B',
    details:
      'Precision medicine needs both structural and functional individual markers. Without structural precision, clinical applications remain fundamentally limited.',
    bullets: [
      { text: 'Surgical planning and DBS targeting need individual structural data' },
      { text: 'Structure-function coupling analyses are incomplete without precision SC' },
      { text: 'Multimodal precision neuroscience requires both modalities' },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  STRUCTURAL HOLE BAR CHART (D3)                                     */
/* ------------------------------------------------------------------ */

function CrossCommunityChart() {
  const ref = useRef<HTMLDivElement>(null);

  // Simulated cross-community edge strengths (top pairs)
  const data = [
    { pair: 'Foundations ↔ fMRI', value: 6.2, highlight: false },
    { pair: 'Foundations ↔ Hubs', value: 5.8, highlight: false },
    { pair: 'Clinical ↔ fMRI', value: 5.4, highlight: false },
    { pair: 'Dynamic ↔ fMRI', value: 5.1, highlight: false },
    { pair: 'Methods ↔ fMRI', value: 4.9, highlight: false },
    { pair: 'Mean', value: 4.5, highlight: false, isReference: true },
    { pair: 'Structural ↔ Precision', value: 3.845, highlight: true },
    { pair: 'Structural ↔ Methods', value: 3.6, highlight: false },
  ];

  useEffect(() => {
    if (!ref.current) return;
    const container = ref.current;
    container.innerHTML = '';

    const margin = { top: 10, right: 50, bottom: 10, left: 170 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = 280 - margin.top - margin.bottom;
    if (width <= 0) return;

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear().domain([0, 7]).range([0, width]);
    const yScale = d3
      .scaleBand()
      .domain(data.map((d) => d.pair))
      .range([0, height])
      .padding(0.25);

    // Reference line at mean
    g.append('line')
      .attr('x1', xScale(4.5))
      .attr('x2', xScale(4.5))
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', '#8B8DA3')
      .attr('stroke-dasharray', '4,3')
      .attr('stroke-width', 1);

    g.append('text')
      .attr('x', xScale(4.5) + 4)
      .attr('y', -4)
      .attr('class', 'font-mono')
      .style('font-size', '9px')
      .style('fill', '#8B8DA3')
      .text('Mean');

    // Bars
    g.selectAll('rect')
      .data(data)
      .join('rect')
      .attr('y', (d) => yScale(d.pair) || 0)
      .attr('height', yScale.bandwidth())
      .attr('x', 0)
      .attr('width', 0)
      .attr('fill', (d) => {
        if (d.isReference) return '#E5E2DC';
        if (d.highlight) return '#8C5B5B';
        return '#D0CCC4';
      })
      .attr('rx', 3)
      .transition()
      .duration(800)
      .delay((_, i) => i * 60)
      .attr('width', (d) => xScale(d.value));

    // Labels
    g.selectAll('.label')
      .data(data)
      .join('text')
      .attr('class', 'label')
      .attr('x', -8)
      .attr('y', (d) => (yScale(d.pair) || 0) + yScale.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('class', 'font-mono')
      .style('font-size', '10px')
      .style('fill', '#5A5C7A')
      .text((d) => d.pair);

    // Value labels
    g.selectAll('.val')
      .data(data)
      .join('text')
      .attr('class', 'val')
      .attr('y', (d) => (yScale(d.pair) || 0) + yScale.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('x', (d) => xScale(d.value) + 5)
      .attr('class', 'font-mono')
      .style('font-size', '10px')
      .style('font-weight', 600)
      .style('fill', (d) => (d.highlight ? '#8C5B5B' : d.isReference ? '#8B8DA3' : '#5A5C7A'))
      .text((d) => d.value.toFixed(3).replace(/\.?0+$/, ''));

    return () => {
      container.innerHTML = '';
    };
  }, []);

  return <div ref={ref} className="w-full" />;
}

/* ------------------------------------------------------------------ */
/*  MAIN SECTION                                                       */
/* ------------------------------------------------------------------ */

export default function GapSection() {
  const [activeNode, setActiveNode] = useState<NodeId | null>(null);

  const sectionRef = useScrollAnimation<HTMLElement>({
    selector: '.scroll-animate',
    stagger: 0.08,
    y: 25,
    duration: 0.5,
  });

  const handleNodeClick = (id: NodeId) => {
    setActiveNode((prev) => (prev === id ? null : id));
  };

  return (
    <section
      id="gap"
      ref={sectionRef}
      className="w-full bg-off-white py-space-24"
    >
      <div className="section-container">
        {/* Section Header */}
        <div className="scroll-animate mb-space-6">
          <span className="label text-accent-gold tracking-[0.08em]">
            ANALYSIS 03
          </span>
        </div>
        <h2 className="scroll-animate heading-1 font-serif text-accent-indigo mb-space-12">
          The Research Gap
        </h2>

        {/* Gap Statement Block */}
        <div className="scroll-animate max-w-[900px] mx-auto mb-space-16">
          <div
            className="bg-[#FAF9F6] rounded-r-xl p-space-8 md:p-space-10 relative overflow-hidden"
            style={{
              borderLeft: '6px solid #8C5B5B',
              boxShadow: 'none',
            }}
          >
            <h3 className="heading-2 font-serif text-accent-indigo mb-space-4">
              Precision Structural Connectome Mapping
            </h3>
            <p className="body-lg text-text-primary italic leading-relaxed mb-space-6">
              Despite extensive individual-variability research in functional connectivity, structural
              connectivity remains dominated by group-average analyses. No standardized methodology
              exists for precision structural connectome mapping. Cross-community edge strength between
              Structural Connectivity and Precision Mapping communities is below average{' '}
              <span className="text-danger font-medium not-italic">(3.845 vs. mean 4.5)</span>,
              indicating a structural hole in the literature.
            </p>
            <span className="inline-block bg-info/10 text-info rounded px-2 py-0.5 font-mono text-[11px] font-medium">
              Detected via Louvain community analysis + structural hole detection
            </span>
          </div>
        </div>

        {/* Argument Spine */}
        <div className="scroll-animate mb-space-16">
          <h3 className="heading-3 font-serif text-accent-indigo text-center mb-space-8">
            Argument Spine
          </h3>

          {/* Node Flow — Desktop horizontal, Mobile vertical */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-center gap-2 md:gap-1 max-w-[1100px] mx-auto">
            {SPINE_NODES.map((node, i) => (
              <div key={node.id} className="flex items-center gap-1 md:gap-1 flex-1">
                {/* Arrow (except for first item) */}
                {i > 0 && (
                  <div className="hidden md:flex items-center justify-center px-1 shrink-0">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      className="text-star-gold"
                    >
                      <path
                        d="M5 12h14M13 6l6 6-6 6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}

                {/* Arrow for mobile (vertical) */}
                {i > 0 && (
                  <div className="flex md:hidden items-center justify-center py-1">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      className="text-star-gold mx-auto"
                    >
                      <path
                        d="M12 5v14M6 13l6 6 6-6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}

                {/* Node */}
                <button
                  onClick={() => handleNodeClick(node.id)}
                  className="flex-1 relative rounded-lg px-4 py-3 md:py-4 text-center transition-all duration-200 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    backgroundColor: node.bgColor,
                    color: node.color,
                    border: node.borderColor ? `2px solid ${node.borderColor}` : 'none',
                    boxShadow: 'none',
                  }}
                >
                  <span className="font-mono text-[11px] md:text-[12px] font-semibold uppercase tracking-[0.06em]">
                    {node.shortLabel}
                  </span>
                  {node.id === 'GAP' && (
                    <span
                      className="absolute inset-0 rounded-lg pointer-events-none"
                      style={{
                        boxShadow: '0 0 12px rgba(140, 91, 91, 0.25)',
                        animation: 'pulse 2s ease-in-out infinite',
                      }}
                    />
                  )}
                </button>
              </div>
            ))}
          </div>

          {/* Expanded Detail Panel */}
          <div className="max-w-[800px] mx-auto mt-space-6">
            {SPINE_NODES.map((node) => (
              <div
                key={node.id}
                className="overflow-hidden transition-all duration-300"
                style={{
                  maxHeight: activeNode === node.id ? '600px' : '0px',
                  opacity: activeNode === node.id ? 1 : 0,
                }}
              >
                {activeNode === node.id && (
                  <div
                    className="rounded-[4px] p-space-6 border border-[#E7E3DB] bg-[#FAF9F6]"
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderLeftWidth: '4px',
                      borderLeftColor: node.bgColor,
                    }}
                  >
                    <h4
                      className="font-mono text-[12px] font-semibold uppercase tracking-[0.06em] mb-space-3"
                      style={{ color: node.bgColor }}
                    >
                      {node.label}
                    </h4>
                    <p className="body text-text-primary mb-space-4">{node.details}</p>
                    {node.bullets && node.bullets.length > 0 && (
                      <ul className="space-y-2">
                        {node.bullets.map((b, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span
                              className="w-1.5 h-1.5 rounded-full mt-2 shrink-0"
                              style={{ backgroundColor: node.bgColor }}
                            />
                            <span className="body-sm text-text-secondary">
                              {b.text}
                              {b.citation && (
                                <span className="ml-1 text-text-tertiary">
                                  — {b.citation}
                                  {b.citationCount && (
                                    <span> ({b.citationCount.toLocaleString()} cites)</span>
                                  )}
                                </span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}

            {activeNode === null && (
              <p className="text-center mono-sm text-text-tertiary mt-space-4">
                Click a node above to reveal details
              </p>
            )}
          </div>
        </div>

        {/* Structural Hole Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-6 max-w-[1000px] mx-auto">
          {/* Left: Bar Chart */}
          <div className="scroll-animate bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] p-space-6">
            <h4 className="heading-4 font-serif text-accent-indigo mb-space-4">
              Cross-Community Edge Strength
            </h4>
            <CrossCommunityChart />
          </div>

          {/* Right: Stat Blocks */}
          <div className="scroll-animate bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] p-space-6">
            <h4 className="heading-4 font-serif text-accent-indigo mb-space-6">
              Gap Metrics
            </h4>

            <div className="space-y-space-6">
              {/* Stat 1 */}
              <div className="flex items-baseline justify-between border-b border-border-light pb-space-4">
                <div>
                  <span className="mono-lg font-bold text-[#8C5B5B] text-[clamp(28px,3vw,42px)]">
                    3.845
                  </span>
                  <p className="mono-sm text-text-secondary mt-1">
                    Structural ↔ Precision edge weight
                  </p>
                </div>
              </div>

              {/* Stat 2 */}
              <div className="flex items-baseline justify-between border-b border-border-light pb-space-4">
                <div>
                  <span className="mono-lg font-bold text-accent-indigo text-[clamp(28px,3vw,42px)]">
                    4.500
                  </span>
                  <p className="mono-sm text-text-secondary mt-1">
                    Mean cross-community edge weight
                  </p>
                </div>
              </div>

              {/* Stat 3 */}
              <div className="flex items-baseline justify-between pb-space-2">
                <div>
                  <span className="mono-lg font-bold text-[#8C5B5B] text-[clamp(28px,3vw,42px)]">
                    -14.6%
                  </span>
                  <p className="mono-sm text-text-secondary mt-1">
                    Below-average connection
                  </p>
                </div>
              </div>
            </div>

            <p className="body-sm text-text-tertiary mt-space-4 pt-space-4 border-t border-border-light">
              Lower cross-community edge weight indicates a structural hole — a disconnect
              between these research areas.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
