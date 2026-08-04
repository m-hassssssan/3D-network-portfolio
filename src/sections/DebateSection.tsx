import { useRef, useEffect } from 'react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import * as d3 from 'd3';

/* ------------------------------------------------------------------ */
/*  DATA                                                               */
/* ------------------------------------------------------------------ */

interface DebateTrack {
  id: number;
  name: string;
  color: string;
  startYear: number;
  endYear: number;
  peakPeriod: string;
  consensus: 'SETTLED' | 'ONGOING' | 'EMERGING';
  consensusPercent: number;
  description: string;
  keyPapers: { year: number; author: string; title: string; citations?: number }[];
  // Intensity per year (paper count on this topic)
  intensity: { year: number; count: number }[];
}

const DEBATE_TRACKS: DebateTrack[] = [
  {
    id: 1,
    name: 'Static vs Dynamic FC',
    color: '#3B6FC4',
    startYear: 2010,
    endYear: 2026,
    peakPeriod: '2014–2018',
    consensus: 'SETTLED',
    consensusPercent: 70,
    description:
      'Whether resting-state connectivity is stable over time or inherently time-varying. The 2014 Allen et al. and Hutchison et al. papers established dynamic FC as a real phenomenon, but debate continues on methods and biological significance.',
    keyPapers: [
      { year: 2014, author: 'Allen et al.', title: 'Tracking whole-brain connectivity dynamics', citations: 3400 },
      { year: 2014, author: 'Hutchison et al.', title: 'Dynamic functional connectivity', citations: 2100 },
      { year: 2016, author: 'Preti et al.', title: 'Dynamic reconfiguration', citations: 890 },
    ],
    intensity: [
      { year: 2010, count: 1 }, { year: 2011, count: 1 }, { year: 2012, count: 2 },
      { year: 2013, count: 3 }, { year: 2014, count: 6 }, { year: 2015, count: 7 },
      { year: 2016, count: 8 }, { year: 2017, count: 7 }, { year: 2018, count: 6 },
      { year: 2019, count: 5 }, { year: 2020, count: 4 }, { year: 2021, count: 4 },
      { year: 2022, count: 3 }, { year: 2023, count: 3 }, { year: 2024, count: 2 },
      { year: 2025, count: 1 }, { year: 2026, count: 1 },
    ],
  },
  {
    id: 2,
    name: 'Group vs Individual Networks',
    color: '#5B8C7B',
    startYear: 2015,
    endYear: 2026,
    peakPeriod: '2017–2021',
    consensus: 'ONGOING',
    consensusPercent: 55,
    description:
      'Whether group-averaged parcellations miss critical individual differences in network topology. Finn et al. 2015 showed connectome fingerprinting; Gordon et al. 2017 demonstrated individual parcellation variability.',
    keyPapers: [
      { year: 2015, author: 'Finn et al.', title: 'Functional connectome fingerprinting', citations: 3318 },
      { year: 2017, author: 'Gordon et al.', title: 'Precision functional mapping', citations: 1543 },
      { year: 2015, author: 'Laumann et al.', title: 'Individual differences', citations: 780 },
    ],
    intensity: [
      { year: 2015, count: 2 }, { year: 2016, count: 3 }, { year: 2017, count: 6 },
      { year: 2018, count: 7 }, { year: 2019, count: 7 }, { year: 2020, count: 6 },
      { year: 2021, count: 5 }, { year: 2022, count: 4 }, { year: 2023, count: 4 },
      { year: 2024, count: 3 }, { year: 2025, count: 2 }, { year: 2026, count: 1 },
    ],
  },
  {
    id: 3,
    name: 'Null Model Controversy',
    color: '#E8A820',
    startYear: 2009,
    endYear: 2026,
    peakPeriod: 'Ongoing',
    consensus: 'ONGOING',
    consensusPercent: 40,
    description:
      'What constitutes appropriate null models for brain networks. Rubinov & Sporns 2010 standardized approaches, but Zalesky et al. 2012 showed that null model choice dramatically affects conclusions.',
    keyPapers: [
      { year: 2010, author: 'Rubinov & Sporns', title: 'Complex network measures', citations: 5200 },
      { year: 2012, author: 'Zalesky et al.', title: 'On the use of null models', citations: 450 },
      { year: 2014, author: 'Colizza et al.', title: 'Detecting rich-clusters', citations: 320 },
    ],
    intensity: [
      { year: 2009, count: 1 }, { year: 2010, count: 3 }, { year: 2011, count: 2 },
      { year: 2012, count: 4 }, { year: 2013, count: 3 }, { year: 2014, count: 4 },
      { year: 2015, count: 3 }, { year: 2016, count: 3 }, { year: 2017, count: 2 },
      { year: 2018, count: 3 }, { year: 2019, count: 2 }, { year: 2020, count: 2 },
      { year: 2021, count: 3 }, { year: 2022, count: 2 }, { year: 2023, count: 2 },
      { year: 2024, count: 2 }, { year: 2025, count: 1 }, { year: 2026, count: 1 },
    ],
  },
  {
    id: 4,
    name: 'Structure-Function Coupling',
    color: '#D4A853',
    startYear: 2008,
    endYear: 2026,
    peakPeriod: 'Steady',
    consensus: 'EMERGING',
    consensusPercent: 50,
    description:
      'How well structural connectivity predicts functional connectivity. Honey et al. 2009 showed coupling is partial; subsequent work explored the "missing link" — why structure doesn\'t fully explain function.',
    keyPapers: [
      { year: 2009, author: 'Honey et al.', title: 'Predicting human resting-state', citations: 1800 },
      { year: 2014, author: 'Suárez et al.', title: 'Structural architecture regulates', citations: 560 },
      { year: 2016, author: 'Messé et al.', title: 'Relating structural and functional', citations: 340 },
    ],
    intensity: [
      { year: 2008, count: 1 }, { year: 2009, count: 2 }, { year: 2010, count: 2 },
      { year: 2011, count: 2 }, { year: 2012, count: 3 }, { year: 2013, count: 3 },
      { year: 2014, count: 4 }, { year: 2015, count: 3 }, { year: 2016, count: 4 },
      { year: 2017, count: 3 }, { year: 2018, count: 3 }, { year: 2019, count: 3 },
      { year: 2020, count: 4 }, { year: 2021, count: 3 }, { year: 2022, count: 3 },
      { year: 2023, count: 3 }, { year: 2024, count: 2 }, { year: 2025, count: 2 },
      { year: 2026, count: 1 },
    ],
  },
];

