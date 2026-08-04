import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { label: 'Network', href: '#network' },
  { label: 'Schools', href: '#schools' },
  { label: 'Debates', href: '#debates' },
  { label: 'Gap', href: '#gap' },
  { label: 'Analysis', href: '#analysis' },
  { label: 'Evidence', href: '#evidence' },
  { label: 'Upload', href: '#upload' },
  { label: 'Download', href: '#download' },
];

export default function Navbar() {
  const [isLight, setIsLight] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      const threshold = window.innerHeight * 0.8;
      setIsLight(window.scrollY > threshold);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const el = document.querySelector(href);
    if (el) {
      const navHeight = 52;
      const top = el.getBoundingClientRect().top + window.scrollY - navHeight;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  return (
    <nav
      ref={navRef}
      className={cn(
        'fixed top-0 left-0 right-0 h-[52px] z-sticky-nav flex items-center justify-between px-4 md:px-6 transition-all duration-300',
        isLight
          ? 'bg-[rgba(250,249,246,0.92)] border-b border-[#E5E2DC] backdrop-blur-[16px]'
          : 'bg-[rgba(0,0,0,0.75)] border-b border-[rgba(255,255,255,0.08)] backdrop-blur-[16px]'
      )}
    >
      {/* Logo */}
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        className="font-mono text-[14px] font-semibold text-star-gold tracking-wide shrink-0"
      >
        M. Hasssssan
      </a>

      {/* Nav Links - Desktop */}
      <div className="hidden lg:flex items-center gap-1">
        {NAV_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            onClick={(e) => handleNavClick(e, link.href)}
            className={cn(
              'px-2 py-1.5 rounded-md font-mono text-[12px] uppercase tracking-[0.06em] transition-colors duration-200',
              isLight
                ? 'text-[#5A5C7A] hover:text-[#1A1B3A] hover:bg-[#F0EDE8]'
                : 'text-[rgba(255,255,255,0.6)] hover:text-white hover:bg-[rgba(255,255,255,0.08)]'
            )}
          >
            {link.label}
          </a>
        ))}
      </div>

      {/* Download Button */}
      <a
        href="#download"
        onClick={(e) => handleNavClick(e, '#download')}
        className={cn(
          'hidden sm:inline-flex items-center font-mono text-[12px] font-medium rounded-md px-3.5 py-1.5 border transition-all duration-200 shrink-0',
          isLight
            ? 'border-[#1A1B3A] text-[#1A1B3A] hover:bg-[#1A1B3A] hover:text-white'
            : 'border-star-gold text-star-gold hover:bg-star-gold hover:text-black'
        )}
      >
        Download Corpus
      </a>
    </nav>
  );
}
