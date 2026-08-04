/**
 * Shared muted dark-academia color palette for all analysis sections.
 * Replaces bright crayon colors with desaturated jewel tones.
 */

export const SCHOOL_COLORS: Record<number, string> = {
  0: '#4A5A8C', // slate blue     (was #FF6B6B)
  1: '#5B8C7B', // sage           (was #4ECDC4)
  2: '#6E8C5B', // olive          (was #44AA44)
  3: '#8C5B7B', // dusty plum     (was #C44EC4)
  4: '#B07A4A', // burnt sienna   (was #FF8C42)
  5: '#4A6E8C', // denim          (was #4488FF)
  6: '#B89A4A', // antique gold   (was #FFD93D)
  7: '#4A8C8C', // muted teal     (was #2DD4BF)
  8: '#6E5B8C', // muted aubergine(was #A855F7)
};

/** Full portfolio section names indexed by community id */
export const SCHOOL_NAMES: Record<number, string> = {
  0: 'Work & Research Papers',
  1: 'Featured Projects & WebGL',
  2: 'About Me & Core Focus',
  3: 'Services & Consulting',
  4: 'Experience & Background',
  5: 'Publications & Topology',
  6: 'Skills & Tech Stack',
  8: 'Contact & Collaborations',
};

/** Short abbreviations for compact UI */
export const SCHOOL_SHORT = [
  'Foundations', 'fMRI/DMN', 'Structural', 'Dynamic FC', 'Clinical',
  'Hubs', 'Precision', 'Methods', 'arXiv',
];
