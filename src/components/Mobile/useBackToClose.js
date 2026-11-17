import { useEffect, useRef } from 'react';

// No Android o botão "voltar" é o gesto natural para fechar uma gaveta. Sem isto
// ele navegaria para a etapa anterior do App, que limpa a grade inteira.
// Cada gaveta aberta ganha uma entrada no histórico; fechar pela interface
// consome essa entrada. Só existe uma gaveta aberta por vez.
const estado = {
  querEntrada: false,
  voltaPendente: false,
  aoFechar: null,
  instalado: false
};

const empilhar = () => {
  try {
    window.history.pushState({ ...(window.history.state || {}), mSheet: true }, '', window.location.href);
  } catch {
    // Alguns ambientes (iframes restritos) não permitem alterar o histórico.
  }
};

const aoVoltar = () => {
  if (estado.voltaPendente) {
    // É o "voltar" que nós mesmos disparamos ao fechar pela interface.
    estado.voltaPendente = false;
    if (estado.querEntrada) empilhar();
    return;
  }
  if (estado.querEntrada) {
    estado.querEntrada = false;
    estado.aoFechar?.();
  }
};

const instalar = () => {
  if (estado.instalado || typeof window === 'undefined') return;
  window.addEventListener('popstate', aoVoltar);
  estado.instalado = true;
};

export default function useBackToClose(open, onClose) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    instalar();
    estado.querEntrada = true;
    estado.aoFechar = () => onCloseRef.current?.();
    if (!estado.voltaPendente) empilhar();

    return () => {
      if (!estado.querEntrada) return; // já fechou pelo botão voltar
      estado.querEntrada = false;
      estado.aoFechar = null;
      if (window.history.state?.mSheet) {
        estado.voltaPendente = true;
        window.history.back();
      }
    };
  }, [open]);
}
