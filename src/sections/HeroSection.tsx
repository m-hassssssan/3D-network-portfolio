import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';

import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { forceCollide, forceCenter } from 'd3-force';
import { SCHOOL_COLORS, SCHOOL_NAMES } from '@/lib/colors';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface NetworkNode {
  id: string; title: string; authors: string; year: number;
  journal: string; citations: number; community: number;
  community_name: string; abstract: string; doi: string;
  keywords: string[]; val: number;
  link_url?: string; link_type?: string;
  x?: number; y?: number; z?: number;
  fx?: number; fy?: number; fz?: number;
}
interface NetworkEdge { source: string; target: string; value: number; weight?: number; }
interface NetworkData { nodes: NetworkNode[]; links: NetworkEdge[]; }

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function getFirstAuthor(authors: string): string {
  if (!authors) return 'Unknown';
  return authors.split(',')[0]?.trim() || 'Unknown';
}

function makeStarTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0.00, 'rgba(255,255,255,1.00)');
  g.addColorStop(0.15, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.40, 'rgba(255,255,255,0.25)');
  g.addColorStop(1.00, 'rgba(255,255,255,0.00)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}
const STAR_TEXTURE = makeStarTexture();

function StatItem({ value, label, tip }: { value: string | number; label: string; tip?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="text-center relative" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} style={{ cursor: 'default' }}>
      <div className="font-mono text-[16px] font-bold" style={{ color: '#D4A853' }}>{value}</div>
      <div className="font-mono text-[9px] uppercase tracking-[0.06em]" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</div>
      {show && tip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 font-mono text-[10px] rounded-lg px-3 py-2 z-50"
          style={{ width: 200, background: 'rgba(10,10,20,0.92)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', whiteSpace: 'normal', lineHeight: 1.4 }}>
          {tip}
        </div>
      )}
    </div>
  );
}

function getNodeColor(n: NetworkNode, mode: string, top5Threshold: number): string {
  if (n.citations >= top5Threshold) return '#FFF6D8';
  if (mode === 'school') return SCHOOL_COLORS[n.community] || '#888';
  if (mode === 'year') {
    const y = n.year;
    if (y <= 2000) return '#3B6FC4';
    if (y <= 2006) return '#5B8C7B';
    if (y <= 2012) return '#6E8C5B';
    if (y <= 2018) return '#B89A4A';
    if (y <= 2024) return '#B07A4A';
    return '#8C5B7B';
  }
  let hash = 0;
  for (let i = 0; i < n.journal.length; i++) hash = n.journal.charCodeAt(i) + ((hash << 5) - hash);
  const cs = ['#4A5A8C', '#5B8C7B', '#6E8C5B', '#8C5B7B', '#B07A4A', '#4A6E8C', '#B89A4A', '#4A8C8C', '#6E5B8C'];
  return cs[Math.abs(hash) % cs.length];
}

/* ------------------------------------------------------------------ */
/*  Three.js starfield (Points)                                        */
/* ------------------------------------------------------------------ */
function createStarfield(scene: THREE.Scene) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(2500 * 3);
  const colors = new Float32Array(2500 * 3);
  const palette = [new THREE.Color('#FFFAFA'), new THREE.Color('#FFF8DC'), new THREE.Color('#CDDCFF')];
  for (let i = 0; i < 2500; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 1800 + Math.random() * 3600;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    const c = palette[Math.floor(Math.random() * palette.length)];
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 1.0, vertexColors: true, transparent: true, opacity: 0.55, sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false });
  scene.add(new THREE.Points(geo, mat));
}



/* ------------------------------------------------------------------ */
/*  MAIN HERO SECTION                                                  */
/* ------------------------------------------------------------------ */
type ColorMode = 'school' | 'year' | 'journal';

