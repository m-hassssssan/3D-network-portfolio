import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { FileImage, FileCode, FileSpreadsheet } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Design tokens                                                      */
/* ------------------------------------------------------------------ */
const ACCENT_INDIGO = '#1A1B3A';
const ACCENT_GOLD = '#D4A853';
const TEXT_SECONDARY = '#5A5C7A';
const TEXT_TERTIARY = '#8B8DA3';
const BORDER_LIGHT = '#E5E2DC';
const BORDER_MEDIUM = '#D0CCC4';
const KEY_YEARS = [
  { year: 2005, label: 'Hagmann', color: '#3B6FC4' },
  { year: 2009, label: 'Bullmore & Sporns', color: '#5B8C7B' },
  { year: 2013, label: 'HCP', color: '#E8A820' },
  { year: 2014, label: 'Dynamic FC', color: '#D4A853' },
  { year: 2017, label: 'Precision Mapping', color: '#B07A4A' },
];

interface AnalysisData {
  journal_distribution: Array<{ journal: string; count: number }>;
  year_distribution: Array<{ year: string; count: number }>;
  decade_distribution: Record<string, number>;
  timeline: Record<string, { count: number; top_keywords: string[][]; community_breakdown: Record<string, number> }>;
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

/* ------------------------------------------------------------------ */
/*  Horizontal Bar Chart — Top Journals                                */
/* ------------------------------------------------------------------ */
function JournalBarChart({ data }: { data: AnalysisData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    if (!containerRef.current || !svgRef.current || !data) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const rect = containerRef.current.getBoundingClientRect();
    const width = rect.width;
    const barH = 28;
    const gap = 8;
    const topN = 15;
    const margin = { top: 24, right: 60, bottom: 48, left: 220 };
    const innerW = width - margin.left - margin.right;
    const innerH = topN * (barH + gap) + 16;
    const height = innerH + margin.top + margin.bottom;

    svg.attr('width', width).attr('height', height);

    const journals = [...data.journal_distribution]
      .sort((a, b) => b.count - a.count)
      .slice(0, topN);

    const x = d3.scaleLinear().domain([0, d3.max(journals, (d) => d.count) ?? 0]).nice().range([0, innerW]);
    const y = d3.scaleBand().domain(journals.map((d) => d.journal)).range([0, innerH]).paddingInner(0.15);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Grid lines
    g.selectAll('.grid')
      .data(x.ticks(6))
      .join('line')
      .attr('class', 'grid')
      .attr('x1', (d) => x(d))
      .attr('x2', (d) => x(d))
      .attr('y1', 0)
      .attr('y2', innerH)
      .attr('stroke', BORDER_LIGHT)
      .attr('stroke-dasharray', '2,2');

    // Bars
    const bars = g.selectAll('.bar')
      .data(journals)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', 0)
      .attr('y', (d) => y(d.journal) ?? 0)
      .attr('width', 0)
      .attr('height', y.bandwidth())
      .attr('rx', 3)
      .attr('fill', ACCENT_INDIGO)
      .attr('opacity', 0.85)
      .style('cursor', 'pointer')
      .on('mouseover', function (event, d) {
        d3.select(this).attr('opacity', 1);
        const tooltip = d3.select(tooltipRef.current);
        tooltip.style('opacity', 1);
        tooltip.html(`
          <div style="font-family:'JetBrains Mono';font-size:11px">
            <div style="font-weight:600;color:#1A1B3A;margin-bottom:2px">${d.journal}</div>
            <div style="color:#5A5C7A">Papers: <span style="font-weight:600;color:#1A1B3A">${d.count}</span></div>
          </div>
        `);
        const ttRect = tooltipRef.current?.getBoundingClientRect();
        const contRect = containerRef.current?.getBoundingClientRect();
        if (ttRect && contRect) {
          tooltip.style('left', `${event.offsetX + 12}px`).style('top', `${event.offsetY - 8}px`);
        }
      })
      .on('mouseout', function () {
        d3.select(this).attr('opacity', 0.85);
        d3.select(tooltipRef.current).style('opacity', 0);
      });

    bars.transition().duration(800).delay((_, i) => i * 60).ease(d3.easeCubicOut)
      .attr('width', (d) => x(d.count));

    // Y labels
    g.selectAll('.ylabel')
      .data(journals)
      .join('text')
      .attr('class', 'ylabel')
      .attr('x', -10)
      .attr('y', (d) => (y(d.journal) ?? 0) + y.bandwidth() / 2 + 4)
      .attr('text-anchor', 'end')
      .text((d) => {
        const name = d.journal;
        return name.length > 30 ? name.slice(0, 27) + '...' : name;
      })
      .attr('fill', TEXT_SECONDARY)
      .style('font-family', 'JetBrains Mono')
      .style('font-size', '10px');

    // Value labels
    g.selectAll('.vlabel')
      .data(journals)
      .join('text')
      .attr('class', 'vlabel')
      .attr('x', 0)
      .attr('y', (d) => (y(d.journal) ?? 0) + y.bandwidth() / 2 + 4)
      .text((d) => d.count)
      .attr('fill', ACCENT_INDIGO)
      .style('font-family', 'JetBrains Mono')
      .style('font-size', '10px')
      .style('font-weight', '600')
      .transition().duration(800).delay((_, i) => i * 60 + 200)
      .attr('x', (d) => x(d.count) + 6);

    // X-axis
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(6))
      .call((g2) => g2.select('.domain').attr('stroke', BORDER_MEDIUM))
      .call((g2) => g2.selectAll('.tick line').attr('stroke', BORDER_LIGHT))
      .call((g2) => g2.selectAll('.tick text').attr('fill', TEXT_TERTIARY).style('font-family', 'JetBrains Mono').style('font-size', '10px'));

    // Axis label
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('x', innerW / 2)
      .attr('y', innerH + 36)
      .text('Paper Count')
      .attr('fill', TEXT_TERTIARY)
      .style('font-family', 'JetBrains Mono')
      .style('font-size', '11px')
      .style('letter-spacing', '0.02em');
  }, [data]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  const handleExportCSV = () => {
    if (!data) return;
    const rows = [...data.journal_distribution].sort((a, b) => b.count - a.count).slice(0, 15).map((j) => ({
      journal: j.journal,
      count: j.count,
    }));
    downloadCSV(rows, 'journal_distribution.csv');
  };

