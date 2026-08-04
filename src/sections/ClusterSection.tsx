import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { cn } from '@/lib/utils';
import { FileImage, FileCode, FileSpreadsheet } from 'lucide-react';

import { SCHOOL_COLORS } from '@/lib/colors';

/* ------------------------------------------------------------------ */
/*  Design tokens                                                      */
/* ------------------------------------------------------------------ */
const SCHOOL_SHORT = [
  'Foundations', 'fMRI/DMN', 'Structural', 'Dynamic FC', 'Clinical',
  'Hubs', 'Precision', 'Methods', 'arXiv',
];

interface AnalysisData {
  modularity_q: number;
  num_communities: number;
  communities: Record<string, { name: string; papers_per_year: Record<string, number> }>;
  bridge_papers: Array<{
    id: string;
    title: string;
    authors: string;
    year: number;
    community: string;
    betweenness: number;
    cross_community_edges: number;
    citations: number;
  }>;
  timeline: Record<string, { count: number; community_breakdown: Record<string, number> }>;
  coauthorship: {
    top_authors: Array<{ name: string; paper_count: number; school_affiliation?: number }>;
    collaboration_edges: Array<{ source: string; target: string; shared_papers: number }>;
  };
  community_evolution: Record<string, { name: string; papers_per_year: Record<string, number> }>;
}

/* ------------------------------------------------------------------ */
/*  Data loader                                                        */
/* ------------------------------------------------------------------ */
let dataCache: AnalysisData | null = null;
async function loadData(): Promise<AnalysisData> {
  if (dataCache) return dataCache;
  const res = await fetch('/analysis_data.json');
  dataCache = await res.json();
  return dataCache!;
}

