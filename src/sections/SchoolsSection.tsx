import { useRef, useEffect, useState } from 'react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { SCHOOL_COLORS } from '@/lib/colors';
import * as d3 from 'd3';

interface School {
  id: number;
  name: string;
  papers: number;
  citations: string;
  keyFigures: string;
  tags: string[];
  description: string;
  yearRange: string;
}

const SCHOOLS: School[] = [
  {
    id: 1,
    name: 'Foundations & Graph Theory',
    papers: 47,
    citations: '~122K',
    keyFigures: 'Sporns, Bullmore, Rubinov',
    tags: ['Small-world', 'Efficiency', 'Graph Theory'],
    description:
      'Laid the mathematical foundations of network neuroscience, establishing graph-theoretic metrics for analyzing brain connectivity.',
    yearRange: '1994–2026',
  },
  {
    id: 2,
    name: 'Resting-State fMRI & Default Mode',
    papers: 24,
    citations: '~42K',
    keyFigures: 'Raichle, Greicius, Biswal',
    tags: ['DMN', 'ICA', 'Seed-based FC'],
    description:
      'Characterized intrinsic brain networks and the default mode network\'s role in cognition and disease.',
    yearRange: '2001–2026',
  },
  {
    id: 3,
    name: 'Structural Connectivity & dMRI',
    papers: 23,
    citations: '~15K',
    keyFigures: 'Hagmann, Behrens, Jeurissen',
    tags: ['DTI', 'Tractography', 'White matter'],
    description:
      'Mapped white matter pathways using diffusion MRI, linking structural architecture to function.',
    yearRange: '2005–2026',
  },
  {
    id: 4,
    name: 'Dynamic FC & Brain States',
    papers: 25,
    citations: '~11K',
    keyFigures: 'Calhoun, Allen, Damaraju',
    tags: ['Time-varying', 'States', 'Flexibility'],
    description:
      'Demonstrated that functional connectivity varies over time, revealing dynamic brain states.',
    yearRange: '2012–2026',
  },
  {
    id: 5,
    name: 'Clinical Applications',
    papers: 25,
    citations: '~20K',
    keyFigures: 'Fornito, Crossley',
    tags: ['Disorders', 'Biomarkers', 'Psychopathology'],
    description:
      'Applied network neuroscience to psychiatric and neurological disorders, identifying connectivity biomarkers.',
    yearRange: '2009–2026',
  },
  {
    id: 6,
    name: 'Hubs, Rich-Club & Gradients',
    papers: 25,
    citations: '~23K',
    keyFigures: 'van den Heuvel, Margulies',
    tags: ['Network hubs', 'Gradients', 'Rich-club'],
    description:
      'Identified connector hubs and organizational gradients in brain networks.',
    yearRange: '2008–2026',
  },
  {
    id: 7,
    name: 'Precision Mapping & Individual Differences',
    papers: 25,
    citations: '~9K',
    keyFigures: 'Finn, Gordon, Laumann',
    tags: ['Fingerprinting', 'Individual', 'HCP'],
    description:
      'Pioneered methods for mapping individual-specific functional connectivity.',
    yearRange: '2015–2026',
  },
  {
    id: 8,
    name: 'Methods, Tools & Parcellations',
    papers: 25,
    citations: '~15K',
    keyFigures: 'Schaefer, Ciric, Kong',
    tags: ['Preprocessing', 'Atlases', 'Quality control'],
    description:
      'Developed preprocessing pipelines, parcellations, and validation frameworks.',
    yearRange: '2011–2026',
  },
  {
    id: 9,
    name: 'Recent Advances (arXiv)',
    papers: 25,
    citations: '~0',
    keyFigures: '—',
    tags: ['GNNs', 'Koopman', 'Multimodal'],
    description:
      'Emerging methods: graph neural networks, operator theory, and multimodal fusion approaches.',
    yearRange: '2022–2026',
  },
];

/* ------------------------------------------------------------------ */
/*  MINI DONUT CHART (D3)                                              */
/* ------------------------------------------------------------------ */

