import { useEffect } from 'react';
import { MotionConfig } from 'motion/react';
import './MobileFlow.css';

/** Tela cheia do app no celular: trava a rolagem da página e respeita reduced motion. */
export default function MobileShell({ children }) {
  useEffect(() => {
    const root = document.documentElement;
    const anterior = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = anterior;
    };
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="m-app">{children}</div>
    </MotionConfig>
  );
}