const YEAR_MIN = 2008;
const YEAR_MAX = 2026;

/* ------------------------------------------------------------------ */
/*  CONSENSUS BADGE                                                    */
/* ------------------------------------------------------------------ */

function ConsensusBadge({ status }: { status: DebateTrack['consensus']; percent?: number }) {
  const colors = {
    SETTLED: { bg: 'rgba(91,140,123,0.12)', text: '#5B8C7B', border: 'rgba(91,140,123,0.25)' },
    ONGOING: { bg: 'rgba(232,168,32,0.12)', text: '#B8860B', border: 'rgba(232,168,32,0.25)' },
    EMERGING: { bg: 'rgba(59,111,196,0.12)', text: '#3B6FC4', border: 'rgba(59,111,196,0.25)' },
  };
  const c = colors[status];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium border"
      style={{ background: c.bg, color: c.text, borderColor: c.border }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: c.text }}
      />
      {status}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  D3 TIMELINE CHART                                                  */
/* ------------------------------------------------------------------ */

function TimelineChart() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const container = ref.current;
    container.innerHTML = '';

    const margin = { top: 40, right: 30, bottom: 60, left: 220 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = 420 - margin.top - margin.bottom;

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3.scaleLinear().domain([YEAR_MIN, YEAR_MAX]).range([0, width]);

    const trackHeight = height / DEBATE_TRACKS.length;
    const barHeight = trackHeight * 0.35;

    // Find max intensity for scaling
    const maxCount = d3.max(DEBATE_TRACKS, (d) => d3.max(d.intensity, (i) => i.count)) || 10;
    const yBarScale = d3.scaleLinear().domain([0, maxCount]).range([0, barHeight]);

    // Draw era dividers
    const eras = [
      { year: 2008, label: '' },
      { year: 2013, label: 'Controversy' },
      { year: 2019, label: 'Precision' },
    ];

    eras.forEach((era) => {
      if (era.year < YEAR_MIN || era.year > YEAR_MAX) return;
      g.append('line')
        .attr('x1', xScale(era.year))
        .attr('x2', xScale(era.year))
        .attr('y1', 0)
        .attr('y2', height)
        .attr('stroke', '#D0CCC4')
        .attr('stroke-dasharray', '4,4')
        .attr('stroke-width', 1)
        .attr('opacity', 0.5);

      if (era.label) {
        g.append('text')
          .attr('x', xScale(era.year))
          .attr('y', height + 35)
          .attr('text-anchor', 'middle')
          .attr('class', 'font-mono')
          .style('font-size', '10px')
          .style('fill', '#8B8DA3')
          .text(era.label);
      }
    });

    // X-axis
    const xAxis = d3.axisBottom(xScale).tickFormat(d3.format('d')).ticks(10).tickSize(0).tickPadding(8);
    const xAxisG = g
      .append('g')
      .attr('transform', `translate(0,${height})`)
      .call(xAxis);
    xAxisG.select('.domain').attr('stroke', '#E5E2DC').attr('stroke-width', 1);
    xAxisG.selectAll('.tick line').remove();
    xAxisG.selectAll('.tick text').attr('class', 'font-mono').style('font-size', '11px').style('fill', '#8B8DA3');

    // Draw tracks
    DEBATE_TRACKS.forEach((track, trackIdx) => {
      const trackY = trackIdx * trackHeight;
      const centerY = trackY + trackHeight / 2;

      // Track background (alternating)
      if (trackIdx % 2 === 0) {
        g.append('rect')
          .attr('x', 0)
          .attr('y', trackY)
          .attr('width', width)
          .attr('height', trackHeight)
          .attr('fill', '#FFFFFF')
          .attr('opacity', 0.6)
          .attr('rx', 4);
      }

      // Track label (left side)
      const labelG = svg.append('g').attr('transform', `translate(0, ${margin.top + centerY})`);

      // Color indicator bar
      labelG
        .append('rect')
        .attr('x', 10)
        .attr('y', -barHeight / 2 - 6)
        .attr('width', 4)
        .attr('height', barHeight + 12)
        .attr('fill', track.color)
        .attr('rx', 2);

      labelG
        .append('text')
        .attr('x', 22)
        .attr('y', -4)
        .attr('class', 'font-mono')
        .style('font-size', '12px')
        .style('font-weight', 600)
        .style('fill', '#1A1B3A')
        .text(track.name);

      labelG
        .append('text')
        .attr('x', 22)
        .attr('y', 12)
        .attr('class', 'font-mono')
        .style('font-size', '10px')
        .style('fill', '#8B8DA3')
        .text(`${track.startYear}–${track.endYear}  ·  Peak: ${track.peakPeriod}`);

      // Intensity bars (grouped by year)
      const barGroup = g.append('g');

      track.intensity.forEach((d) => {
        const x = xScale(d.year);
        const barW = (width / (YEAR_MAX - YEAR_MIN)) * 0.7;

        barGroup
          .append('rect')
          .attr('x', x - barW / 2)
          .attr('y', centerY - yBarScale(d.count) / 2)
          .attr('width', barW)
          .attr('height', 0)
          .attr('fill', track.color)
          .attr('opacity', 0.6)
          .attr('rx', 2)
          .transition()
          .duration(800)
          .delay(200 + trackIdx * 150 + (d.year - YEAR_MIN) * 20)
          .attr('height', yBarScale(d.count))
          .attr('y', centerY - yBarScale(d.count) / 2);
      });

      // Key paper markers (circles)
      track.keyPapers.forEach((paper) => {
        const px = xScale(paper.year);
        const circleR = paper.citations
          ? Math.max(4, Math.min(10, Math.sqrt(paper.citations) / 15))
          : 5;

        const markerG = g.append('g');

        markerG
          .append('circle')
          .attr('cx', px)
          .attr('cy', centerY + barHeight / 2 + 12)
          .attr('r', 0)
          .attr('fill', track.color)
          .attr('opacity', 0.85)
          .attr('stroke', '#fff')
          .attr('stroke-width', 1.5)
          .transition()
          .duration(400)
          .delay(600 + trackIdx * 100)
          .attr('r', circleR);

        // Tooltip on hover (title only)
        markerG
          .append('title')
          .text(`${paper.author} (${paper.year}) — ${paper.title}${paper.citations ? ` [${paper.citations} cites]` : ''}`);
      });
    });

    // Era labels at top
    const eraLabels = [
      { start: 2008, end: 2012, label: 'Expansion' },
      { start: 2013, end: 2018, label: 'Controversy' },
      { start: 2019, end: 2026, label: 'Precision' },
    ];

    eraLabels.forEach((era) => {
      const cx = (xScale(era.start) + xScale(era.end)) / 2;
      g.append('text')
        .attr('x', cx)
        .attr('y', -20)
        .attr('text-anchor', 'middle')
        .attr('class', 'font-mono')
        .style('font-size', '9px')
        .style('fill', '#8B8DA3')
        .style('letter-spacing', '0.06em')
        .style('text-transform', 'uppercase')
        .text(era.label);
    });

    return () => {
      container.innerHTML = '';
    };
  }, []);

  return <div ref={ref} className="w-full overflow-x-auto" />;
}

