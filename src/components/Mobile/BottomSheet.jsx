import { useRef } from 'react';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import useAccessibleDialog from '../../hooks/useAccessibleDialog';
import useBackToClose from './useBackToClose';

// Curva de gaveta do iOS (Ionic): sai rápido e assenta devagar.
const EASE_DRAWER = [0.32, 0.72, 0, 1];
const ENTRADA = { type: 'tween', duration: 0.32, ease: EASE_DRAWER };
const SAIDA = { type: 'tween', duration: 0.22, ease: EASE_DRAWER };
const DISTANCIA_PARA_FECHAR = 110;
const VELOCIDADE_PARA_FECHAR = 500;

function SheetPanel({ onClose, titleId, children }) {
  const dialogRef = useRef(null);
  const dragControls = useDragControls();

  useAccessibleDialog({ open: true, onClose, dialogRef });

  const iniciarArraste = event => {
    // Botões do cabeçalho continuam sendo botões.
    if (event.target.closest('button, input, a')) return;
    dragControls.start(event);
  };

  return (
    <>
      <motion.div
        className="m-backdrop"
        aria-hidden="true"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: ENTRADA }}
        exit={{ opacity: 0, transition: SAIDA }}
      />
      <motion.section
        ref={dialogRef}
        className="m-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={{ y: '100%' }}
        animate={{ y: 0, transition: ENTRADA }}
        exit={{ y: '100%', transition: SAIDA }}
        drag="y"
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.04, bottom: 0.9 }}
        dragTransition={{ bounceStiffness: 500, bounceDamping: 40 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > DISTANCIA_PARA_FECHAR || info.velocity.y > VELOCIDADE_PARA_FECHAR) {
            onClose();
          }
        }}
      >
        <div className="m-sheet__grab" aria-hidden="true" onPointerDown={iniciarArraste}><i /></div>
        <div className="m-sheet__body" onPointerDown={event => {
          // O cabeçalho também arrasta; a lista rola normalmente.
          if (event.target.closest('.m-sheet__head')) iniciarArraste(event);
        }}>
          {children}
        </div>
      </motion.section>
    </>
  );
}

/** Gaveta inferior acessível: foco preso, Esc, botão voltar e arrastar para fechar. */
export default function BottomSheet({ open, onClose, titleId, children }) {
  useBackToClose(open, onClose);

  return (
    <AnimatePresence>
      {open && (
        <SheetPanel key="sheet" onClose={onClose} titleId={titleId}>
          {children}
        </SheetPanel>
      )}
    </AnimatePresence>
  );
}

/** Cabeçalho padrão das gavetas: voltar (opcional), título e fechar. */
export function SheetHead({ titleId, title, onBack, onClose }) {
  return (
    <div className="m-sheet__head">
      {onBack && (
        <button className="m-iconbtn" type="button" onClick={onBack} aria-label="Voltar">
          <i className="fi fi-br-angle-left" aria-hidden="true" />
        </button>
      )}
      <h2 id={titleId}>{title}</h2>
      <button className="m-iconbtn" type="button" onClick={onClose} aria-label="Fechar">
        <i className="fi fi-br-cross-small" aria-hidden="true" />
      </button>
    </div>
  );
}
