import { useCallback, useEffect, useState } from 'react';

const TEMPO_COM_ACAO = 5000;
const TEMPO_SEM_ACAO = 3200;
let proximoId = 0;

/** Uma mensagem por vez; a nova substitui a anterior (é o que se espera de um "Desfazer"). */
export function useSnackbar() {
  const [snack, setSnack] = useState(null);

  const mostrar = useCallback((texto, { acao = null, erro = false } = {}) => {
    proximoId += 1;
    setSnack({ id: proximoId, texto, acao, erro, aberto: true });
  }, []);

  const fechar = useCallback(() => {
    setSnack(atual => (atual ? { ...atual, aberto: false } : atual));
  }, []);

  useEffect(() => {
    if (!snack?.aberto) return undefined;
    const timer = setTimeout(fechar, snack.acao ? TEMPO_COM_ACAO : TEMPO_SEM_ACAO);
    return () => clearTimeout(timer);
  }, [snack, fechar]);

  return { snack, mostrar, fechar };
}

export default function Snackbar({ snack, onClose }) {
  const aberto = Boolean(snack?.aberto);
  return (
    <div
      className="m-snack"
      data-open={aberto}
      data-erro={Boolean(snack?.erro)}
      role="status"
      aria-live="polite"
      inert={!aberto}
    >
      <span>{snack?.texto}</span>
      {snack?.acao && (
        <button
          type="button"
          onClick={() => {
            snack.acao.onClick();
            onClose();
          }}
        >
          {snack.acao.label}
        </button>
      )}
    </div>
  );
}