/* ------------------------------------------------------------------ */
/*  DEBATE DETAIL CARD                                                 */
/* ------------------------------------------------------------------ */

function DebateCard({ track }: { track: DebateTrack }) {
  return (
    <div
      className="scroll-animate bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] p-space-6"
      style={{ borderLeftWidth: '4px', borderLeftColor: track.color }}
    >
      <div className="flex items-center gap-2 mb-space-2">
        <h3 className="heading-3 font-serif text-accent-indigo">
          {track.name}
        </h3>
      </div>

      <div className="flex items-center gap-3 mb-space-3">
        <span
          className="inline-block rounded px-2 py-0.5 font-mono text-[11px] font-medium"
          style={{
            background: `${track.color}18`,
            color: track.color,
          }}
        >
          {track.startYear}–present
        </span>
        <ConsensusBadge status={track.consensus} percent={track.consensusPercent} />
      </div>

      <p className="body text-text-secondary mb-space-4">{track.description}</p>

      {/* Consensus bar */}
      <div className="mb-space-3">
        <div className="flex items-center justify-between mb-1">
          <span className="mono-sm text-text-tertiary">Consensus</span>
          <span className="mono-sm font-medium" style={{ color: track.color }}>
            {track.consensusPercent}%
          </span>
        </div>
        <div className="w-full h-2 bg-warm-gray rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${track.consensusPercent}%`, backgroundColor: track.color }}
          />
        </div>
      </div>

      {/* Key papers */}
      <div className="pt-space-3 border-t border-border-light">
        <span className="mono-sm text-text-tertiary uppercase tracking-wide">Key Papers</span>
        <ul className="mt-space-2 space-y-1">
          {track.keyPapers.map((paper) => (
            <li key={`${paper.author}-${paper.year}`} className="mono text-text-secondary text-[12px]">
              {paper.author} {paper.year} — <em className="text-text-primary">{paper.title}</em>
              {paper.citations ? (
                <span className="text-text-tertiary ml-1">({paper.citations.toLocaleString()} cites)</span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MAIN SECTION                                                       */
/* ------------------------------------------------------------------ */

export default function DebateSection() {
  const sectionRef = useScrollAnimation<HTMLElement>({
    selector: '.scroll-animate',
    stagger: 0.08,
    y: 25,
    duration: 0.5,
  });

  return (
    <section
      id="debates"
      ref={sectionRef}
      className="w-full bg-warm-gray py-space-24"
    >
      <div className="section-container">
        {/* Section Header */}
        <div className="scroll-animate mb-space-6">
          <span className="label text-accent-gold tracking-[0.08em]">
            ANALYSIS 02
          </span>
        </div>
        <h2 className="scroll-animate heading-1 font-serif text-accent-indigo mb-space-4">
          How the Debates Evolved
        </h2>
        <p className="scroll-animate body-lg text-text-secondary mb-space-12 max-w-3xl">
          Four enduring debates that shaped network neuroscience from 2008 to today
        </p>

        {/* D3 Timeline Chart */}
        <div className="scroll-animate mb-space-12 bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] p-space-4 overflow-x-auto">
          <TimelineChart />
        </div>

        {/* Debate Detail Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-6">
          {DEBATE_TRACKS.map((track) => (
            <DebateCard key={track.id} track={track} />
          ))}
        </div>
      </div>
    </section>
  );
}