function MiniDonutChart() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const container = ref.current;
    container.innerHTML = '';

    const width = 220;
    const height = 220;
    const radius = Math.min(width, height) / 2 - 10;
    const innerRadius = radius * 0.55;

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`);

    const g = svg
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);

    const pie = d3
      .pie<number>()
      .value((d) => d)
      .sort(null)
      .padAngle(0.02);

    const arc = d3.arc<d3.PieArcDatum<number>>().innerRadius(innerRadius).outerRadius(radius);

    const data = SCHOOLS.map((s) => s.papers);
    const arcs = pie(data);

    // Background circle
    g.append('circle').attr('r', radius).attr('fill', 'none').attr('stroke', '#E5E2DC').attr('stroke-width', 1);

    // Segments
    g.selectAll('path')
      .data(arcs)
      .join('path')
      .attr('fill', (_, i) => SCHOOL_COLORS[i])
      .attr('d', arc as any)
      .attr('opacity', 0)
      .transition()
      .duration(600)
      .delay((_, i) => i * 80)
      .attr('opacity', 0.9);

    // Center text
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.2em')
      .attr('class', 'font-mono')
      .style('font-size', '22px')
      .style('font-weight', 700)
      .style('fill', '#1A1B3A')
      .text('244');

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1.3em')
      .attr('class', 'font-mono')
      .style('font-size', '10px')
      .style('fill', '#8B8DA3')
      .style('letter-spacing', '0.04em')
      .text('PAPERS');

    return () => {
      container.innerHTML = '';
    };
  }, []);

  return <div ref={ref} className="flex items-center justify-center" />;
}

/* ------------------------------------------------------------------ */
/*  SCHOOL CARD                                                        */
/* ------------------------------------------------------------------ */

function SchoolCard({ school, index }: { school: School; index: number }) {
  const color = SCHOOL_COLORS[index];
  const [hovered, setHovered] = useState(false);

  // Mini bar width percentage relative to max (47 papers)
  const barWidth = (school.papers / 47) * 100;

  return (
    <div
      className="scroll-animate bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px] p-space-6 transition-all duration-200 cursor-pointer"
      style={{
        borderTopWidth: '4px',
        borderTopColor: color,
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Color dot + paper count row */}
      <div className="flex items-center justify-between mb-space-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-4 h-4 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="mono text-text-secondary">
            {school.papers} papers
          </span>
        </div>
        <span className="mono-sm text-text-tertiary">{school.yearRange}</span>
      </div>

      {/* School name */}
      <h3 className="heading-3 font-serif text-accent-indigo mb-space-2">
        {school.name}
      </h3>

      {/* Citations + Key figures */}
      <div className="flex items-center gap-2 mb-space-3">
        <span className="mono text-accent-gold font-medium">{school.citations}</span>
        <span className="mono-sm text-text-tertiary">citations</span>
      </div>

      {/* Mini relative size bar */}
      <div className="w-full h-2 bg-warm-gray rounded-full mb-space-3 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${barWidth}%`, backgroundColor: color, opacity: 0.8 }}
        />
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 mb-space-3">
        {school.tags.map((tag) => (
          <span
            key={tag}
            className="inline-block bg-[rgba(212,168,83,0.10)] border border-[#D4A853] text-[#B8860B] rounded-[2px] px-2 py-0.5 text-[12px] font-mono font-medium"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Key figures */}
      <p className="mono-sm text-text-secondary mb-space-2">
        <span className="text-text-tertiary">Key: </span>
        {school.keyFigures}
      </p>

      {/* Description */}
      <p className="body-sm text-text-secondary leading-relaxed">
        {school.description}
      </p>

      {/* Explore link */}
      <div className="mt-space-4 pt-space-3 border-t border-border-light">
        <span className="font-mono text-[12px] text-accent-indigo hover:underline cursor-pointer transition-all duration-200">
          Explore &rarr;
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MAIN SECTION                                                       */
/* ------------------------------------------------------------------ */

export default function SchoolsSection() {
  const sectionRef = useScrollAnimation<HTMLElement>({
    selector: '.scroll-animate',
    stagger: 0.07,
    y: 25,
    duration: 0.5,
  });

  return (
    <section
      id="schools"
      ref={sectionRef}
      className="w-full bg-off-white py-space-24"
    >
      <div className="section-container">
        {/* Section Header */}
        <div className="scroll-animate mb-space-6">
          <span className="label text-accent-gold tracking-[0.08em]">
            ANALYSIS 01
          </span>
        </div>
        <h2 className="scroll-animate heading-1 font-serif text-accent-indigo mb-space-4">
          Schools of Thought
        </h2>
        <p className="scroll-animate body-lg text-text-secondary mb-space-12 max-w-3xl">
          Nine research communities identified via Louvain modularity optimization (Q = 0.08)
        </p>

        {/* Donut chart + stats row */}
        <div className="scroll-animate flex flex-col lg:flex-row items-center gap-space-8 mb-space-12 p-space-6 bg-[#FAF9F6] border border-[#E7E3DB] rounded-[4px]">
          <MiniDonutChart />
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-space-4">
            {SCHOOLS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: SCHOOL_COLORS[i] }}
                />
                <div className="flex flex-col">
                  <span className="font-mono text-[11px] text-text-primary font-medium leading-tight">
                    {s.name.length > 22 ? s.name.slice(0, 22) + '...' : s.name}
                  </span>
                  <span className="font-mono text-[10px] text-text-tertiary">
                    {s.papers} papers
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* School Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-space-6">
          {SCHOOLS.map((school, i) => (
            <SchoolCard key={school.id} school={school} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