export default function HeroSection() {
  const [rawData, setRawData] = useState<NetworkData | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>('school');
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [hoveredSchool, setHoveredSchool] = useState<number | null>(null);
  const [focusedSchool, setFocusedSchool] = useState<number | null>(null);
  const [entrancePhase, setEntrancePhase] = useState(-1);
  const [graphReady, setGraphReady] = useState(false);
  const [graphError, setGraphError] = useState(false);
  const [hoveredPill, setHoveredPill] = useState<string | null>(null);
  const [showDistTip, setShowDistTip] = useState(false);
  const [activeDrawer, setActiveDrawer] = useState<string | null>(null);
  const [mobileLegendOpen, setMobileLegendOpen] = useState(false);
  const [showMobileNotice, setShowMobileNotice] = useState(true);

  // Hub 3D positions indexed by drawer key — populated after engine stop
  const hubPositionsRef = useRef<Record<string, { x: number; y: number; z: number }>>({});

  // Real-time working FPS counter
  const [fps, setFps] = useState<number>(60);

  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animId: number;

    const tick = () => {
      frameCount++;
      const now = performance.now();
      const delta = now - lastTime;
      if (delta >= 500) {
        setFps(Math.round((frameCount * 1000) / delta));
        frameCount = 0;
        lastTime = now;
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);
  const showAboutMe = activeDrawer === 'aboutMe';
  const showWork = activeDrawer === 'work';
  const showServices = activeDrawer === 'services';
  const sectionRef = useRef<HTMLElement>(null);
  const fgApiRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusedColorGroup, setFocusedColorGroup] = useState<number | null>(null);
  const isDragRotationRef = useRef(false);

  // Entrance animation
  useEffect(() => {
    fetch('./network_data.json').then(r => r.json()).then((d: NetworkData) => setRawData(d)).catch((e) => { console.error('Failed to load data:', e); setGraphError(true); });
    for (let i = 0; i <= 7; i++) setTimeout(() => setEntrancePhase(i), i * 100);
  }, []);

  // Wheel scroll blocker
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const block = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', block, { passive: false });
    return () => el.removeEventListener('wheel', block);
  }, []);

  // Dynamic import + mount ForceGraph3D
  useEffect(() => {
    if (!rawData || !containerRef.current) return;
    let isMounted = true;
    let root: any = null;

    async function init() {
      try {
        if (!rawData) return;
        const ForceGraph3DMod = await import('react-force-graph-3d');
        const ForceGraph3D = ForceGraph3DMod.default || (ForceGraph3DMod as any);
        if (!ForceGraph3D || !isMounted || !containerRef.current) return;

        const React = await import('react');
        const ReactDOM = await import('react-dom/client');

        const data = normalizeData(rawData);

        // All 9 portfolio section labels anchored to distant, non-overlapping hub branches across the network
        const PORTFOLIO_MAPPINGS = [
          { key: 'aboutMe', title: 'About Me ↗', comm: 2, hubIndex: 0, color: '#FFD03A' }, // Top-Right Hub
          { key: 'work', title: 'Work ↗', comm: 0, hubIndex: 0, color: '#FF2B55' }, // Bottom Web Ball Hub
          { key: 'projects', title: 'Projects ↗', comm: 1, hubIndex: 0, color: '#2EC4B6' }, // Center Core Hub
          { key: 'services', title: 'Services ↗', comm: 3, hubIndex: 0, color: '#3AC1FF' }, // Far Left Core Hub
          { key: 'experience', title: 'Experience ↗', comm: 4, hubIndex: 5, color: '#FF8C42' }, // Far Right Branch Hub (SEPARATED FROM PROJECTS & PUBLICATIONS)
          { key: 'publications', title: 'Publications ↗', comm: 5, hubIndex: 6, color: '#4488FF' }, // Upper Top-Left Branch Hub (SEPARATED FROM PROJECTS & EXPERIENCE)
          { key: 'skills', title: 'Skills ↗', comm: 6, hubIndex: 0, color: '#FFD93D' }, // Far Right Core Hub
          { key: 'contact', title: 'Contact ↗', comm: 8, hubIndex: 0, color: '#A855F7' }, // Upper-Left Core Hub
        ];

        const usedNodeIds = new Set<string>();

        PORTFOLIO_MAPPINGS.forEach(m => {
          const commNodes = data.nodes
            .filter(n => n.community === m.comm && !usedNodeIds.has(n.id))
            .sort((a, b) => b.citations - a.citations);

          const hubPaper = commNodes[m.hubIndex] || commNodes[0] || data.nodes.find(n => !usedNodeIds.has(n.id));
          if (hubPaper) {
            usedNodeIds.add(hubPaper.id);
            (hubPaper as any).portfolioLabel = m;
          }
        });

        const isMobileDevice = typeof window !== 'undefined' && window.innerWidth < 768;
        const sortedLinks = [...data.links].sort((a, b) => (b.value || b.weight || 0) - (a.value || a.weight || 0));
        const maxLinks = isMobileDevice ? 45 : 700;
        const TOP_LINKS = sortedLinks.slice(0, maxLinks);

        const renderNodes = isMobileDevice
          ? data.nodes.filter(n => (n as any).portfolioLabel || n.citations >= top5Threshold)
          : [...data.nodes];

        const validNodeIds = new Set(renderNodes.map(n => n.id));
        const renderLinks = isMobileDevice
          ? TOP_LINKS.filter(l => {
              const s = typeof (l as any).source === 'object' ? (l as any).source.id : (l as any).source;
              const t = typeof (l as any).target === 'object' ? (l as any).target.id : (l as any).target;
              return validNodeIds.has(s) && validNodeIds.has(t);
            })
          : [...TOP_LINKS];
        const renderData = { nodes: renderNodes, links: renderLinks };

        // Neighbor lookup for click-to-highlight (O(1))
        const neighborsByNodeId = new Map<string, Set<string>>();
        const linksByNodeId = new Map<string, Set<any>>();
        for (const l of renderLinks) {
          const link = l as any;
          const s = typeof link.source === 'object' ? link.source.id : link.source;
          const t = typeof link.target === 'object' ? link.target.id : link.target;
          if (!neighborsByNodeId.has(s)) neighborsByNodeId.set(s, new Set());
          if (!neighborsByNodeId.has(t)) neighborsByNodeId.set(t, new Set());
          neighborsByNodeId.get(s)!.add(t);
          neighborsByNodeId.get(t)!.add(s);
          if (!linksByNodeId.has(s)) linksByNodeId.set(s, new Set());
          if (!linksByNodeId.has(t)) linksByNodeId.set(t, new Set());
          linksByNodeId.get(s)!.add(link);
          linksByNodeId.get(t)!.add(link);
        }

        // Association Strength (VOSviewer): s_ij = c_ij / (w_i * w_j)
        const nodeStrength = new Map<string, number>();
        for (const l of renderLinks) {
          const s = typeof (l as any).source === 'object' ? (l as any).source.id : (l as any).source;
          const t = typeof (l as any).target === 'object' ? (l as any).target.id : (l as any).target;
          const w = (l as any).value || (l as any).weight || 1;
          nodeStrength.set(s, (nodeStrength.get(s) || 0) + w);
          nodeStrength.set(t, (nodeStrength.get(t) || 0) + w);
        }
        for (const l of renderLinks) {
          const s = typeof (l as any).source === 'object' ? (l as any).source.id : (l as any).source;
          const t = typeof (l as any).target === 'object' ? (l as any).target.id : (l as any).target;
          const w = (l as any).value || (l as any).weight || 1;
          (l as any).assoc = w / ((nodeStrength.get(s) || 1) * (nodeStrength.get(t) || 1));
        }
        const assocVals = renderLinks.map((l: any) => l.assoc);
        const minA = Math.min(...assocVals); const maxA = Math.max(...assocVals);

        const fgRef: any = { current: null };

        const top5Threshold = (() => {
          const sorted = [...data.nodes].sort((a, b) => b.citations - a.citations);
          return sorted[Math.floor(sorted.length * 0.05)]?.citations ?? 0;
        })();

        const top15Ids = [...data.nodes].sort((a, b) => b.citations - a.citations).slice(0, 15).map(n => n.id);

        const allSpriteRefsByKey: Record<string, any> = {};

        const createClusterText3DSprite = (text: string, color: string, key: string) => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 1024;
            canvas.height = 256;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, 1024, 256);
              ctx.font = 'bold 88px "Logotype Frenzy", "Frenzy", "Kaushan Script", "Mr Dafoe", "Kolker Brush", cursive, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';

              // Draw a thick solid black outline to cleanly mask out network lines underneath
              ctx.strokeStyle = '#000000';
              ctx.lineWidth = 14;
              ctx.strokeText(text, 512, 128);

              // Draw crisp text with a subtle dark drop shadow instead of heavy glowing light blur
              ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
              ctx.shadowBlur = 8;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 4;
              ctx.fillStyle = color;
              ctx.fillText(text, 512, 128);

              const texture = new THREE.CanvasTexture(canvas);
              const mat = new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                depthTest: false,
                depthWrite: false,
                blending: THREE.NormalBlending,
              });
              const sprite = new THREE.Sprite(mat);
              sprite.renderOrder = 9999;
              sprite.scale.set(130, 32.5, 1);
              allSpriteRefsByKey[key] = sprite;
              return sprite;
            }
          } catch (e) {
            console.error('Failed to create 3D text sprite:', text, e);
          }
          return null;
        };

        const buildNodeThreeObject = (node: any) => {
          if (node.portfolioLabel) {
            return createClusterText3DSprite(
              node.portfolioLabel.title,
              node.portfolioLabel.color,
              node.portfolioLabel.key
            );
          }
          const n = node as NetworkNode;
          const isHub = n.citations >= top5Threshold;
          const color = isHub ? '#FFF6D8' : getNodeColor(n, colorModeRef.current, top5Threshold);
          const focus = focusedSchoolRef.current;
          const dimmed = focus !== null && focus !== undefined && n.community !== focus;
          const mat = new THREE.SpriteMaterial({
            map: STAR_TEXTURE, color: new THREE.Color(color),
            blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
            opacity: dimmed ? 0.07 : 0.95,
          });
          const sprite = new THREE.Sprite(mat);
          const base = Math.sqrt(n.citations || 1);
          const diameter = Math.min(base * 1.1, 14) * (isHub ? 1.6 : 1.0);
          sprite.scale.set(diameter, diameter, 1);
          return sprite;
        };

        const cameraInitRef = { current: false };

        const fgProps: Record<string, any> = {
          ref: fgRef,
          graphData: renderData,
          backgroundColor: '#000000',
          nodeRelSize: 1,
          linkOpacity: (link: any) => {
            const sel = selectedNodeRef.current;
            const focus = focusedSchoolRef.current ?? hoveredSchoolRef.current;
            if (sel) {
              const ls = linksByNodeId.get(sel.id);
              return ls && ls.has(link) ? 0.95 : 0.01;
            }
            if (focus !== null && focus !== undefined) {
              const s = typeof link.source === 'object' ? (link.source as any).community : null;
              const t = typeof link.target === 'object' ? (link.target as any).community : null;
              return (s === focus && t === focus) ? 0.20 : 0.005;
            }
            return 0.08;
          },
          linkWidth: (link: any) => {
            const sel = selectedNodeRef.current;
            if (!sel) return 0.20;
            const ls = linksByNodeId.get(sel.id);
            return ls && ls.has(link) ? 1.5 : 0.20;
          },
          linkCurvature: 0.08,
          linkColor: (link: any) => {
            const sel = selectedNodeRef.current;
            const s = typeof link.source === 'object' ? (link.source as any).community : null;
            const defaultColor = s !== null && s !== undefined ? (SCHOOL_COLORS[s] || '#ffffff') : '#ffffff';
            if (!sel) return defaultColor;
            const ls = linksByNodeId.get(sel.id);
            return ls && ls.has(link) ? '#FFF6D8' : defaultColor;
          },
          linkDirectionalParticles: 0,
          linkDirectionalArrowLength: 0,
          warmupTicks: 120,
          cooldownTicks: 220,
          showNavInfo: false,
          enableNavigationControls: true,
          controlType: 'orbit',
          enableNodeDrag: true,
          onNodeClick: (node: any) => {
            if (isDragRotationRef.current) return;
            const n = node as any;
            if (n.portfolioLabel) { setActiveDrawer(n.portfolioLabel.key); return; }
            onNodeClickRef.current(n as NetworkNode);
          },
          onBackgroundClick: (evt: any) => {
            if (isDragRotationRef.current) return;
            if (fgRef.current && evt) {
              const camera = fgRef.current.camera();
              if (camera) {
                const w = window.innerWidth;
                const h = window.innerHeight;
                const px = evt.clientX || 0;
                const py = evt.clientY || 0;

                for (const [key, spr] of Object.entries(allSpriteRefsByKey)) {
                  if (spr) {
                    const vec = spr.position.clone();
                    vec.project(camera);
                    const sx = (vec.x * 0.5 + 0.5) * w;
                    const sy = (-(vec.y * 0.5) + 0.5) * h;
                    if (Math.hypot(px - sx, py - sy) < 220) {
                      setActiveDrawer(key);
                      return;
                    }
                  }
                }
              }
            }
            setSelectedNode(null);
          },
          onNodeDragEnd: (node: any) => { node.fx = node.x; node.fy = node.y; node.fz = node.z; },
          nodeThreeObject: buildNodeThreeObject,
          nodeOpacity: (node: any) => {
            const sel = selectedNodeRef.current;
            const focus = focusedSchoolRef.current ?? hoveredSchoolRef.current;
            if (sel) {
              if (node.id === sel.id) return 1.0;
              const neigh = neighborsByNodeId.get(sel.id);
              return neigh && neigh.has(node.id) ? 0.95 : 0.12;
            }
            if (focus !== null && focus !== undefined) {
              return (node as NetworkNode).community === focus ? 0.95 : 0.07;
            }
            return 0.95;
          },
          nodeLabel: () => '',
          onEngineStop: () => {
            if (cameraInitRef.current || !fgRef.current) return;
            cameraInitRef.current = true;
            fgRef.current.cameraPosition({ x: 0, y: 0, z: 280 }, { x: 0, y: 0, z: 0 }, 2500);
            // Record hub node 3D positions for camera zoom
            if (isMounted) {
              const positions: Record<string, { x: number; y: number; z: number }> = {};
              for (const n of renderNodes) {
                const pl = (n as any).portfolioLabel;
                if (pl && n.x !== undefined && n.y !== undefined && n.z !== undefined) {
                  positions[pl.key] = { x: n.x, y: n.y, z: n.z };
                }
              }
              hubPositionsRef.current = positions;
              setGraphReady(true);
            }
          },
          d3Force: (engine: any) => {
            engine.force('charge').strength(-260).distanceMax(900);
            engine.force('collide', forceCollide(35).strength(0.9).iterations(2));
            engine.force('link').distance((l: any) => {
              const norm = Math.sqrt(((l.assoc ?? minA) - minA) / ((maxA - minA) || 1));
              return 430 - norm * 300; // strongest ≈130px, weakest ≈430px
            }).strength(0.08);
            engine.force('center', forceCenter(0, 0).strength(0.05));
            engine.force('cluster-3d', null);
            return engine;
          },
        };

        containerRef.current.innerHTML = '';
        root = ReactDOM.createRoot(containerRef.current);
        root.render(React.createElement(ForceGraph3D as any, fgProps));

        // Post-processing: bloom + starfield + controls
        setTimeout(() => {
          if (!fgRef.current) return;
          try {
            const renderer = fgRef.current.renderer();
            const scene = fgRef.current.scene();
            const camera = fgRef.current.camera();
            if (!renderer || !scene || !camera) return;

            const composer = new EffectComposer(renderer);
            composer.addPass(new RenderPass(scene, camera));
            composer.addPass(new UnrealBloomPass(
              new THREE.Vector2(window.innerWidth, window.innerHeight),
              0.85, 0.45, 0.1
            ));
            createStarfield(scene);
            if (fgRef.current.postProcessingComposer) fgRef.current.postProcessingComposer(composer);

            const ctrl = fgRef.current.controls();
            if (ctrl) {
              ctrl.enableDamping = true;
              ctrl.dampingFactor = 0.05;
              ctrl.autoRotate = true;
              ctrl.autoRotateSpeed = 0.4;

              const updateTextSpriteScales = () => {
                if (!fgRef.current) return;
                const camera = fgRef.current.camera();
                if (!camera) return;

                for (const spr of Object.values(allSpriteRefsByKey)) {
                  if (spr) {
                    const dist = camera.position.distanceTo(spr.position) || camera.position.length() || 280;
                    const factor = Math.min(1.7, Math.max(0.35, Math.pow(dist / 250, 0.75)));
                    spr.scale.set(70 * factor, 17.5 * factor, 1);
                  }
                }
              };
              ctrl.addEventListener('change', updateTextSpriteScales);
              updateTextSpriteScales();

              const checkAreaClick = (e: any) => {
                if (!fgRef.current) return false;
                const camera = fgRef.current.camera();
                if (!camera) return false;
                const w = window.innerWidth;
                const h = window.innerHeight;
                const p = 'touches' in e ? (e.touches[0] || e.changedTouches[0]) : e;
                if (!p) return false;

                for (const [key, spr] of Object.entries(allSpriteRefsByKey)) {
                  if (spr) {
                    const vec = spr.position.clone();
                    vec.project(camera);
                    const sx = (vec.x * 0.5 + 0.5) * w;
                    const sy = (-(vec.y * 0.5) + 0.5) * h;
                    if (Math.hypot(p.clientX - sx, p.clientY - sy) < 220) {
                      setActiveDrawer(key);
                      return true;
                    }
                  }
                }

                return false;
              };

              let resumeTimer: number | undefined;
              let pointerStart = { x: 0, y: 0 };
              const pause = () => { ctrl.autoRotate = false; if (resumeTimer) window.clearTimeout(resumeTimer); };
              const scheduleResume = () => { if (resumeTimer) window.clearTimeout(resumeTimer); resumeTimer = window.setTimeout(() => { ctrl.autoRotate = true; }, 1500); };
              
              const handleDown = (e: MouseEvent | TouchEvent) => {
                pause();
                const p = 'touches' in e ? (e.touches[0] || e.changedTouches[0]) : e;
                if (p) {
                  pointerStart = { x: p.clientX, y: p.clientY };
                  isDragRotationRef.current = false;
                }
              };
              const handleMove = (e: MouseEvent | TouchEvent) => {
                const p = 'touches' in e ? (e.touches[0] || e.changedTouches[0]) : e;
                if (p) {
                  if (Math.hypot(p.clientX - pointerStart.x, p.clientY - pointerStart.y) > 8) {
                    isDragRotationRef.current = true;
                  }
                }
              };

              const el = renderer.domElement;
              el.addEventListener('click', (e: MouseEvent) => { if (!isDragRotationRef.current) checkAreaClick(e); });
              el.addEventListener('touchend', (e: TouchEvent) => { if (!isDragRotationRef.current) checkAreaClick(e); });
              el.addEventListener('mousedown', handleDown as any);
              el.addEventListener('mousemove', handleMove as any);
              el.addEventListener('touchstart', handleDown as any);
              el.addEventListener('touchmove', handleMove as any);
              el.addEventListener('mouseup', scheduleResume);
              el.addEventListener('touchend', scheduleResume);
            }

            fgApiRef.current = fgRef.current;
          } catch (e) { console.error('Post-processing setup failed:', e); }
        }, 500);
      } catch (err) {
        console.error('3D graph init failed:', err);
        if (isMounted) setGraphError(true);
      }
    }

    init();
    return () => { isMounted = false; if (root) root.unmount(); };
  }, [rawData]);

  // Camera zoom: smoothly travel to hub node when a drawer opens or switches
  useEffect(() => {
    if (!fgApiRef.current) return;
    const fg = fgApiRef.current;
    const ctrl = fg.controls?.();

    if (!activeDrawer) {
      // Drawer closed — zoom back out to default view
      fg.cameraPosition({ x: 0, y: 0, z: 280 }, { x: 0, y: 0, z: 0 }, 900);
      if (ctrl) { ctrl.autoRotate = true; ctrl.autoRotateSpeed = 0.4; }
      return;
    }

    const hub = hubPositionsRef.current[activeDrawer];
    if (!hub) return;

    // Zoom in toward the hub — offset slightly so the node isn't behind the sidebar
    const dist = 120; // how close to zoom in
    const cam = fg.camera?.();
    if (!cam) return;

    // Direction from hub to camera (normalized), then back off by dist
    const camPos = cam.position;
    const dx = camPos.x - hub.x;
    const dy = camPos.y - hub.y;
    const dz = camPos.z - hub.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const nx = hub.x + (dx / len) * dist;
    const ny = hub.y + (dy / len) * dist;
    const nz = hub.z + (dz / len) * dist;

    if (ctrl) { ctrl.autoRotate = false; }
    fg.cameraPosition(
      { x: nx - 60, y: ny, z: nz }, // offset left to avoid sidebar overlap
      { x: hub.x, y: hub.y, z: hub.z },
      800
    );
  }, [activeDrawer]);

  // Normalize data
  const data = useMemo(() => {
    if (!rawData) return null;
    const nodes = rawData.nodes.map(n => ({
      ...n, authors: typeof n.authors === 'string' ? n.authors : (n.authors as any).join(', '),
      link_url: n.link_url || (n.doi && `https://doi.org/${n.doi}`) || undefined,
      link_type: n.link_type || (n.doi ? 'doi' : undefined),
    }));
    return { nodes, links: rawData.links };
  }, [rawData]);

  const schoolCounts = useMemo(() => {
    if (!data) return {} as Record<number, number>;
    const c: Record<number, number> = {};
    for (const n of data.nodes) c[n.community] = (c[n.community] || 0) + 1;
    return c;
  }, [data]);

  const metrics = useMemo(() => {
    if (!data) return null;
    const ns = data.nodes; const N = ns.length;
    const cits = ns.map(n => n.citations || 0).sort((a, b) => b - a);
    const totalCit = cits.reduce((s, c) => s + c, 0);
    const avgCit = Math.round(totalCit / N);
    let h = 0; for (let i = 0; i < cits.length; i++) { if (cits[i] >= i + 1) h = i + 1; else break; }
    const years = ns.map(n => n.year).filter(Boolean).sort((a, b) => a - b);
    const medianYear = years[Math.floor(years.length / 2)] || 0;
    const E = 21285;
    const density = (2 * E / (N * (N - 1))).toFixed(2);
    return { totalCit, avgCit, h, medianYear, density };
  }, [data]);

  // Refs for use inside the dynamic import closure (stale closure fix)
  const colorModeRef = useRef(colorMode);
  useEffect(() => { colorModeRef.current = colorMode; }, [colorMode]);
  useEffect(() => {
    if (!fgApiRef.current) return;
    if (typeof fgApiRef.current.refresh === 'function') {
      fgApiRef.current.refresh();
    }
  }, [colorMode, focusedSchool]);
  const hoveredSchoolRef = useRef(hoveredSchool);
  useEffect(() => { hoveredSchoolRef.current = hoveredSchool; }, [hoveredSchool]);
  const focusedSchoolRef = useRef(focusedSchool);
  useEffect(() => { focusedSchoolRef.current = focusedSchool; }, [focusedSchool]);
  const selectedNodeRef = useRef<NetworkNode | null>(null);
  useEffect(() => { selectedNodeRef.current = selectedNode; }, [selectedNode]);

  const flyToSchool = useCallback((schoolIdx: number) => {
    if (!fgApiRef.current || !data) return;
    const commNodes = data.nodes.filter(n => n.community === schoolIdx);
    if (commNodes.length === 0) return;
    const cx = commNodes.reduce((s, n) => s + (n.x || 0), 0) / commNodes.length;
    const cy = commNodes.reduce((s, n) => s + (n.y || 0), 0) / commNodes.length;
    const cz = commNodes.reduce((s, n) => s + (n.z || 0), 0) / commNodes.length;
    const dist = Math.hypot(cx, cy, cz) || 1;
    fgApiRef.current.cameraPosition(
      { x: cx + (cx / dist) * 250, y: cy + (cy / dist) * 250, z: cz + (cz / dist) * 250 },
      { x: cx, y: cy, z: cz }, 1200
    );
  }, [data]);
  void flyToSchool; // kept for future use

  const handleNodeClick = useCallback((node: NetworkNode) => {
    setSelectedNode(node);
  }, []);
  const onNodeClickRef = useRef(handleNodeClick);
  useEffect(() => { onNodeClickRef.current = handleNodeClick; }, [handleNodeClick]);

  const vis = (phase: number) => entrancePhase >= phase ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2';

  if (!data) return (
    <section className="w-full h-[100dvh]" style={{ background: '#05060B' }}>
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="flex gap-1.5">
          {[0,1,2,3,4].map(i => (
            <span key={i} className="w-1 h-1 rounded-full bg-white/30"
              style={{ animation: `pulse 1.2s ease-in-out ${i * 0.18}s infinite` }} />
          ))}
        </div>
        <div className="font-mono text-[11px] tracking-[0.2em] uppercase" style={{ color: 'rgba(255,255,255,0.25)' }}>Initialising experience</div>
      </div>
    </section>
  );

  return (
    <section ref={sectionRef} id="network" className="relative w-full h-[100dvh] overflow-hidden" style={{ background: '#05060B' }}>
      {/* Graph container — dynamic import mounts ForceGraph3D here on desktop */}
      <div ref={containerRef} className="hidden sm:block" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 2 }} />

      {/* Loading state */}
      {!graphReady && !graphError && (
        <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-6" style={{ background: '#000000' }}>
          {/* Animated ring */}
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border border-white/5" />
            <div className="absolute inset-0 rounded-full border-t border-r border-[#D4A853]/60"
              style={{ animation: 'spin 1.4s linear infinite' }} />
            <div className="absolute inset-2 rounded-full border border-white/[0.04]" />
            <div className="absolute inset-2 rounded-full border-t border-[#FFD03A]/30"
              style={{ animation: 'spin 2s linear infinite reverse' }} />
          </div>
          {/* Loading label */}
          <div className="text-center space-y-2">
            <div className="font-mono text-[13px] tracking-[0.25em] uppercase" style={{ color: 'rgba(255,255,255,0.55)', fontFamily: '"Logotype Frenzy", "Kaushan Script", cursive' }}>Loading Experience</div>
            <div className="font-mono text-[10px] tracking-[0.15em]" style={{ color: 'rgba(255,255,255,0.2)' }}>Building your universe...</div>
          </div>
          {/* Mobile recommendation notice during initial loading */}
          <div className="mt-2 px-4 py-2 rounded-full border border-[#D4A853]/30 bg-[#D4A853]/10 text-center max-w-[88vw] sm:hidden">
            <p className="font-mono text-[10px] text-[#FFD93D] flex items-center justify-center gap-1.5">
              <span>💡</span>
              <span>For best 3D experience, view on desktop</span>
            </p>
          </div>
          {/* Dot pulse */}
          <div className="flex gap-2">
            {[0,1,2].map(i => (
              <span key={i} className="w-1 h-1 rounded-full"
                style={{ background: 'rgba(212,168,83,0.5)', animation: `pulse 1.2s ease-in-out ${i * 0.3}s infinite` }} />
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {graphError && (
        <div className="absolute inset-0 z-[5] flex items-center justify-center" style={{ background: '#000000' }}>
          <div className="text-center">
            <div className="font-mono text-[14px] mb-2" style={{ color: '#D4A853' }}>3D WebGL not available</div>
            <div className="font-mono text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Please try a different browser with WebGL support.</div>
          </div>
        </div>
      )}

      {/* Warm central nebula */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1, background: 'radial-gradient(circle at 50% 45%, rgba(212,168,83,0.10) 0%, transparent 55%)' }} />

      {/* Vignette */}
      <div className="absolute inset-0 z-10 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.4) 100%)' }} />

      {/* Supertitle */}
      <div className={`absolute top-[16px] left-[16px] sm:top-[24px] sm:left-[32px] z-20 pointer-events-none transition-all duration-500 ease-out hidden md:flex items-center gap-2.5 ${vis(1)}`}>
        <span className="w-2 h-2 rounded-full bg-[#34D399] animate-ping" />
        <div className="font-mono text-[11px] tracking-[0.06em] uppercase flex items-center gap-2" style={{ color: '#D4A853' }}>
          <span className="italic font-serif normal-case text-[14px] text-white/90">M. Hasssssan</span>
          <span className="opacity-40">·</span>
          <span>PORTFOLIO · NETWORK NEUROSCIENCE</span>
        </div>
      </div>

      {/* Top-Right Reset Button (Desktop Only) */}
      <div className={`hidden sm:block absolute top-[24px] right-[32px] z-20 pointer-events-auto transition-all duration-500 ease-out ${vis(1)}`}>
        <button
          onClick={() => {
            setActiveDrawer(null);
            setSelectedNode(null);
            setFocusedSchool(null);
            setHoveredSchool(null);
            if (fgApiRef.current) {
              fgApiRef.current.cameraPosition({ x: 0, y: 0, z: 280 }, { x: 0, y: 0, z: 0 }, 1200);
              const ctrl = fgApiRef.current.controls();
              if (ctrl) ctrl.autoRotate = true;
            }
          }}
          className="font-mono text-[11px] uppercase tracking-wider px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all duration-200"
          style={{
            background: 'rgba(10,10,20,0.7)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(212,168,83,0.4)',
            color: '#D4A853',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(212,168,83,0.2)';
            e.currentTarget.style.borderColor = '#D4A853';
            e.currentTarget.style.color = '#FFFFFF';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(10,10,20,0.7)';
            e.currentTarget.style.borderColor = 'rgba(212,168,83,0.4)';
            e.currentTarget.style.color = '#D4A853';
          }}
        >
          <span className="text-[12px]">↺</span> Reset View
        </button>
      </div>

      {/* ── MOBILE OPTION 2 INTERACTIVE CARDS & TOP BAR (< 768px Viewports) ── */}
      <div className="sm:hidden relative z-30 flex flex-col justify-between h-full px-4 pt-14 pb-6 overflow-y-auto pointer-events-auto">
        {/* Top Mobile Bar with Menu Button */}
        <div className="flex items-center justify-between w-full mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#34D399] animate-ping" />
            <span className="font-serif italic text-[18px] font-semibold text-white">M. Hasssssan</span>
          </div>
          <button
            onClick={() => setMobileLegendOpen(!mobileLegendOpen)}
            className="px-3.5 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-wider border border-[#D4A853]/40 bg-[#0A0A14]/90 text-[#D4A853] flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
          >
            <span>☰</span> Menu & Legend
          </button>
        </div>

        {/* Mobile Initial Welcome Popup Modal */}
        {showMobileNotice && (
          <div className="sm:hidden fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/90 backdrop-blur-2xl pointer-events-auto animate-fadeIn">
            <div
              className="w-full max-w-[340px] p-6 rounded-2xl border border-[#D4A853]/40 bg-[#080A16]/95 text-center shadow-2xl space-y-4"
              style={{ fontFamily: '"Times New Roman", Times, Georgia, serif' }}
            >
              <div className="w-12 h-12 rounded-full border border-[#D4A853]/40 bg-[#D4A853]/10 flex items-center justify-center mx-auto text-2xl">
                📱
              </div>

              <div className="space-y-1">
                <h3
                  className="font-medium text-[24px] text-white tracking-tight"
                  style={{ fontFamily: '"Times New Roman", Times, Georgia, serif' }}
                >
                  You're on Mobile!
                </h3>
                <p
                  className="text-[11px] uppercase tracking-wider text-[#FFD93D]"
                  style={{ fontFamily: '"Times New Roman", Times, Georgia, serif' }}
                >
                  Device Notice
                </p>
              </div>

              <div
                className="space-y-2.5 text-left text-[13px] text-white/90 leading-relaxed bg-white/[0.04] p-4 rounded-xl border border-white/10"
                style={{ fontFamily: '"Times New Roman", Times, Georgia, serif' }}
              >
                <p className="flex items-start gap-2">
                  <span className="text-[#D4A853] shrink-0 font-bold">•</span>
                  <span>Full 3D interactive experience is limited to desktop devices.</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-[#D4A853] shrink-0 font-bold">•</span>
                  <span>Switch to a laptop or desktop screen for real-time 3D physics & interactive controls.</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-[#D4A853] shrink-0 font-bold">•</span>
                  <span>3D Network Mode is best experienced on a laptop or desktop screen.</span>
                </p>
              </div>

              <button
                onClick={() => setShowMobileNotice(false)}
                className="w-full py-3 rounded-xl text-[13px] uppercase tracking-wider font-bold bg-[#D4A853] text-black hover:bg-[#FFE082] transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                style={{ fontFamily: '"Times New Roman", Times, Georgia, serif' }}
              >
                <span>✕</span> Continue to Portfolio
              </button>
            </div>
          </div>
        )}

        {/* Mobile Slide-Out Menu / Legend Drawer */}
        {mobileLegendOpen && (
          <div className="mb-4 p-4 rounded-2xl border border-[#D4A853]/30 bg-[#080914]/95 backdrop-blur-xl shadow-2xl space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-[#D4A853] font-semibold">Sidebar Menu & Legend</span>
              <button onClick={() => setMobileLegendOpen(false)} className="text-white/60 hover:text-white font-mono text-[11px]">✕ Close</button>
            </div>

            <div className="space-y-1.5 pt-1">
              {Object.entries(SCHOOL_NAMES).map(([key, name]) => {
                const idx = Number(key);
                const commMap: Record<number, string> = {
                  0: 'work',
                  1: 'projects',
                  2: 'aboutMe',
                  3: 'services',
                  4: 'experience',
                  5: 'publications',
                  6: 'skills',
                  8: 'contact',
                };
                const drawerKey = commMap[idx] || 'aboutMe';
                const color = SCHOOL_COLORS[idx] || '#D4A853';

                return (
                  <button
                    key={idx}
                    onClick={() => {
                      setActiveDrawer(drawerKey);
                      setMobileLegendOpen(false);
                    }}
                    className="flex items-center justify-between w-full p-2.5 rounded-lg bg-white/[0.04] hover:bg-white/10 border border-white/5 text-left font-mono text-[11px] text-white/80 transition-all active:scale-98"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span>{name}</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50">{schoolCounts[idx] || 0}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Mobile Header Title */}
        <div className="text-center space-y-1.5 my-2">
          <h1 className="font-serif italic font-medium text-[28px] text-white">M. Hasssssan</h1>
          <p className="font-mono text-[11px] text-white/60 tracking-wide">Interactive Portfolio · Select a section below</p>
        </div>

        {/* Mobile 2D Interactive Section Cards Grid */}
        <div className="grid grid-cols-2 gap-2.5 my-3">
          {Object.entries(SCHOOL_NAMES).map(([key, name]) => {
            const idx = Number(key);
            const commMap: Record<number, string> = {
              0: 'work',
              1: 'projects',
              2: 'aboutMe',
              3: 'services',
              4: 'experience',
              5: 'publications',
              6: 'skills',
              8: 'contact',
            };
            const drawerKey = commMap[idx] || 'aboutMe';
            const color = SCHOOL_COLORS[idx] || '#D4A853';

            return (
              <button
                key={idx}
                onClick={() => setActiveDrawer(drawerKey)}
                className="flex flex-col justify-between p-3 rounded-xl border text-left transition-all active:scale-95 shadow-md"
                style={{
                  background: 'rgba(12, 14, 25, 0.88)',
                  backdropFilter: 'blur(12px)',
                  borderColor: `${color}40`,
                }}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: color }} />
                  <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">{schoolCounts[idx] || 0}</span>
                </div>
                <span className="font-mono text-[11px] font-semibold text-white/90 truncate">{name}</span>
                <span className="font-mono text-[9px] uppercase tracking-wider text-white/40 mt-1">Tap to view ↗</span>
              </button>
            );
          })}
        </div>

        <div className="text-center font-mono text-[10px] text-white/40 pt-1">
          <span>Tap any card or open menu to view details</span>
        </div>
      </div>

      {/* ── DESKTOP FULL 3D INTERACTIVE VIEW (>= 768px Viewports) ── */}
      <div className="hidden sm:block">
        {/* Title */}
        <div className={`absolute z-20 flex flex-col items-center pointer-events-none transition-all duration-500 ease-out px-4 text-center ${vis(2)}`} style={{ top: '48px', left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '360px' }}>
          <h1 className="font-serif text-center italic font-medium text-[32px]" style={{ color: 'rgba(255,255,255,0.95)', textShadow: '0 2px 16px rgba(0,0,0,0.6)' }}>M. Hasssssan</h1>
          <p className={`font-mono text-[12px] text-center mt-1 tracking-[0.04em] transition-all duration-500 ease-out ${vis(3)}`} style={{ color: 'rgba(255,255,255,0.5)' }}>Interactive 3D Portfolio · 244 Nodes · 8 Clusters</p>
        </div>
      </div>

      {/* Real-time working FPS counter badge (Desktop Only) */}
      <div className={`hidden sm:block absolute z-20 pointer-events-auto transition-all duration-500 ease-out ${vis(6)}`} style={{ bottom: '32px', left: '32px' }}>
        <div className="rounded-lg px-3.5 py-2.5 flex items-center gap-2"
          style={{ background: 'rgba(10,10,20,0.6)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <span className="w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: fps >= 45 ? '#34D399' : fps >= 30 ? '#FFD93D' : '#FF2B55' }} />
          <span className="font-mono text-[13px] font-bold" style={{ color: fps >= 45 ? '#34D399' : fps >= 30 ? '#FFD93D' : '#FF2B55' }}>{fps}</span>
          <span className="font-mono text-[9px] uppercase tracking-wider text-white/50">FPS</span>
        </div>
      </div>

      {/* Legend (Desktop Only) */}
      <div className={`hidden sm:block absolute z-20 pointer-events-auto transition-all duration-500 ease-out ${vis(7)}`} style={{ bottom: '32px', right: '32px' }}>
        <div className="rounded-lg px-4 py-3 max-w-[280px]" style={{ background: 'rgba(10,10,20,0.85)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.12)' }}>
          <div className="font-mono text-[9px] uppercase tracking-[0.1em] mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>Legend · click to view section · drag to rotate</div>
          {Object.entries(SCHOOL_NAMES).map(([key, name], i) => {
            const idx = Number(key);
            const delay = i * 50;
            const isFocused = focusedSchool === idx;
            const commMap: Record<number, string> = {
              0: 'work',
              1: 'projects',
              2: 'aboutMe',
              3: 'services',
              4: 'experience',
              5: 'publications',
              6: 'skills',
              8: 'contact',
            };
            return (
              <div key={idx}
                className="flex items-center gap-2 leading-[22px] rounded-sm px-1 -mx-1 transition-all duration-200"
                style={{
                  opacity: entrancePhase >= 7 ? 1 : 0, transform: entrancePhase >= 7 ? 'translateX(0)' : 'translateX(8px)',
                  transition: `opacity 300ms ease-out ${delay}ms, transform 300ms ease-out ${delay}ms`,
                  borderLeft: isFocused ? '2px solid #D4A853' : '2px solid transparent', paddingLeft: isFocused ? '6px' : '4px',
                  cursor: 'pointer', background: isFocused ? 'rgba(212,168,83,0.08)' : 'transparent',
                }}
                onMouseEnter={() => setHoveredSchool(idx)} onMouseLeave={() => setHoveredSchool(null)}
                onClick={() => {
                  setFocusedSchool(isFocused ? null : idx);
                  setActiveDrawer(commMap[idx] || 'aboutMe');
                }}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: SCHOOL_COLORS[idx] }} />
                <span className="font-mono text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.65)' }}>{name}</span>
                <span className="font-mono text-[10px] ml-auto shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }}>{schoolCounts[idx] || 0}</span>
              </div>
            );
          })}
        </div>
      </div>



      {/* Portfolio Section Slide-in Drawer */}
      {activeDrawer && (
        <div className="absolute inset-0 z-50 flex justify-end pointer-events-none">
          <div className="drawer-panel h-full overflow-y-auto overflow-x-hidden border-l relative pointer-events-auto flex flex-col"
            style={{
              width: 440, maxWidth: '92vw',
              background: 'rgba(5, 7, 14, 0.95)',
              backdropFilter: 'blur(16px)',
              borderColor: `${activeDrawer === 'aboutMe' ? '#FFD03A50' :
                activeDrawer === 'work' ? '#FF2B5550' :
                  activeDrawer === 'projects' ? '#2EC4B650' :
                    activeDrawer === 'services' ? '#3AC1FF50' :
                      activeDrawer === 'experience' ? '#FF8C4250' :
                        activeDrawer === 'publications' ? '#4488FF50' :
                          activeDrawer === 'skills' ? '#FFD93D50' : '#A855F750'
                }`,
              boxShadow: '-10px 0 30px rgba(0,0,0,0.85)',
              animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            }}
            onClick={(e) => e.stopPropagation()}>

            {/* Sticky header with close button */}
            <div className="sticky top-0 z-20 flex justify-end px-5 pt-5 pb-2" style={{ background: 'rgba(5,7,14,0.95)', backdropFilter: 'blur(12px)' }}>
              <button onClick={() => setActiveDrawer(null)}
                className="text-white/50 hover:text-white text-2xl transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10"
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
            </div>

            {/* Scrollable drawer content */}
            <div className="px-6 pb-10 flex-1">


            {/* About Me Drawer */}
            {activeDrawer === 'aboutMe' && (
              <>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#FFD03A]/40 bg-[#FFD03A]/10 mb-4">
                  <span className="w-2 h-2 rounded-full bg-[#34D399] animate-ping" />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#FFDF70]">Developer & Designer · Sialkot, Pakistan</span>
                </div>
                <h2 className="font-serif text-[26px] font-medium text-white leading-tight mb-1">Mohammad Hassan</h2>
                <p className="font-mono text-[11px] text-[#D4A853] mb-5">Full-Stack Developer · UI/UX Designer · Open Source Contributor</p>

                <div className="space-y-4 font-mono text-[12px] leading-relaxed">
                  {/* Bio */}
                  <p className="border-l-2 border-[#FFD03A] pl-3 py-0.5 text-white/90">
                    I'm a developer and designer passionate about crafting immersive digital experiences. I blend clean code with creative design to build products that are both functional and beautiful — from interactive 3D visualizations to full-stack web applications.
                  </p>

                  {/* Location */}
                  <div className="flex items-center gap-2 text-white/60 text-[11px]">
                    <span>📍</span><span>Sialkot, Punjab, Pakistan</span>
                  </div>

                  {/* Interests */}
                  <div className="rounded-lg p-4 bg-white/[0.03] border border-white/10 space-y-3">
                    <h3 className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">Interests & Passions</h3>
                    <ul className="space-y-2 text-[11px]">
                      <li className="flex items-center gap-2 text-white/90"><span className="text-[#FFD03A]">✦</span> 3D WebGL & Interactive Experiences</li>
                      <li className="flex items-center gap-2 text-white/90"><span className="text-[#2EC4B6]">✦</span> Generative AI & Large Language Models</li>
                      <li className="flex items-center gap-2 text-white/90"><span className="text-[#3AC1FF]">✦</span> UI/UX Design Systems & Motion Design</li>
                      <li className="flex items-center gap-2 text-white/90"><span className="text-[#A78BFA]">✦</span> Graph Theory & Network Visualization</li>
                      <li className="flex items-center gap-2 text-white/90"><span className="text-[#34D399]">✦</span> Open Source & Developer Tooling</li>
                    </ul>
                  </div>

                  {/* Fun Fact */}
                  <div className="rounded-lg p-4 bg-[#FFD03A]/[0.04] border border-[#FFD03A]/20">
                    <h3 className="text-[11px] uppercase tracking-wider text-[#FFD03A]/70 font-semibold mb-2">⚡ Fun Fact</h3>
                    <p className="text-white/80 text-[11px]">Built a living 3D network of research papers that rotates in real-time in your browser — because flat portfolios are boring.</p>
                  </div>

                  {/* Social Links */}
                  <div className="pt-1 space-y-2">
                    <h3 className="text-[11px] uppercase tracking-wider text-white/40 font-semibold mb-3">Connect with Me</h3>
                    <div className="flex flex-col gap-2">
                      <a href="https://github.com/m-hassssssan" target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-[11px] border border-white/10 text-white/80 hover:bg-white/[0.06] hover:border-white/20 transition-all">
                        <span className="text-[15px]">⚙</span>
                        <span className="font-semibold">GitHub</span>
                        <span className="text-white/40 ml-auto">github.com/m-hassssssan</span>
                      </a>
                      <a href="mailto:hassanhussain7913@gmail.com"
                        className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-[11px] border border-white/10 text-white/80 hover:bg-white/[0.06] hover:border-white/20 transition-all">
                        <span className="text-[15px]">✉</span>
                        <span className="font-semibold">Email</span>
                        <span className="text-white/40 ml-auto">hassanhussain7913@gmail.com</span>
                      </a>
                      <a href="tel:+923312313737"
                        className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-[11px] border border-white/10 text-white/80 hover:bg-white/[0.06] hover:border-white/20 transition-all">
                        <span className="text-[15px]">📞</span>
                        <span className="font-semibold">Phone</span>
                        <span className="text-white/40 ml-auto">+92 331 231 3737</span>
                      </a>
                      <a href="https://vercel.com/hassanhussain7913-8533s-projects" target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-[11px] border border-[#3AC1FF]/20 text-[#3AC1FF] hover:bg-[#3AC1FF]/10 hover:border-[#3AC1FF]/40 transition-all">
                        <span className="text-[15px]">⚡</span>
                        <span className="font-semibold">Live Portfolio</span>
                        <span className="text-[#3AC1FF]/50 ml-auto">vercel.com</span>
                      </a>
                    </div>
                  </div>

                  <div className="pt-3 flex flex-wrap gap-3">
                    <button onClick={() => setActiveDrawer('contact')} className="px-4 py-2 rounded-full font-mono text-[11px] uppercase font-semibold bg-[#FFD03A] text-black hover:bg-[#FFDF70] transition-all">Get in Touch</button>
                    <button onClick={() => setActiveDrawer(null)} className="px-4 py-2 rounded-full font-mono text-[11px] uppercase border border-white/20 text-white/80">Close</button>
                  </div>
                </div>
              </>
            )}

            {/* Work Drawer */}
            {activeDrawer === 'work' && (
              <>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#FF2B55]/40 bg-[#FF2B55]/10 mb-4">
                  <span className="w-2 h-2 rounded-full bg-[#FF2B55] animate-ping" />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#FF4D6D]">Live Work · M. Hassan</span>
                </div>
                <h2 className="font-serif text-[26px] font-medium text-white leading-tight mb-1">My Work</h2>
                <p className="font-mono text-[11px] text-[#FF4D6D] mb-6">Full-Stack · E-Commerce · UI/UX · Interactive Design</p>
                <div className="space-y-4 font-mono text-[12px]">

                  {/* Bibliotheca */}
                  <div className="rounded-lg p-4 bg-white/[0.03] border border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37] uppercase tracking-wider">UI Design · Library App</span>
                      <a href="https://m-hassssssan.github.io/Bibliotheca/" target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#FF4D6D] hover:text-white transition-colors">↗ Live</a>
                    </div>
                    <h3 className="text-white text-[13px] font-semibold">Bibliotheca — A Golden Sanctuary of Words</h3>
                    <p className="text-white/70 text-[11px] leading-relaxed">A premium digital library experience crafted with a rich gold-on-black aesthetic using Cinzel & Playfair Display typography. Features an elegant dark-mode UI with smooth scroll animations, curated book collections, and a sanctuary-like reading atmosphere that treats literature as luxury.</p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {['HTML5', 'CSS3', 'Vanilla JS', 'Google Fonts', 'Radial Gradients'].map(t => (
                        <span key={t} className="px-2 py-0.5 rounded text-[9px] border border-white/10 text-white/50">{t}</span>
                      ))}
                    </div>
                  </div>

                  {/* WEAR ON */}
                  <div className="rounded-lg p-4 bg-white/[0.03] border border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#FF2B55]/15 border border-[#FF2B55]/30 text-[#FF4D6D] uppercase tracking-wider">E-Commerce · Fashion</span>
                      <a href="https://m-hassssssan.github.io/WEAR-ON/" target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#FF4D6D] hover:text-white transition-colors">↗ Live</a>
                    </div>
                    <h3 className="text-white text-[13px] font-semibold">WEAR ON — Premium Streetwear Store</h3>
                    <p className="text-white/70 text-[11px] leading-relaxed">A fully designed premium streetwear e-commerce storefront with dedicated Men, Women, New Arrivals & Sale sections. Features a responsive navbar, mobile hamburger menu, cart system, and product grid built with bold Bebas Neue typography and a clean editorial fashion layout.</p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {['HTML5', 'CSS3', 'JavaScript', 'Responsive Design', 'E-Commerce UI'].map(t => (
                        <span key={t} className="px-2 py-0.5 rounded text-[9px] border border-white/10 text-white/50">{t}</span>
                      ))}
                    </div>
                  </div>

                  {/* Obsidian Arts */}
                  <div className="rounded-lg p-4 bg-white/[0.03] border border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#A78BFA]/15 border border-[#A78BFA]/30 text-[#A78BFA] uppercase tracking-wider">React App · Gallery</span>
                      <a href="https://obsidian-arts-01.vercel.app/" target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#FF4D6D] hover:text-white transition-colors">↗ Live</a>
                    </div>
                    <h3 className="text-white text-[13px] font-semibold">Obsidian Arts — Gallery Collection</h3>
                    <p className="text-white/70 text-[11px] leading-relaxed">A React-powered art gallery platform deployed on Vercel with a dark obsidian aesthetic. Built as a single-page application with curated artwork collections, smooth transitions between gallery views, and an immersive full-screen display system that puts the art front and center.</p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {['React', 'Vite', 'Vercel', 'SPA', 'Gallery UI'].map(t => (
                        <span key={t} className="px-2 py-0.5 rounded text-[9px] border border-white/10 text-white/50">{t}</span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 flex flex-wrap gap-3">
                    <button onClick={() => setActiveDrawer('projects')} className="px-4 py-2 rounded-full font-mono text-[11px] uppercase font-semibold bg-[#FF2B55] text-white">View All Projects</button>
                    <button onClick={() => setActiveDrawer(null)} className="px-4 py-2 rounded-full font-mono text-[11px] uppercase border border-white/20 text-white/80">Close</button>
                  </div>
                </div>
              </>
            )}

            {/* Projects Drawer */}
            {activeDrawer === 'projects' && (
              <>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#2EC4B6]/40 bg-[#2EC4B6]/10 mb-4">
                  <span className="w-2 h-2 rounded-full bg-[#2EC4B6] animate-ping" />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#2EC4B6]">Featured Projects · M. Hassan</span>
                </div>
                <h2 className="font-serif text-[26px] font-medium text-white leading-tight mb-1">Projects</h2>
                <p className="font-mono text-[11px] text-[#2EC4B6] mb-6">WebGL · React · Linux · Portfolio · Streetwear</p>
                <div className="space-y-4 font-mono text-[12px]">

                  {/* 3D Portfolio */}
                  <div className="rounded-lg p-4 bg-white/[0.03] border border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#3AC1FF]/15 border border-[#3AC1FF]/30 text-[#3AC1FF] uppercase tracking-wider">WebGL · Three.js · Portfolio</span>
                      <a href="https://m-hassssssan.github.io/MY-PORTFOLIO/" target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#2EC4B6] hover:text-white transition-colors">↗ Live</a>
                    </div>
                    <h3 className="text-white text-[13px] font-semibold">3D Interactive Developer Portfolio</h3>
                    <p className="text-white/70 text-[11px] leading-relaxed">A cinematic 3D developer portfolio built with WebGL featuring a perspective grid animation, floating geometric shapes, and radial gradient lighting. Uses Inter & JetBrains Mono typefaces with a dark cyberpunk aesthetic. Showcases skills, projects and contact sections in a single-page immersive layout.</p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {['HTML5', 'CSS3', 'Three.js', 'WebGL', 'JetBrains Mono', 'Gradient UI'].map(t => (
                        <span key={t} className="px-2 py-0.5 rounded text-[9px] border border-white/10 text-white/50">{t}</span>
                      ))}
                    </div>
                  </div>

                  {/* Linux Replica */}
                  <div className="rounded-lg p-4 bg-white/[0.03] border border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#34D399]/15 border border-[#34D399]/30 text-[#34D399] uppercase tracking-wider">React · OS Simulation</span>
                      <a href="https://m-hassssssan.github.io/linux-replica/" target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#2EC4B6] hover:text-white transition-colors">↗ Live</a>
                    </div>
                    <h3 className="text-white text-[13px] font-semibold">LinuxOS — Browser-Based OS Replica</h3>
                    <p className="text-white/70 text-[11px] leading-relaxed">A fully interactive Linux desktop environment simulation running entirely in the browser. Built with React and Vite, it replicates the look and feel of a Linux GUI with a working taskbar, draggable windows, terminal emulator, and app launcher — all without a single backend server.</p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {['React', 'Vite', 'JavaScript', 'OS UI', 'Terminal Emulator'].map(t => (
                        <span key={t} className="px-2 py-0.5 rounded text-[9px] border border-white/10 text-white/50">{t}</span>
                      ))}
                    </div>
                  </div>

                  {/* This Portfolio */}
                  <div className="rounded-lg p-4 bg-white/[0.03] border border-[#FFD03A]/20 space-y-2.5" style={{ background: 'rgba(255,208,58,0.03)' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#FFD03A]/15 border border-[#FFD03A]/30 text-[#FFD03A] uppercase tracking-wider">⭐ Current · 3D Network</span>
                      <span className="text-[10px] text-[#FFD03A]/60">You are here</span>
                    </div>
                    <h3 className="text-white text-[13px] font-semibold">3D Network Portfolio — This Site</h3>
                    <p className="text-white/70 text-[11px] leading-relaxed">This very portfolio — a real-time 3D force-directed knowledge graph built with Three.js, ForceGraph3D, React, and WebGL bloom shaders. Each node is a portfolio section. Camera zooms to hubs on drawer open, auto-rotates, and renders 60fps with a custom starfield background.</p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {['React', 'Three.js', 'ForceGraph3D', 'WebGL', 'TypeScript', 'Vite'].map(t => (
                        <span key={t} className="px-2 py-0.5 rounded text-[9px] border border-[#FFD03A]/20 text-[#FFD03A]/60">{t}</span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 flex flex-wrap gap-3">
                    <button onClick={() => setActiveDrawer('work')} className="px-4 py-2 rounded-full font-mono text-[11px] uppercase font-semibold bg-[#2EC4B6] text-black">View Work</button>
                    <button onClick={() => setActiveDrawer('skills')} className="px-4 py-2 rounded-full font-mono text-[11px] uppercase border border-white/20 text-white/80">Explore Skills</button>
                    <button onClick={() => setActiveDrawer(null)} className="px-4 py-2 rounded-full font-mono text-[11px] uppercase border border-white/10 text-white/50">Close</button>
                  </div>
                </div>
              </>
            )}

            {/* Services Drawer */}
            {activeDrawer === 'services' && (
              <>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#3AC1FF]/40 bg-[#3AC1FF]/10 mb-4">
                  <span className="w-2 h-2 rounded-full bg-[#3AC1FF] animate-ping" />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#3AC1FF]">Technical & Research Services</span>
                </div>
                <h2 className="font-serif text-[26px] font-medium text-white leading-tight mb-1">Services</h2>
                <p className="font-mono text-[11px] text-[#3AC1FF] mb-6">Connectome Modeling · 3D Web Visualization · Graph Data Science</p>
                <div className="space-y-4 font-mono text-[12px]">
                  <div className="rounded-lg p-4 bg-white/[0.03] border border-white/10 space-y-2">
                    <span className="text-[11px] text-[#3AC1FF]">SERVICE 01</span>
                    <h3 className="text-white text-[13px] font-semibold">Network Neuroscience & Connectome Modeling</h3>
                    <p className="text-white/70 text-[11px]">Louvain community detection, modularity density analysis (Q-scores), and bibliometric VOSviewer modeling.</p>
                  </div>
                  <div className="rounded-lg p-4 bg-white/[0.03] border border-white/10 space-y-2">
                    <span className="text-[11px] text-[#2EC4B6]">SERVICE 02</span>
                    <h3 className="text-white text-[13px] font-semibold">Interactive 3D Web Engine Engineering</h3>
                    <p className="text-white/70 text-[11px]">Three.js, WebGL shaders, bloom post-processing pipelines, and custom force-directed graph layouts.</p>
                  </div>
                  <div className="pt-3 flex flex-wrap gap-3">
                    <button onClick={() => setActiveDrawer('contact')} className="px-4 py-2 rounded-full font-mono text-[11px] uppercase font-semibold bg-[#3AC1FF] text-black">Request Services</button>
                    <button onClick={() => setActiveDrawer(null)} className="px-4 py-2 rounded-full font-mono text-[11px] uppercase border border-white/20 text-white/80">Close</button>
                  </div>
                </div>
              </>
            )}

            {/* Experience Drawer */}
            {activeDrawer === 'experience' && (
              <>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#FF8C42]/40 bg-[#FF8C42]/10 mb-4">
                  <span className="w-2 h-2 rounded-full bg-[#FF8C42] animate-ping" />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#FF8C42]">Developer Experience & Background</span>
                </div>
                <h2 className="font-serif text-[26px] font-medium text-white leading-tight mb-1">Experience</h2>
                <p className="font-mono text-[11px] text-[#FF8C42] mb-6">Full-Stack Development · 3D WebGL Engineering · UI/UX Systems</p>
                <div className="space-y-4 font-mono text-[12px]">
                  <div className="rounded-lg p-4 bg-white/[0.03] border border-white/10 space-y-2">
                    <div className="flex justify-between text-[11px] text-[#FF8C42]"><span>SENIOR FULL-STACK & WEBGL DEVELOPER</span><span>2023 - PRESENT</span></div>
                    <h3 className="text-white text-[13px] font-semibold">Web Development & Interactive Systems</h3>
                    <p className="text-white/70 text-[11px]">Building high-performance web applications, interactive 3D graphics engines, and responsive user interfaces with React, Three.js, and TypeScript.</p>
                  </div>
                  <div className="rounded-lg p-4 bg-white/[0.03] border border-white/10 space-y-2">
                    <div className="flex justify-between text-[11px] text-[#3AC1FF]"><span>LEAD 3D WEB ENGINEER</span><span>2021 - 2023</span></div>
                    <h3 className="text-white text-[13px] font-semibold">Interactive Web Products</h3>
                    <p className="text-white/70 text-[11px]">Architected Three.js WebGL graphics engines, custom shader effects, and scalable frontend architectures for web applications.</p>
                  </div>
                  <div className="rounded-lg p-4 bg-white/[0.03] border border-white/10 space-y-2">
                    <div className="flex justify-between text-[11px] text-[#2EC4B6]"><span>FULL-STACK SOFTWARE DEVELOPER</span><span>2019 - 2021</span></div>
                    <h3 className="text-white text-[13px] font-semibold">Web Software & UI Engineering</h3>
                    <p className="text-white/70 text-[11px]">Developed web application features, REST APIs, state management pipelines, and modern Tailwind UI component design systems.</p>
                  </div>
                  <div className="pt-3 flex flex-wrap gap-3">
                    <button onClick={() => setActiveDrawer('skills')} className="px-4 py-2 rounded-full font-mono text-[11px] uppercase font-semibold bg-[#FF8C42] text-white">View Skills</button>
                    <button onClick={() => setActiveDrawer(null)} className="px-4 py-2 rounded-full font-mono text-[11px] uppercase border border-white/20 text-white/80">Close</button>
                  </div>
                </div>
              </>
            )}

            {/* Publications Drawer */}
            {activeDrawer === 'publications' && (
              <>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#4488FF]/40 bg-[#4488FF]/10 mb-4">
                  <span className="w-2 h-2 rounded-full bg-[#4488FF] animate-ping" />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#4488FF]">Literature Topology</span>
                </div>
                <h2 className="font-serif text-[26px] font-medium text-white leading-tight mb-1">Publications</h2>
                <p className="font-mono text-[11px] text-[#4488FF] mb-6">244 Peer-Reviewed Papers · 21,285 Connection Edges</p>
                <div className="space-y-4 font-mono text-[12px]">
                  <p className="text-white/80">Explore the 244 papers mapped across 9 modular communities in this 3D interactive network (1994 - 2026).</p>
                  <div className="rounded-lg p-4 bg-white/[0.03] border border-white/10 space-y-2">
                    <span className="text-[11px] text-[#4488FF]">FOUNDATIONAL PAPER</span>
                    <h3 className="text-white text-[13px] font-semibold">The Economy of Brain Network Organization</h3>
                    <p className="text-white/70 text-[11px]">Bullmore & Sporns (2012) · Nature Reviews Neuroscience · 4,210 citations</p>
                  </div>
                  <div className="pt-3 flex flex-wrap gap-3">
                    <button onClick={() => setActiveDrawer('work')} className="px-4 py-2 rounded-full font-mono text-[11px] uppercase font-semibold bg-[#4488FF] text-white">View Work</button>
                    <button onClick={() => setActiveDrawer(null)} className="px-4 py-2 rounded-full font-mono text-[11px] uppercase border border-white/20 text-white/80">Close</button>
                  </div>
                </div>
              </>
            )}

            {/* Skills Drawer */}
            {activeDrawer === 'skills' && (
              <>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#FFD93D]/40 bg-[#FFD93D]/10 mb-4">
                  <span className="w-2 h-2 rounded-full bg-[#FFD93D] animate-ping" />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#FFD93D]">Full-Stack Tech Stack · M. Hassan</span>
                </div>
                <h2 className="font-serif text-[26px] font-medium text-white leading-tight mb-1">Skills</h2>
                <p className="font-mono text-[11px] text-[#FFD93D] mb-6">Frontend · Backend · 3D/WebGL · AI · Design · DevOps</p>

                <div className="space-y-4 font-mono text-[12px]">

                  {/* Frontend */}
                  <div className="rounded-lg p-4 bg-white/[0.03] border border-white/10 space-y-2">
                    <h3 className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: '#3AC1FF' }}>⚛ Frontend Development</h3>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {['React', 'Next.js', 'TypeScript', 'JavaScript (ES2024)', 'Vite', 'HTML5', 'CSS3', 'Tailwind CSS', 'Framer Motion', 'React Query', 'Zustand', 'Redux Toolkit', 'SWR', 'Radix UI', 'shadcn/ui'].map(s => (
                        <span key={s} className="px-2.5 py-1 rounded-full text-[10px] border border-[#3AC1FF]/20 text-[#3AC1FF]/90" style={{ background: 'rgba(58,193,255,0.07)' }}>{s}</span>
                      ))}
                    </div>
                  </div>

                  {/* Backend */}
                  <div className="rounded-lg p-4 bg-white/[0.03] border border-white/10 space-y-2">
                    <h3 className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: '#34D399' }}>🖥 Backend & APIs</h3>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {['Node.js', 'Express.js', 'Fastify', 'Python', 'FastAPI', 'REST APIs', 'GraphQL', 'WebSockets', 'tRPC', 'Prisma', 'Drizzle ORM', 'Mongoose', 'Zod'].map(s => (
                        <span key={s} className="px-2.5 py-1 rounded-full text-[10px] border border-[#34D399]/20 text-[#34D399]/90" style={{ background: 'rgba(52,211,153,0.07)' }}>{s}</span>
                      ))}
                    </div>
                  </div>

                  {/* 3D & WebGL */}
                  <div className="rounded-lg p-4 bg-white/[0.03] border border-white/10 space-y-2">
                    <h3 className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: '#FFD03A' }}>✦ 3D, WebGL & Visualization</h3>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {['Three.js', 'React Three Fiber', 'WebGL Shaders', 'GLSL', 'D3.js', 'Force-Graph 3D', 'EffectComposer', 'UnrealBloomPass', 'Drei', 'Leva', 'Recharts', 'Chart.js', 'Visx'].map(s => (
                        <span key={s} className="px-2.5 py-1 rounded-full text-[10px] border border-[#FFD03A]/20 text-[#FFD03A]/90" style={{ background: 'rgba(255,208,58,0.07)' }}>{s}</span>
                      ))}
                    </div>
                  </div>

                  {/* AI & ML */}
                  <div className="rounded-lg p-4 bg-white/[0.03] border border-white/10 space-y-2">
                    <h3 className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: '#A78BFA' }}>🤖 AI, ML & Data</h3>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {['OpenAI API', 'LangChain', 'Hugging Face', 'PyTorch', 'TensorFlow', 'scikit-learn', 'pandas', 'NumPy', 'Jupyter', 'Prompt Engineering', 'RAG Pipelines', 'Vector Databases', 'Pinecone'].map(s => (
                        <span key={s} className="px-2.5 py-1 rounded-full text-[10px] border border-[#A78BFA]/20 text-[#A78BFA]/90" style={{ background: 'rgba(167,139,250,0.07)' }}>{s}</span>
                      ))}
                    </div>
                  </div>

                  {/* Databases */}
                  <div className="rounded-lg p-4 bg-white/[0.03] border border-white/10 space-y-2">
                    <h3 className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: '#FF8C42' }}>🗄 Databases & Storage</h3>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {['PostgreSQL', 'MongoDB', 'MySQL', 'Redis', 'Supabase', 'PlanetScale', 'Firebase', 'Cloudflare D1', 'SQLite', 'Neon DB'].map(s => (
                        <span key={s} className="px-2.5 py-1 rounded-full text-[10px] border border-[#FF8C42]/20 text-[#FF8C42]/90" style={{ background: 'rgba(255,140,66,0.07)' }}>{s}</span>
                      ))}
                    </div>
                  </div>

                  {/* UI/UX Design */}
                  <div className="rounded-lg p-4 bg-white/[0.03] border border-white/10 space-y-2">
                    <h3 className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: '#FF2B55' }}>🎨 UI/UX & Design</h3>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {['Figma', 'Adobe XD', 'Framer', 'Glassmorphism', 'Motion Design', 'Design Systems', 'Responsive Design', 'Dark Mode', 'Micro-animations', 'Accessibility (WCAG)', 'Prototyping'].map(s => (
                        <span key={s} className="px-2.5 py-1 rounded-full text-[10px] border border-[#FF2B55]/20 text-[#FF2B55]/90" style={{ background: 'rgba(255,43,85,0.07)' }}>{s}</span>
                      ))}
                    </div>
                  </div>

                  {/* DevOps & Cloud */}
                  <div className="rounded-lg p-4 bg-white/[0.03] border border-white/10 space-y-2">
                    <h3 className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: '#2EC4B6' }}>☁ DevOps & Cloud</h3>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {['Vercel', 'Netlify', 'AWS (EC2/S3)', 'Docker', 'GitHub Actions', 'CI/CD Pipelines', 'Cloudflare Workers', 'Railway', 'Render', 'Linux/Bash', 'Nginx'].map(s => (
                        <span key={s} className="px-2.5 py-1 rounded-full text-[10px] border border-[#2EC4B6]/20 text-[#2EC4B6]/90" style={{ background: 'rgba(46,196,182,0.07)' }}>{s}</span>
                      ))}
                    </div>
                  </div>

                  {/* Tools & Workflow */}
                  <div className="rounded-lg p-4 bg-white/[0.03] border border-white/10 space-y-2">
                    <h3 className="text-[11px] uppercase tracking-wider font-semibold text-white/60">🛠 Dev Tools & Workflow</h3>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {['Git & GitHub', 'VS Code', 'Postman', 'ESLint', 'Prettier', 'Vitest', 'Jest', 'Playwright', 'Turborepo', 'pnpm', 'Bun', 'Chrome DevTools'].map(s => (
                        <span key={s} className="px-2.5 py-1 rounded-full text-[10px] border border-white/10 text-white/70" style={{ background: 'rgba(255,255,255,0.04)' }}>{s}</span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 flex flex-wrap gap-3">
                    <button onClick={() => setActiveDrawer('contact')} className="px-4 py-2 rounded-full font-mono text-[11px] uppercase font-semibold bg-[#FFD93D] text-black">Get in Touch</button>
                    <button onClick={() => setActiveDrawer('projects')} className="px-4 py-2 rounded-full font-mono text-[11px] uppercase border border-white/20 text-white/80">View Projects</button>
                    <button onClick={() => setActiveDrawer(null)} className="px-4 py-2 rounded-full font-mono text-[11px] uppercase border border-white/10 text-white/50">Close</button>
                  </div>
                </div>
              </>
            )}


            {/* Contact Drawer */}
            {activeDrawer === 'contact' && (
              <>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#A855F7]/40 bg-[#A855F7]/10 mb-4">
                  <span className="w-2 h-2 rounded-full bg-[#A855F7] animate-ping" />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#A855F7]">Get in Touch</span>
                </div>
                <h2 className="font-serif text-[26px] font-medium text-white leading-tight mb-1">Contact</h2>
                <p className="font-mono text-[11px] text-[#A855F7] mb-6">Open for Collaborations & Research Engineering</p>
                <div className="space-y-4 font-mono text-[12px]">
                  <p className="text-white/80">Interested in connectomics, 3D data visualization, or graph AI engineering?</p>
                  <div className="pt-2 space-y-2">
                    <a href="mailto:contact@connectome-portfolio.io" className="block p-3 rounded-lg bg-white/[0.05] hover:bg-white/10 text-[#A855F7] font-semibold">
                      ✉ contact@connectome-portfolio.io
                    </a>
                    <a href="https://github.com" target="_blank" rel="noreferrer" className="block p-3 rounded-lg bg-white/[0.05] hover:bg-white/10 text-white">
                      ⚙ GitHub / Code Repositories
                    </a>
                    <a href="https://scholar.google.com" target="_blank" rel="noreferrer" className="block p-3 rounded-lg bg-white/[0.05] hover:bg-white/10 text-white">
                      🎓 Google Scholar Profile
                    </a>
                  </div>
                  <div className="pt-3 flex flex-wrap gap-3">
                    <button onClick={() => setActiveDrawer(null)} className="px-4 py-2 rounded-full font-mono text-[11px] uppercase border border-white/20 text-white/80">Close</button>
                  </div>
                </div>
              </>
            )}
            </div>{/* end inner scroll wrapper */}
          </div>
        </div>
      )}






      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 0.2; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1.15); } }
      `}</style>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Data normalization helper                                          */
/* ------------------------------------------------------------------ */
function normalizeData(rawData: NetworkData): NetworkData {
  return {
    nodes: rawData.nodes.map(n => ({
      ...n,
      authors: typeof n.authors === 'string' ? n.authors : (n.authors as any).join(', '),
      link_url: n.link_url || (n.doi && `https://doi.org/${n.doi}`) || undefined,
      link_type: n.link_type || (n.doi ? 'doi' : undefined),
    })),
    links: rawData.links,
  };
}
