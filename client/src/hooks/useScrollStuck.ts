import { useEffect, useState } from 'react';

/**
 * 监听页面滚动，在滚动超过阈值后返回 true。
 * 用于给 sticky 元素添加阴影等视觉反馈，消除突兀的固定切换感。
 */
export function useScrollStuck(threshold = 8): boolean {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setStuck(window.scrollY > threshold);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  return stuck;
}
