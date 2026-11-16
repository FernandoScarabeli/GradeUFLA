import { useEffect, useState } from 'react';

// Celular de verdade (toque) até tablet em retrato, ou qualquer janela estreita
// demais para a grade de 7 colunas. Só a largura não basta: um notebook com a
// janela reduzida continua com mouse, e um tablet largo continua sendo toque.
export const MOBILE_FLOW_QUERY = '(max-width: 760px), (pointer: coarse) and (max-width: 1100px)';

const matches = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia(MOBILE_FLOW_QUERY).matches
);

export default function useIsMobileFlow() {
  const [isMobile, setIsMobile] = useState(matches);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia(MOBILE_FLOW_QUERY);
    const handleChange = event => setIsMobile(event.matches);
    setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener?.('change', handleChange);
    return () => mediaQuery.removeEventListener?.('change', handleChange);
  }, []);

  return isMobile;
}
