import { useId, useRef } from 'react';
import { DIAS_SEMANA } from '../../domain/gradeRules';
import useAccessibleDialog from '../../hooks/useAccessibleDialog';
import EncaixeLista from './EncaixeLista';
import '../Modal/Modal.css';
import './Sugestoes.css';

const pad2 = valor => String(valor).padStart(2, '0');

/** Desktop: clique num horário vazio da grade e veja as matérias com turma livre ali. */
export default function EncaixeModal({ slot, resultado, onEscolher, onClose }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const titleId = `encaixe-${useId().replace(/:/g, '')}`;

  useAccessibleDialog({ open: Boolean(slot), onClose, dialogRef, initialFocusRef: closeRef });
  if (!slot) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal-content modal-content--encaixe"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <button ref={closeRef} className="modal-close" type="button" onClick={onClose} aria-label="Fechar">
          <i className="fi fi-br-cross-small" aria-hidden="true" />
        </button>
        <h3 className="modal-titulo" id={titleId}>
          O que encaixa {DIAS_SEMANA[slot.dia]} {pad2(slot.hora)}:00
        </h3>
        <p className="encaixe__sub">
          Turmas com aula neste horário que não chocam com a sua grade. Clique numa turma para adicionar.
        </p>
        <div className="modal-content__scroll">
          <EncaixeLista resultado={resultado} onEscolher={onEscolher} />
        </div>
      </div>
    </div>
  );
}
