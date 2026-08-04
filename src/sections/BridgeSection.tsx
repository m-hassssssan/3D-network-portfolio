import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { cn } from '@/lib/utils';
import { FileImage, FileCode, FileSpreadsheet, ArrowUpDown } from 'lucide-react';

import { SCHOOL_COLORS } from '@/lib/colors';

/* ------------------------------------------------------------------ */
/*  Design tokens                                                      */
/* ------------------------------------------------------------------ */
const SCHOOL_SHORT = [
  'FND', 'fMRI', 'STR', 'DYN', 'CLN', 'HUB', 'PRS', 'MTH', 'arX',
];

interface AnalysisData {
  modularity_q: number;
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
  coauthorship: {
    top_authors: Array<{
      name: string;
      paper_count: number;
      school_affiliation?: number;
      papers?: string[];
    }>;
    collaboration_edges: Array<{
      source: string;
      target: string;
      shared_papers: number;
    }>;
  };
  communities: Record<string, { name: string }>;
  community_evolution: Record<string, { name: string }>;
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

/* ------------------------------------------------------------------ */
/*  Bridge Papers Table                                                */
/* ------------------------------------------------------------------ */
type SortKey = 'betweenness' | 'cross_community_edges' | 'citations' | 'year' | 'title';
type SortDir = 'asc' | 'desc';

function BridgePapersTable({ bridgePapers }: { bridgePapers: AnalysisData['bridge_papers'] }) {
  const [sortKey, setSortKey] = useState<SortKey>('betweenness');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    const rows = [...bridgePapers].slice(0, 15);
    rows.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === 'string' && typeof vb === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return rows;
  }, [bridgePapers, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => (
    <ArrowUpDown size={11} className={cn('inline ml-1 transition-colors', sortKey === col ? 'text-accent-indigo' : 'text-text-tertiary')} />
  );

  const handleExportCSV = () => {
    const rows = sorted.map((p) => ({
      title: p.title,
      authors: p.authors,
      year: p.year,
      betweenness: p.betweenness.toFixed(6),
      cross_community_edges: p.cross_community_edges,
      citations: p.citations,
    }));
    if (!rows.length) return;
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(','), ...rows.map((r) => keys.map((k) => `"${String(r[k as keyof typeof r]).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bridge_papers.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] p-space-6">
      <div className="flex items-center justify-between mb-space-4">
        <h3 className="heading-4 font-serif text-accent-indigo">Bridge Papers — Top 15 by Betweenness Centrality</h3>
        <button onClick={handleExportCSV} className="w-8 h-8 rounded-md border border-border-light flex items-center justify-center text-text-secondary hover:text-accent-indigo hover:bg-surface-elevated transition-colors" title="Export CSV">
          <FileSpreadsheet size={14} />
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-surface-elevated border-b-2 border-border-medium">
              <th className="text-left px-3 py-2.5 font-mono text-[11px] font-semibold text-accent-indigo tracking-wide">Rank</th>
              <th className="text-left px-3 py-2.5 font-mono text-[11px] font-semibold text-accent-indigo tracking-wide cursor-pointer hover:text-accent-indigo-light" onClick={() => toggleSort('title')}>
                Paper <SortIcon col="title" />
              </th>
              <th className="text-left px-3 py-2.5 font-mono text-[11px] font-semibold text-accent-indigo tracking-wide">Authors</th>
              <th className="text-left px-3 py-2.5 font-mono text-[11px] font-semibold text-accent-indigo tracking-wide cursor-pointer hover:text-accent-indigo-light" onClick={() => toggleSort('year')}>
                Year <SortIcon col="year" />
              </th>
              <th className="text-left px-3 py-2.5 font-mono text-[11px] font-semibold text-accent-indigo tracking-wide cursor-pointer hover:text-accent-indigo-light" onClick={() => toggleSort('betweenness')}>
                Betweenness <SortIcon col="betweenness" />
              </th>
              <th className="text-left px-3 py-2.5 font-mono text-[11px] font-semibold text-accent-indigo tracking-wide cursor-pointer hover:text-accent-indigo-light" onClick={() => toggleSort('cross_community_edges')}>
                Cross-Community Edges <SortIcon col="cross_community_edges" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, idx) => {
              const commIdx = SCHOOL_SHORT.findIndex((_, i) => p.community === SCHOOL_COLORS[i]) >= 0
                ? SCHOOL_SHORT.findIndex((_, i) => p.community === SCHOOL_COLORS[i])
                : idx % 9;
              return (
                <tr
                  key={p.id}
                  className={cn(
                    'border-b border-border-light transition-colors duration-150',
                    idx < 3 ? 'bg-[rgba(212,168,83,0.04)]' : 'bg-surface-white hover:bg-[rgba(212,168,83,0.04)]'
                  )}
                >
                  <td className="px-3 py-2.5 font-mono text-[11px] text-text-tertiary">{idx + 1}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: SCHOOL_COLORS[commIdx] }} />
                      <span className="body-sm text-accent-indigo leading-snug">{p.title}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 mono text-text-secondary max-w-[200px] truncate">{p.authors}</td>
                  <td className="px-3 py-2.5 mono text-text-secondary">{p.year}</td>
                  <td className="px-3 py-2.5 mono text-accent-indigo font-medium">{p.betweenness.toFixed(4)}</td>
                  <td className="px-3 py-2.5 mono text-text-secondary">{p.cross_community_edges}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mono-sm text-text-tertiary mt-space-3 italic">
        Bridge papers connect two or more research communities. Ranked by betweenness centrality — a measure of how often a paper lies on the shortest path between other papers in the network.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Co-Authorship Network (force-directed)                             */
/* ------------------------------------------------------------------ */
interface CoAuthNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  paperCount: number;
  school: number;
  radius: number;
}

interface CoAuthLink extends d3.SimulationLinkDatum<CoAuthNode> {
  source: string | CoAuthNode;
  target: string | CoAuthNode;
  weight: number;
}

function CoAuthorshipNetwork({ data }: { data: AnalysisData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    if (!containerRef.current || !svgRef.current || !data) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const rect = containerRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = 450;

    svg.attr('width', width).attr('height', height);

    const authors = data.coauthorship.top_authors.slice(0, 20);
    const allEdges = data.coauthorship.collaboration_edges;

    const nodes: CoAuthNode[] = authors.map((a, i) => ({
      id: a.name,
      name: a.name,
      paperCount: a.paper_count,
      school: a.school_affiliation ?? (i % 9),
      radius: Math.sqrt(a.paper_count) * 3.5 + 6,
    }));

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    const links: CoAuthLink[] = allEdges
      .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        weight: e.shared_papers,
      }));

    const g = svg.append('g');

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    svg.call(zoom);

    const simulation = d3.forceSimulation<CoAuthNode>(nodes)
      .force('link', d3.forceLink<CoAuthNode, CoAuthLink>(links).id((d) => d.id).distance(80).strength(0.5))
      .force('charge', d3.forceManyBody<CoAuthNode>().strength(-180))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<CoAuthNode>().radius((d) => d.radius + 4))
      .force('x', d3.forceX(width / 2).strength(0.05))
      .force('y', d3.forceY(height / 2).strength(0.05));

    // Links
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#D0CCC4')
      .attr('stroke-opacity', 0.5)
      .attr('stroke-width', (d) => Math.sqrt(d.weight) * 0.8 + 0.5);

    // Nodes
    const node = g.append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', (d) => d.radius)
      .attr('fill', (d) => SCHOOL_COLORS[d.school] ?? '#999')
      .attr('stroke', '#FFFFFF')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .call(
        d3.drag<SVGCircleElement, CoAuthNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }) as any
      )
      .on('mouseover', function (event, d) {
        d3.select(this).attr('stroke-width', 3).attr('stroke', '#1A1B3A');

        // Highlight connected links
        link.attr('stroke-opacity', (l) => {
          const s = typeof l.source === 'string' ? l.source : l.source.id;
          const t = typeof l.target === 'string' ? l.target : l.target.id;
          return s === d.id || t === d.id ? 1 : 0.08;
        }).attr('stroke', (l) => {
          const s = typeof l.source === 'string' ? l.source : l.source.id;
          const t = typeof l.target === 'string' ? l.target : l.target.id;
          return s === d.id || t === d.id ? '#D4A853' : '#D0CCC4';
        });

        node.attr('opacity', (n) => {
          if (n.id === d.id) return 1;
          const connected = links.some((l) => {
            const s = typeof l.source === 'string' ? l.source : l.source.id;
            const t = typeof l.target === 'string' ? l.target : l.target.id;
            return (s === d.id && t === n.id) || (t === d.id && s === n.id);
          });
          return connected ? 1 : 0.15;
        });

        const tooltip = d3.select(tooltipRef.current);
        tooltip.style('opacity', 1);
        tooltip.html(`
          <div style="font-family:'JetBrains Mono';font-size:11px">
            <div style="font-weight:600;color:#1A1B3A;margin-bottom:2px">${d.name}</div>
            <div style="color:#5A5C7A">Papers: <span style="font-weight:600;color:#1A1B3A">${d.paperCount}</span></div>
          </div>
        `);
        const ttRect = tooltipRef.current?.getBoundingClientRect();
        const contRect = containerRef.current?.getBoundingClientRect();
        if (ttRect && contRect) {
          tooltip.style('left', `${event.pageX - contRect.left + 12}px`).style('top', `${event.pageY - contRect.top - 12}px`);
        }
      })
      .on('mouseout', function () {
        d3.select(this).attr('stroke-width', 2).attr('stroke', '#FFFFFF');
        link.attr('stroke-opacity', 0.5).attr('stroke', '#D0CCC4');
        node.attr('opacity', 1);
        d3.select(tooltipRef.current).style('opacity', 0);
      });

    // Labels (for nodes with >= 3 papers)
    const labels = g.append('g')
      .selectAll('text')
      .data(nodes.filter((d) => d.paperCount >= 3))
      .join('text')
      .text((d) => d.name.split(' ').slice(1).join(' ') || d.name)
      .attr('font-family', 'JetBrains Mono')
      .attr('font-size', '9px')
      .attr('fill', '#1A1B3A')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => d.radius + 12)
      .style('pointer-events', 'none')
      .style('text-shadow', '0 1px 2px rgba(255,255,255,0.8)');

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (typeof d.source !== 'string' ? d.source.x ?? 0 : 0))
        .attr('y1', (d) => (typeof d.source !== 'string' ? d.source.y ?? 0 : 0))
        .attr('x2', (d) => (typeof d.target !== 'string' ? d.target.x ?? 0 : 0))
        .attr('y2', (d) => (typeof d.target !== 'string' ? d.target.y ?? 0 : 0));

      node
        .attr('cx', (d) => d.x ?? 0)
        .attr('cy', (d) => d.y ?? 0);

      labels
        .attr('x', (d) => d.x ?? 0)
        .attr('y', (d) => d.y ?? 0);
    });

    return () => {
      simulation.stop();
    };
  }, [data]);

  useEffect(() => {
    const cleanup = draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (cleanup) cleanup();
    };
  }, [draw]);

  return (
    <div className="relative bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] p-space-6" ref={containerRef}>
      <div className="flex items-center justify-between mb-space-4">
        <h3 className="heading-4 font-serif text-accent-indigo">Co-Authorship Network (Top 20 Authors)</h3>
        <div className="flex items-center gap-1">
          <button onClick={() => downloadPNG(svgRef.current, 'coauthorship_network.png')} className="w-8 h-8 rounded-md border border-border-light flex items-center justify-center text-text-secondary hover:text-accent-indigo hover:bg-surface-elevated transition-colors" title="Export PNG"><FileImage size={14} /></button>
          <button onClick={() => downloadSVG(svgRef.current, 'coauthorship_network.svg')} className="w-8 h-8 rounded-md border border-border-light flex items-center justify-center text-text-secondary hover:text-accent-indigo hover:bg-surface-elevated transition-colors" title="Export SVG"><FileCode size={14} /></button>
        </div>
      </div>
      <svg ref={svgRef} style={{ width: '100%', height: 450 }} />
      <div ref={tooltipRef} className="absolute pointer-events-none bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] p-space-3 opacity-0 transition-opacity z-elevated" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Institution Chord Diagram (stub)                                   */
/* ------------------------------------------------------------------ */
function InstitutionChordStub() {
  return (
    <div className="bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] p-space-6 flex flex-col items-center justify-center" style={{ minHeight: 450 }}>
      <h3 className="heading-4 font-serif text-accent-indigo mb-space-4 self-start">Institution Collaboration Network</h3>
      <div className="text-center max-w-md">
        <svg width="80" height="80" viewBox="0 0 80 80" className="mx-auto mb-space-4 opacity-30">
          <circle cx="40" cy="40" r="32" fill="none" stroke="#1A1B3A" strokeWidth="1.5" />
          <circle cx="40" cy="40" r="20" fill="none" stroke="#D4A853" strokeWidth="1" />
          <path d="M40 8 Q72 40 40 72 Q8 40 40 8" fill="none" stroke="#1A1B3A" strokeWidth="0.8" opacity="0.5" />
        </svg>
        <p className="body text-text-secondary mb-space-3">
          Institution-level collaboration data requires affiliation parsing.
        </p>
        <p className="mono-sm text-text-tertiary">
          Displaying top author collaborations instead — see the Co-Authorship Network for collaboration patterns between researchers.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Section                                                       */
/* ------------------------------------------------------------------ */
export default function BridgeSection() {
  const sectionRef = useScrollAnimation<HTMLElement>();
  const [data, setData] = useState<AnalysisData | null>(null);

  useEffect(() => {
    loadData().then(setData);
  }, []);

  if (!data) {
    return (
      <section id="bridges" ref={sectionRef} className="w-full bg-off-white py-space-24">
        <div className="section-container">
          <div className="scroll-animate mb-space-6"><span className="label text-accent-gold tracking-[0.08em]">ANALYSIS 05</span></div>
          <h2 className="scroll-animate heading-1 font-serif text-accent-indigo mb-space-4">Bridge Papers &amp; Collaboration Networks</h2>
          <div className="flex items-center justify-center min-h-[400px]"><span className="mono text-text-tertiary">Loading data...</span></div>
        </div>
      </section>
    );
  }

  return (
    <section id="bridges" ref={sectionRef} className="w-full bg-off-white py-space-24">
      <div className="section-container">
        <div className="scroll-animate mb-space-6">
          <span className="label text-accent-gold tracking-[0.08em]">ANALYSIS 05</span>
        </div>
        <h2 className="scroll-animate heading-1 font-serif text-accent-indigo mb-space-4">
          Bridge Papers &amp; Collaboration Networks
        </h2>
        <p className="scroll-animate body-lg text-text-secondary mb-space-12 max-w-3xl">
          Papers and authors that span multiple research communities
        </p>

        {/* Bridge Papers Table */}
        <div className="scroll-animate mb-space-8">
          <BridgePapersTable bridgePapers={data.bridge_papers} />
        </div>

        {/* Co-Authorship Network + Institution Chord */}
        <div className="scroll-animate grid grid-cols-1 lg:grid-cols-2 gap-space-6">
          <CoAuthorshipNetwork data={data} />
          <InstitutionChordStub />
        </div>
      </div>
    </section>
  );
}