  return (
    <div className="relative bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] p-space-6" ref={containerRef}>
      <div className="flex items-center justify-between mb-space-4">
        <h3 className="heading-4 font-serif text-accent-indigo">Top 15 Journals by Paper Count</h3>
        <div className="flex items-center gap-1">
          <button onClick={() => downloadPNG(svgRef.current, 'journal_distribution.png')} className="w-8 h-8 rounded-md border border-border-light flex items-center justify-center text-text-secondary hover:text-accent-indigo hover:bg-surface-elevated transition-colors" title="Export PNG"><FileImage size={14} /></button>
          <button onClick={() => downloadSVG(svgRef.current, 'journal_distribution.svg')} className="w-8 h-8 rounded-md border border-border-light flex items-center justify-center text-text-secondary hover:text-accent-indigo hover:bg-surface-elevated transition-colors" title="Export SVG"><FileCode size={14} /></button>
          <button onClick={handleExportCSV} className="w-8 h-8 rounded-md border border-border-light flex items-center justify-center text-text-secondary hover:text-accent-indigo hover:bg-surface-elevated transition-colors" title="Export CSV"><FileSpreadsheet size={14} /></button>
        </div>
      </div>
      <svg ref={svgRef} style={{ width: '100%' }} />
      <div ref={tooltipRef} className="absolute pointer-events-none bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] p-space-3 opacity-0 transition-opacity z-elevated" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Year Histogram + LOESS Trend                                       */
/* ------------------------------------------------------------------ */
function YearHistogram({ data }: { data: AnalysisData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    if (!containerRef.current || !svgRef.current || !data) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const rect = containerRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = 380;
    const margin = { top: 32, right: 32, bottom: 56, left: 56 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    svg.attr('width', width).attr('height', height);

    const yearData = data.year_distribution.map((d) => ({
      year: +d.year,
      count: d.count,
    }));

    const x = d3.scaleLinear().domain([1994, 2026]).range([0, innerW]);
    const y = d3.scaleLinear().domain([0, d3.max(yearData, (d) => d.count) ?? 0]).nice().range([innerH, 0]);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Grid
    g.selectAll('.hgrid')
      .data(y.ticks(6))
      .join('line')
      .attr('class', 'hgrid')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', (d) => y(d)).attr('y2', (d) => y(d))
      .attr('stroke', BORDER_LIGHT).attr('stroke-dasharray', '2,2');

    // Bars
    const barWidth = innerW / yearData.length * 0.75;
    const bars = g.selectAll('.bar')
      .data(yearData)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', (d) => x(d.year) - barWidth / 2)
      .attr('y', innerH)
      .attr('width', Math.max(barWidth, 2))
      .attr('height', 0)
      .attr('rx', 2)
      .attr('fill', ACCENT_GOLD)
      .attr('opacity', 0.75)
      .style('cursor', 'pointer')
      .on('mouseover', function (event, d) {
        d3.select(this).attr('opacity', 1);
        const tooltip = d3.select(tooltipRef.current);
        tooltip.style('opacity', 1);
        tooltip.html(`
          <div style="font-family:'JetBrains Mono';font-size:11px">
            <div style="font-weight:600;color:#1A1B3A;margin-bottom:2px">${d.year}</div>
            <div style="color:#5A5C7A">Papers: <span style="font-weight:600;color:#1A1B3A">${d.count}</span></div>
          </div>
        `);
        const ttRect = tooltipRef.current?.getBoundingClientRect();
        const contRect = containerRef.current?.getBoundingClientRect();
        if (ttRect && contRect) {
          tooltip.style('left', `${event.offsetX + 12}px`).style('top', `${event.offsetY - 8}px`);
        }
      })
      .on('mouseout', function () {
        d3.select(this).attr('opacity', 0.75);
        d3.select(tooltipRef.current).style('opacity', 0);
      });

    bars.transition().duration(600).delay((_, i) => i * 12).ease(d3.easeCubicOut)
      .attr('y', (d) => y(d.count))
      .attr('height', (d) => innerH - y(d.count));

    // LOESS trend line
    const loessBandwidth = 0.3;
    const loessPoints = d3.range(1994, 2027, 1).map((xi) => {
      const weights = yearData.map((d) => {
        const u = Math.abs(xi - d.year) / (loessBandwidth * (2026 - 1994));
        return u < 1 ? Math.pow(1 - Math.pow(u, 3), 3) : 0;
      });
      const wSum = d3.sum(weights);
      if (wSum === 0) return { year: xi, value: 0 };
      const weightedSum = d3.sum(yearData, (d, i) => d.count * weights[i]);
      return { year: xi, value: weightedSum / wSum };
    });

    const lineGen = d3.line<{ year: number; value: number }>()
      .x((d) => x(d.year))
      .y((d) => y(d.value))
      .curve(d3.curveMonotoneX);

    // Confidence band (simplified ±1 "SE")
    const bandGen = d3.area<{ year: number; value: number }>()
      .x((d) => x(d.year))
      .y0((d) => y(Math.max(0, d.value - 1.5)))
      .y1((d) => y(d.value + 1.5))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(loessPoints)
      .attr('fill', 'rgba(212, 168, 83, 0.1)')
      .attr('d', bandGen);

    g.append('path')
      .datum(loessPoints)
      .attr('fill', 'none')
      .attr('stroke', ACCENT_GOLD)
      .attr('stroke-width', 2.5)
      .attr('d', lineGen)
      .attr('stroke-dasharray', function () {
        const len = (this as SVGPathElement).getTotalLength();
        return `${len} ${len}`;
      })
      .attr('stroke-dashoffset', function () {
        const len = (this as SVGPathElement).getTotalLength();
        return len;
      })
      .transition().duration(1200).delay(400).ease(d3.easeCubicOut)
      .attr('stroke-dashoffset', 0);

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickFormat(d3.format('d')).ticks(10))
      .call((g2) => g2.select('.domain').attr('stroke', BORDER_MEDIUM))
      .call((g2) => g2.selectAll('.tick line').attr('stroke', BORDER_LIGHT))
      .call((g2) => g2.selectAll('.tick text').attr('fill', TEXT_TERTIARY).style('font-family', 'JetBrains Mono').style('font-size', '10px'));

    g.append('g')
      .call(d3.axisLeft(y).ticks(6))
      .call((g2) => g2.select('.domain').remove())
      .call((g2) => g2.selectAll('.tick line').remove())
      .call((g2) => g2.selectAll('.tick text').attr('fill', TEXT_TERTIARY).style('font-family', 'JetBrains Mono').style('font-size', '10px'));

    // Axis labels
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -44)
      .attr('x', -innerH / 2)
      .attr('text-anchor', 'middle')
      .text('Papers Published')
      .attr('fill', TEXT_TERTIARY)
      .style('font-family', 'JetBrains Mono')
      .style('font-size', '11px')
      .style('letter-spacing', '0.02em');

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('x', innerW / 2)
      .attr('y', innerH + 40)
      .text('Year')
      .attr('fill', TEXT_TERTIARY)
      .style('font-family', 'JetBrains Mono')
      .style('font-size', '11px')
      .style('letter-spacing', '0.02em');

    // Key year annotations
    KEY_YEARS.forEach((ky) => {
      const xPos = x(ky.year);
      if (xPos < 0 || xPos > innerW) return;

      g.append('line')
        .attr('x1', xPos).attr('x2', xPos)
        .attr('y1', 0).attr('y2', innerH)
        .attr('stroke', ky.color)
        .attr('stroke-dasharray', '3,3')
        .attr('stroke-width', 1)
        .attr('opacity', 0.5);

      g.append('circle')
        .attr('cx', xPos).attr('cy', -18)
        .attr('r', 5)
        .attr('fill', ky.color)
        .attr('opacity', 0.85);

      g.append('text')
        .attr('x', xPos + 8)
        .attr('y', -14)
        .text(`${ky.year} ${ky.label}`)
        .attr('fill', ky.color)
        .style('font-family', 'JetBrains Mono')
        .style('font-size', '8px')
        .style('font-weight', '500');
    });

    // Legend
    const legend = g.append('g').attr('transform', `translate(${innerW - 120}, -20)`);
    legend.append('rect').attr('width', 14).attr('height', 8).attr('rx', 2).attr('fill', ACCENT_GOLD).attr('opacity', 0.75);
    legend.append('text').attr('x', 18).attr('y', 7).text('Papers').attr('fill', TEXT_SECONDARY).style('font-family', 'JetBrains Mono').style('font-size', '9px');
    legend.append('line').attr('x1', 0).attr('x2', 14).attr('y1', 18).attr('y2', 18).attr('stroke', ACCENT_GOLD).attr('stroke-width', 2.5);
    legend.append('text').attr('x', 18).attr('y', 21).text('Trend (LOESS)').attr('fill', TEXT_SECONDARY).style('font-family', 'JetBrains Mono').style('font-size', '9px');
  }, [data]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  const handleExportCSV = () => {
    if (!data) return;
    const rows = data.year_distribution.map((d) => ({ year: d.year, count: d.count }));
    downloadCSV(rows, 'year_distribution.csv');
  };

  return (
    <div className="relative bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] p-space-6 mt-space-8" ref={containerRef}>
      <div className="flex items-center justify-between mb-space-4">
        <h3 className="heading-4 font-serif text-accent-indigo">Papers per Year (1994–2026)</h3>
        <div className="flex items-center gap-1">
          <button onClick={() => downloadPNG(svgRef.current, 'year_distribution.png')} className="w-8 h-8 rounded-md border border-border-light flex items-center justify-center text-text-secondary hover:text-accent-indigo hover:bg-surface-elevated transition-colors" title="Export PNG"><FileImage size={14} /></button>
          <button onClick={() => downloadSVG(svgRef.current, 'year_distribution.svg')} className="w-8 h-8 rounded-md border border-border-light flex items-center justify-center text-text-secondary hover:text-accent-indigo hover:bg-surface-elevated transition-colors" title="Export SVG"><FileCode size={14} /></button>
          <button onClick={handleExportCSV} className="w-8 h-8 rounded-md border border-border-light flex items-center justify-center text-text-secondary hover:text-accent-indigo hover:bg-surface-elevated transition-colors" title="Export CSV"><FileSpreadsheet size={14} /></button>
        </div>
      </div>
      <svg ref={svgRef} style={{ width: '100%', height: 380 }} />
      <div ref={tooltipRef} className="absolute pointer-events-none bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] p-space-3 opacity-0 transition-opacity z-elevated" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Decade Summary                                                     */
/* ------------------------------------------------------------------ */
function DecadeSummary({ data }: { data: AnalysisData }) {
  const decades = [
    { key: '1990s', label: '1990s', count: data.decade_distribution['1990s'] ?? 0 },
    { key: '2000s', label: '2000s', count: data.decade_distribution['2000s'] ?? 0 },
    { key: '2010s', label: '2010s', count: data.decade_distribution['2010s'] ?? 0 },
    { key: '2020s', label: '2020s', count: data.decade_distribution['2020s'] ?? 0 },
  ];

  const maxCount = Math.max(...decades.map((d) => d.count), 1);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-space-4 mt-space-8">
      {decades.map((dec) => (
        <div key={dec.key} className="bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] p-space-5">
          <div className="font-mono font-bold text-accent-indigo" style={{ fontSize: 'clamp(24px, 2.5vw, 40px)' }}>
            {dec.count}
          </div>
          <div className="label text-text-tertiary mt-space-1">{dec.label}</div>
          <div className="mt-space-3 w-full bg-border-light rounded-full" style={{ height: 6 }}>
            <div
              className="bg-accent-gold rounded-full transition-all duration-700"
              style={{ height: 6, width: `${(dec.count / maxCount) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Section                                                       */
/* ------------------------------------------------------------------ */
export default function JournalSection() {
  const sectionRef = useScrollAnimation<HTMLElement>();
  const [data, setData] = useState<AnalysisData | null>(null);

  useEffect(() => {
    loadData().then(setData);
  }, []);

  if (!data) {
    return (
      <section id="journals" ref={sectionRef} className="w-full bg-warm-gray py-space-24">
        <div className="section-container">
          <div className="scroll-animate mb-space-6"><span className="label text-accent-gold tracking-[0.08em]">ANALYSIS 06</span></div>
          <h2 className="scroll-animate heading-1 font-serif text-accent-indigo mb-space-4">Publication Landscape</h2>
          <div className="flex items-center justify-center min-h-[400px]"><span className="mono text-text-tertiary">Loading data...</span></div>
        </div>
      </section>
    );
  }

  return (
    <section id="journals" ref={sectionRef} className="w-full bg-warm-gray py-space-24">
      <div className="section-container">
        <div className="scroll-animate mb-space-6">
          <span className="label text-accent-gold tracking-[0.08em]">ANALYSIS 06</span>
        </div>
        <h2 className="scroll-animate heading-1 font-serif text-accent-indigo mb-space-4">
          Publication Landscape
        </h2>
        <p className="scroll-animate body-lg text-text-secondary mb-space-12 max-w-3xl">
          Where and when this research was published — journal venues and temporal distribution across three decades
        </p>

        {/* Journal Bar Chart */}
        <div className="scroll-animate">
          <JournalBarChart data={data} />
        </div>

        {/* Year Histogram */}
        <div className="scroll-animate">
          <YearHistogram data={data} />
        </div>

        {/* Decade Summary */}
        <div className="scroll-animate">
          <DecadeSummary data={data} />
        </div>
      </div>
    </section>
  );
}
