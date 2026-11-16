import { useId, useRef } from 'react';
import { getNomeMateriaOuCodigo } from '../../data';
import useAccessibleDialog from '../../hooks/useAccessibleDialog';
import './PrerequisiteModal.css';

const TITULO_POR_TIPO = {
  forte: 'Confirmação - Pré-requisito Forte',
  minimo: 'Confirmação - Pré-requisito Mínimo',
  coreq: 'Confirmação - Co-requisito'
};

export default function PrerequisiteModal({
  modal,
  onClose,
  onConfirm,
  confirmLabel = 'Sim, destravar matéria'
}) {
  const dialogRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const titleId = `prerequisite-modal-title-${useId().replace(/:/g, '')}`;

  useAccessibleDialog({
    open: modal.open,
    onClose,
    dialogRef,
    initialFocusRef: cancelButtonRef
  });

  if (!modal.open) return null;

  const nomes = modal.prereqs.map(getNomeMateriaOuCodigo).join(', ');

  return (
    <div className="minimo-modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="minimo-modal"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h3 id={titleId}>{TITULO_POR_TIPO[modal.tipo] || 'Confirmação de pré-requisito'}</h3>
        {modal.tipo === 'forte' && (
          <>
            <p>
              Você já cursou e foi <strong>aprovado</strong> em <strong>{nomes}</strong>?
            </p>
            <p className="minimo-modal__hint">
              Você só pode cursar esta matéria se tiver sido <strong>aprovado</strong> em{' '}
              <strong>{nomes}</strong>.
            </p>
          </>
        )}

        {modal.tipo === 'minimo' && (
          <p>
            Você já cursou <strong>{nomes}</strong> sem ter sido reprovado por frequência e
            obteve média final mínima (≥ 50 pontos)?
          </p>
        )}

        {modal.tipo === 'coreq' && (
          <>
            <p>
              Você já cursou e foi <strong>aprovado</strong> em <strong>{nomes}</strong>?
            </p>
            <p className="minimo-modal__hint">
              Para cursar esta matéria, você deve estar <strong>aprovado</strong> em{' '}
              <strong>{nomes}</strong> ou <strong>cursá-la(s) junto</strong> no mesmo semestre.
            </p>
          </>
        )}

        <div className="minimo-modal-actions">
          <button ref={cancelButtonRef} type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
