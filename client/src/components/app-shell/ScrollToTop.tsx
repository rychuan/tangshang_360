import React, { useEffect, useState } from 'react';
import { ArrowUp } from '@/components/ui/hugeicons';
import { Button } from '@/components/ui/button';

interface ScrollToTopProps {
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

export function ScrollToTop({ containerRef }: ScrollToTopProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (containerRef?.current) {
      const el = containerRef.current;
      const onScroll = () => setVisible(el.scrollTop > el.clientHeight);
      el.addEventListener('scroll', onScroll, { passive: true });
      return () => el.removeEventListener('scroll', onScroll);
    }
    const onScroll = () => setVisible(window.scrollY > window.innerHeight);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [containerRef]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <Button
        variant="secondary"
        size="icon"
        className="size-10 rounded-full shadow-lg transition-shadow hover:shadow-xl"
        onClick={() => {
          if (containerRef?.current) {
            containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }}
        aria-label="回到顶部"
      >
        <ArrowUp className="size-5" />
      </Button>
    </div>
  );
}