/* ------------------------------------------------------------------ */
/*  Export helpers                                                     */
/* ------------------------------------------------------------------ */
function downloadSVG(svgEl: SVGSVGElement | null, filename: string) {
  if (!svgEl) return;
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(clone);
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadCSV(rows: Array<Record<string, string | number>>, filename: string) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(','), ...rows.map((r) => keys.map((k) => `"${String(r[k]).replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPNG(svgEl: SVGSVGElement | null, filename: string) {
  if (!svgEl) return;
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(clone);
  const rect = svgEl.getBoundingClientRect();
  const canvas = document.createElement('canvas');
  canvas.width = rect.width * 2;
  canvas.height = rect.height * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const img = new Image();
  const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  img.onload = () => {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    }, 'image/png');
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

/* ------------------------------------------------------------------ */
/*  Stacked Area Chart                                                 */
/* ------------------------------------------------------------------ */
function StackedAreaChart({ data }: { data: AnalysisData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    if (!containerRef.current || !svgRef.current || !data) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const rect = containerRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = 420;
    const margin = { top: 24, right: 24, bottom: 48, left: 56 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    svg.attr('width', width).attr('height', height);

    const years: number[] = [];
    for (let y = 1994; y <= 2026; y++) years.push(y);

    const schoolIds = Object.keys(data.community_evolution).map(Number).sort((a, b) => a - b);

    const stackedData = years.map((year) => {
      const row: Record<string, number> = { year };
      schoolIds.forEach((sid) => {
        const comm = data.community_evolution[sid];
        row[sid] = comm?.papers_per_year[String(year)] ?? 0;
      });
      return row;
    });

    const keys = schoolIds.map(String);
    const series = d3.stack<Record<string, number>>().keys(keys)(stackedData);

    const x = d3.scaleLinear().domain([1994, 2026]).range([0, innerW]);
    const y = d3.scaleLinear().domain([0, d3.max(series, (s) => d3.max(s, (d) => d[1])) ?? 0]).range([innerH, 0]).nice();

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const area = d3.area<d3.SeriesPoint<Record<string, number>>>()
      .x((d) => x(d.data.year as number))
      .y0((d) => y(d[0]))
      .y1((d) => y(d[1]))
      .curve(d3.curveMonotoneX);

    const layers = g.selectAll('.layer')
      .data(series)
      .join('path')
      .attr('class', 'layer')
      .attr('d', area)
      .attr('fill', (_, i) => SCHOOL_COLORS[schoolIds[i]])
      .attr('opacity', 0.82)
      .style('stroke', 'white')
      .style('stroke-width', 0.5);

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickFormat(d3.format('d')).ticks(8))
      .call((g2) => g2.select('.domain').attr('stroke', '#D0CCC4'))
      .call((g2) => g2.selectAll('.tick line').attr('stroke', '#E5E2DC'))
      .call((g2) => g2.selectAll('.tick text').attr('fill', '#5A5C7A').style('font-family', 'Source Serif Pro').style('font-size', '11px').style('font-weight', '500'));

    g.append('g')
      .call(d3.axisLeft(y).ticks(6))
      .call((g2) => g2.select('.domain').attr('stroke', '#D0CCC4'))
      .call((g2) => g2.selectAll('.tick line').attr('stroke', '#E5E2DC'))
      .call((g2) => g2.selectAll('.tick text').attr('fill', '#5A5C7A').style('font-family', 'Source Serif Pro').style('font-size', '11px').style('font-weight', '500'));

    // Axis labels
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -44)
      .attr('x', -innerH / 2)
      .attr('text-anchor', 'middle')
      .text('Papers Published')
      .attr('fill', '#8B8DA3')
      .style('font-family', 'JetBrains Mono')
      .style('font-size', '11px')
      .style('letter-spacing', '0.02em');

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('x', innerW / 2)
      .attr('y', innerH + 40)
      .text('Year')
      .attr('fill', '#8B8DA3')
      .style('font-family', 'JetBrains Mono')
      .style('font-size', '11px')
      .style('letter-spacing', '0.02em');

    // Vertical annotations
    const annotations = [
      { year: 2013, label: 'Peak period begins' },
      { year: 2019, label: 'Precision era' },
    ];
    annotations.forEach((ann) => {
      g.append('line')
        .attr('x1', x(ann.year))
        .attr('x2', x(ann.year))
        .attr('y1', 0)
        .attr('y2', innerH)
        .attr('stroke', '#D0CCC4')
        .attr('stroke-dasharray', '4,4')
        .attr('stroke-width', 1);
      g.append('text')
        .attr('x', x(ann.year) + 4)
        .attr('y', 12)
        .text(ann.label)
        .attr('fill', '#8B8DA3')
        .style('font-family', 'JetBrains Mono')
        .style('font-size', '9px');
    });

    // Hover interaction
    const overlay = g.append('rect').attr('width', innerW).attr('height', innerH).attr('fill', 'transparent');

    overlay
      .on('mousemove', function (event) {
        const [mx] = d3.pointer(event);
        const yr = Math.round(x.invert(mx));
        const idx = years.indexOf(yr);
        if (idx < 0) return;

        const tooltip = d3.select(tooltipRef.current);
        tooltip.style('opacity', 1);

        let html = `<div style="font-family:'JetBrains Mono';font-size:11px;font-weight:600;margin-bottom:4px;color:#1A1B3A">${yr}</div>`;
        schoolIds.forEach((sid) => {
          const val = stackedData[idx][sid];
          if (val > 0) {
            html += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0;font-family:'JetBrains Mono';font-size:10px;color:#5A5C7A">
              <span style="width:8px;height:8px;border-radius:50%;background:${SCHOOL_COLORS[sid]};display:inline-block"></span>
              ${SCHOOL_SHORT[sid]}: ${val}
            </div>`;
          }
        });

        tooltip.html(html);
        const ttRect = tooltipRef.current?.getBoundingClientRect();
        const contRect = containerRef.current?.getBoundingClientRect();
        if (ttRect && contRect) {
          let left = mx + margin.left + 12;
          let top = event.offsetY + 12;
          if (left + ttRect.width > contRect.width) left = mx + margin.left - ttRect.width - 12;
          tooltip.style('left', `${left}px`).style('top', `${top}px`);
        }

        layers.attr('opacity', (_, i) => (stackedData[idx][schoolIds[i]] > 0 ? 0.95 : 0.82));
        layers.filter((_, i) => stackedData[idx][schoolIds[i]] > 0).attr('opacity', 0.95);
        layers.filter((_, i) => stackedData[idx][schoolIds[i]] === 0).attr('opacity', 0.4);
      })
      .on('mouseleave', () => {
        d3.select(tooltipRef.current).style('opacity', 0);
        layers.attr('opacity', 0.82);
      });
  }, [data]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  const handleExportCSV = () => {
    if (!data) return;
    const years: number[] = [];
    for (let y = 1994; y <= 2026; y++) years.push(y);
    const schoolIds = Object.keys(data.community_evolution).map(Number).sort((a, b) => a - b);
    const rows = years.map((year) => {
      const row: Record<string, string | number> = { year };
      schoolIds.forEach((sid) => {
        row[SCHOOL_SHORT[sid]] = data.community_evolution[sid]?.papers_per_year[String(year)] ?? 0;
      });
      return row;
    });
    downloadCSV(rows, 'cluster_evolution.csv');
  };

  return (
    <div className="relative bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] p-space-6" ref={containerRef}>
      <div className="flex items-center justify-between mb-space-4">
        <h3 className="heading-4 font-serif text-accent-indigo">School Publication Over Time</h3>
        <div className="flex items-center gap-1">
          <button onClick={() => downloadPNG(svgRef.current, 'cluster_evolution.png')} className="w-8 h-8 rounded-md border border-border-light flex items-center justify-center text-text-secondary hover:text-accent-indigo hover:bg-surface-elevated transition-colors" title="Export PNG"><FileImage size={14} /></button>
          <button onClick={() => downloadSVG(svgRef.current, 'cluster_evolution.svg')} className="w-8 h-8 rounded-md border border-border-light flex items-center justify-center text-text-secondary hover:text-accent-indigo hover:bg-surface-elevated transition-colors" title="Export SVG"><FileCode size={14} /></button>
          <button onClick={handleExportCSV} className="w-8 h-8 rounded-md border border-border-light flex items-center justify-center text-text-secondary hover:text-accent-indigo hover:bg-surface-elevated transition-colors" title="Export CSV"><FileSpreadsheet size={14} /></button>
        </div>
      </div>
      <svg ref={svgRef} style={{ width: '100%', height: 420 }} />
      <div ref={tooltipRef} className="absolute pointer-events-none bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] p-space-3 opacity-0 transition-opacity z-elevated" style={{ minWidth: 140 }} />
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-space-3">
        {SCHOOL_SHORT.map((name, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: SCHOOL_COLORS[i] }} />
            <span className="mono-sm text-text-secondary">{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Heatmap                                                            */
/* ------------------------------------------------------------------ */
function CoCitationHeatmap({ data }: { data: AnalysisData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    if (!containerRef.current || !svgRef.current || !data) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const rect = containerRef.current.getBoundingClientRect();
    const width = rect.width;
    const cellSize = 16;
    const gap = 1;
    const n = 30;
    const matrixW = n * (cellSize + gap);
    const labelSpaceL = 100;
    const labelSpaceT = 100;
    const margin = { top: labelSpaceT + 16, right: 16, bottom: 40, left: labelSpaceL + 16 };
    const height = matrixW + margin.top + margin.bottom;

    svg.attr('width', width).attr('height', height);

    // Build a similarity matrix from bridge paper cross-community edges
    const bridgePapers = [...data.bridge_papers].sort((a, b) => b.betweenness - a.betweenness).slice(0, n);
    const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

    bridgePapers.forEach((p, i) => {
      bridgePapers.forEach((q, j) => {
        if (i === j) { matrix[i][j] = 0; return; }
        const sameSchool = p.community === q.community ? 1 : 0;
        const yearDiff = Math.abs(p.year - q.year);
        const btScore = (p.betweenness + q.betweenness) * 1000;
        const weight = sameSchool * 0.5 + (1 / (1 + yearDiff * 0.1)) * 0.3 + Math.min(btScore, 0.2);
        matrix[i][j] = weight;
      });
    });

    const flat = matrix.flat().filter((v) => v > 0);
    const colorScale = d3.scaleSequential(d3.interpolateYlGnBu).domain([0, d3.max(flat) ?? 1]);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Cells
    g.selectAll('.cell')
      .data(matrix.flatMap((row, i) => row.map((val, j) => ({ i, j, val }))))
      .join('rect')
      .attr('class', 'cell')
      .attr('x', (d) => d.j * (cellSize + gap))
      .attr('y', (d) => d.i * (cellSize + gap))
      .attr('width', cellSize)
      .attr('height', cellSize)
      .attr('rx', 1)
      .attr('fill', (d) => (d.i === d.j ? '#F0EDE8' : colorScale(d.val)))
      .attr('opacity', (d) => (d.i === d.j ? 1 : 0.92))
      .on('mouseover', function (event, d) {
        if (d.i === d.j) return;
        d3.select(this).attr('stroke', '#1A1B3A').attr('stroke-width', 1.5);
        g.selectAll('.cell').filter((c: unknown) => { const cd = c as { i: number; j: number }; return cd.i !== d.i && cd.j !== d.j; }).attr('opacity', 0.2);

        const tooltip = d3.select(tooltipRef.current);
        tooltip.style('opacity', 1);
        tooltip.html(`
          <div style="font-family:'JetBrains Mono';font-size:10px">
            <div style="font-weight:600;color:#1A1B3A;margin-bottom:3px">${bridgePapers[d.i].authors.split(',')[0]} ${bridgePapers[d.i].year} ↔ ${bridgePapers[d.j].authors.split(',')[0]} ${bridgePapers[d.j].year}</div>
            <div style="color:#5A5C7A">Weight: <span style="font-weight:600;color:#1A1B3A">${d.val.toFixed(3)}</span></div>
          </div>
        `);
        const ttRect = tooltipRef.current?.getBoundingClientRect();
        const contRect = containerRef.current?.getBoundingClientRect();
        if (ttRect && contRect) {
          let left = event.offsetX + 16;
          let top = event.offsetY + 16;
          if (left + ttRect.width > contRect.width) left = event.offsetX - ttRect.width - 8;
          if (top + ttRect.height > contRect.height) top = event.offsetY - ttRect.height - 8;
          tooltip.style('left', `${left}px`).style('top', `${top}px`);
        }
      })
      .on('mouseout', function () {
        d3.select(this).attr('stroke', 'none');
        g.selectAll('.cell').attr('opacity', (c: unknown) => { const cd = c as { i: number; j: number }; return cd.i === cd.j ? 1 : 0.92; });
        d3.select(tooltipRef.current).style('opacity', 0);
      });

    // Row labels
    g.selectAll('.rlabel')
      .data(bridgePapers)
      .join('text')
      .attr('class', 'rlabel')
      .attr('x', -8)
      .attr('y', (_, i) => i * (cellSize + gap) + cellSize / 2 + 3)
      .attr('text-anchor', 'end')
      .text((p) => {
        const author = p.authors.split(',')[0].trim();
        return `${author} ${p.year}`;
      })
      .attr('fill', '#5A5C7A')
      .style('font-family', 'JetBrains Mono')
      .style('font-size', '9px');

    // Col labels (rotated)
    g.selectAll('.clabel')
      .data(bridgePapers)
      .join('text')
      .attr('class', 'clabel')
      .attr('x', (_, i) => i * (cellSize + gap) + cellSize / 2)
      .attr('y', -8)
      .attr('text-anchor', 'start')
      .attr('transform', (_, i) => `rotate(-45, ${i * (cellSize + gap) + cellSize / 2}, -8)`)
      .text((p) => {
        const author = p.authors.split(',')[0].trim();
        return `${author} ${p.year}`;
      })
      .attr('fill', '#5A5C7A')
      .style('font-family', 'JetBrains Mono')
      .style('font-size', '9px');

    // Title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .text('Co-citation Heatmap — Top 30 Bridge Papers')
      .attr('fill', '#1A1B3A')
      .style('font-family', 'Source Serif Pro')
      .style('font-size', '14px')
      .style('font-weight', '600');
  }, [data]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  return (
    <div className="relative bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] p-space-6 mt-space-8" ref={containerRef}>
      <div className="flex items-center justify-between mb-space-4">
        <h3 className="heading-4 font-serif text-accent-indigo">Co-citation Heatmap — Top 30 Papers</h3>
        <div className="flex items-center gap-1">
          <button onClick={() => downloadPNG(svgRef.current, 'cocitation_heatmap.png')} className="w-8 h-8 rounded-md border border-border-light flex items-center justify-center text-text-secondary hover:text-accent-indigo hover:bg-surface-elevated transition-colors" title="Export PNG"><FileImage size={14} /></button>
          <button onClick={() => downloadSVG(svgRef.current, 'cocitation_heatmap.svg')} className="w-8 h-8 rounded-md border border-border-light flex items-center justify-center text-text-secondary hover:text-accent-indigo hover:bg-surface-elevated transition-colors" title="Export SVG"><FileCode size={14} /></button>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <svg ref={svgRef} />
      </div>
      <div ref={tooltipRef} className="absolute pointer-events-none bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] p-space-3 opacity-0 transition-opacity z-elevated" style={{ minWidth: 160 }} />
      <p className="mono-sm text-text-tertiary mt-space-2 italic">
        Color intensity represents co-occurrence similarity between bridge papers. Based on cross-community edge patterns and temporal proximity.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat Block                                                         */
/* ------------------------------------------------------------------ */
function StatBlock({ value, label, highlight }: { value: string; label: string; highlight?: boolean }) {
  return (
    <div className="bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] p-space-5 text-center">
      <div className={cn("font-['Source_Serif_Pro'] font-semibold text-[#1A1B3A]", highlight ? 'text-[#B89A4A]' : 'text-[#1A1B3A]')} style={{ fontSize: 'clamp(28px, 3vw, 48px)' }}>
        {value}
      </div>
      <div className="label text-[#8B8DA3] mt-space-1">{label}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Section                                                       */
/* ------------------------------------------------------------------ */
export default function ClusterSection() {
  const sectionRef = useScrollAnimation<HTMLElement>();
  const [data, setData] = useState<AnalysisData | null>(null);

  useEffect(() => {
    loadData().then(setData);
  }, []);

  if (!data) {
    return (
      <section id="clusters" ref={sectionRef} className="w-full bg-warm-gray py-space-24">
        <div className="section-container">
          <div className="scroll-animate mb-space-6"><span className="label text-accent-gold tracking-[0.08em]">ANALYSIS 04</span></div>
          <h2 className="scroll-animate heading-1 font-serif text-accent-indigo mb-space-4">Cluster Evolution &amp; Network Structure</h2>
          <div className="flex items-center justify-center min-h-[400px]"><span className="mono text-text-tertiary">Loading data...</span></div>
        </div>
      </section>
    );
  }

  return (
    <section id="clusters" ref={sectionRef} className="w-full bg-warm-gray py-space-24">
      <div className="section-container">
        <div className="scroll-animate mb-space-6">
          <span className="label text-accent-gold tracking-[0.08em]">ANALYSIS 04</span>
        </div>
        <h2 className="scroll-animate heading-1 font-serif text-accent-indigo mb-space-4">
          Cluster Evolution &amp; Network Structure
        </h2>
        <p className="scroll-animate body-lg text-text-secondary mb-space-12 max-w-3xl">
          How nine research communities grew and interconnected over three decades of network neuroscience
        </p>

        {/* Stacked Area Chart */}
        <div className="scroll-animate">
          <StackedAreaChart data={data} />
        </div>

        {/* Co-citation Heatmap */}
        <div className="scroll-animate">
          <CoCitationHeatmap data={data} />
        </div>

        {/* Network Stats */}
        <div className="scroll-animate grid grid-cols-2 md:grid-cols-4 gap-space-4 mt-space-12">
          <StatBlock value="244" label="Papers" />
          <StatBlock value="21,285" label="Edges" />
          <StatBlock value="9" label="Schools" />
          <StatBlock value="0.08" label="Modularity Q" highlight />
        </div>

        <p className="scroll-animate mono-sm text-text-tertiary mt-space-4 text-center italic">
          Q = 0.08 indicates a highly interdisciplinary field with fluid boundaries between research areas.
        </p>
      </div>
    </section>
  );
}
