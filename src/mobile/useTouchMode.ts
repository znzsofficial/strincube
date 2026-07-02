import { useState, useEffect } from 'react';

export function useTouchMode() {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    const check = () => {
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth < 1024;
      setIsTouch(hasTouch && isSmallScreen);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return isTouch;
}
