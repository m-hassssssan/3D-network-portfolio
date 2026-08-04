import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function useScrollAnimation<T extends HTMLElement>(options?: {
  selector?: string;
  stagger?: number;
  y?: number;
  duration?: number;
  delay?: number;
}) {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const {
      selector = '.scroll-animate',
      stagger = 0.08,
      y = 30,
      duration = 0.6,
      delay = 0,
    } = options || {};

    const elements = container.querySelectorAll(selector);
    if (elements.length === 0) return;

    gsap.set(Array.from(elements), { y, opacity: 0 });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: container,
        start: 'top 80%',
        once: true,
      },
    });

    tl.to(Array.from(elements), {
      y: 0,
      opacity: 1,
      duration,
      delay,
      stagger,
      ease: 'power2.out',
    });

    return () => {
      tl.kill();
    };
  }, [options]);

  return containerRef;
}

export default useScrollAnimation;
