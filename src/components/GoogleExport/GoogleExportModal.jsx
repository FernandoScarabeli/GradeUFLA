import { useId, useRef } from 'react';
import useAccessibleDialog from '../../hooks/useAccessibleDialog';
import GoogleExportForm from './GoogleExportForm';
import '../Modal/PrerequisiteModal.css';

/** Versão desktop: modal centralizado, no mesmo estilo do de pré-requisito. */
export default function GoogleExportModal({ exportacao }) {
  const dialogRef = useRef(null);
  const titleId = `gcal-modal-title-${useId().replace(/:/g, '')}`;

  useAccessibleDialog({ open: exportacao.aberto, onClose: exportacao.fechar, dialogRef });

  if (!exportacao.aberto) return null;

  return (
    <div className="minimo-modal-overlay" onClick={exportacao.fechar}>
      <div
        ref={dialogRef}
        className="minimo-modal gcal-modal"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h3 id={titleId}>Exportar pro Google Agenda</h3>
        <GoogleExportForm
          periodoInicial={exportacao.periodoInicial}
          exportando={exportacao.exportando}
          onExportar={exportacao.exportar}
          onCancelar={exportacao.fechar}
        />
      </div>
    </div>
  );
}
