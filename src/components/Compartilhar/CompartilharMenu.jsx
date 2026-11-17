import { useEffect, useId, useRef, useState } from 'react';
import './Compartilhar.css';

/**
 * Itens do "Compartilhar" (PNG, Google Agenda, link, Web Share, comparar).
 * O mesmo array alimenta o menu do desktop e a gaveta do celular.
 */
export function montarItensCompartilhar({
  baixarPng,
  rotuloPng = 'Baixar PNG da grade',
  google,
  copiarLink,
  compartilhar,
  podeCompartilhar,
  onComparar
}) {
  return [
    { id: 'png', texto: 'Baixar imagem (PNG)', rotulo: rotuloPng, icone: 'fi-br-download', acao: baixarPng },
    google?.disponivel && {
      id: 'agenda',
      texto: google.exportando ? 'Exportando…' : 'Exportar pro Google Agenda',
      rotulo: 'Exportar pro Google Agenda',
      icone: 'fi-br-calendar-arrow-up',
      acao: google.abrir,
      desativado: google.exportando
    },
    { id: 'link', texto: 'Copiar link da grade', icone: 'fi-br-link', acao: copiarLink },
    podeCompartilhar && { id: 'share', texto: 'Compartilhar…', icone: 'fi-br-share', acao: compartilhar },
    onComparar && { id: 'comparar', texto: 'Comparar horários com amigos', icone: 'fi-br-users', acao: onComparar }
  ].filter(Boolean);
}

export function ListaCompartilhar({ itens, onEscolher, className = 'compartilhar__lista' }) {
  return (
    <div className={className}>
      {itens.map(item => (
        <button
          key={item.id}
          type="button"
          className="compartilhar__item"
          aria-label={item.rotulo}
          disabled={item.desativado}
          onClick={() => {
            onEscolher?.();
            item.acao?.();
          }}
        >
          <i className={`fi ${item.icone}`} aria-hidden="true" />
          <span>{item.texto}</span>
        </button>
      ))}
    </div>
  );
}

/** Botão "Compartilhar" com menu suspenso (desktop). */
export default function CompartilharMenu({ itens }) {
  const [aberto, setAberto] = useState(false);
  const wrapRef = useRef(null);
  const botaoRef = useRef(null);
  const menuId = `compartilhar-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = event => {
      if (!wrapRef.current?.contains(event.target)) setAberto(false);
    };
    document.addEventListener('pointerdown', fora);
    return () => document.removeEventListener('pointerdown', fora);
  }, [aberto]);

  return (
    <div
      className="compartilhar"
      ref={wrapRef}
      onKeyDown={event => {
        if (event.key === 'Escape' && aberto) {
          event.stopPropagation();
          setAberto(false);
          botaoRef.current?.focus();
        }
      }}
    >
      <button
        ref={botaoRef}
        type="button"
        className="calendar__download-like compartilhar__botao"
        aria-haspopup="true"
        aria-expanded={aberto}
        aria-controls={menuId}
        onClick={() => setAberto(atual => !atual)}
      >
        <i className="fi fi-br-share" aria-hidden="true" />
        <span>Compartilhar</span>
      </button>
      {aberto && (
        <div id={menuId} className="compartilhar__menu" role="group" aria-label="Compartilhar a grade">
          <ListaCompartilhar itens={itens} onEscolher={() => setAberto(false)} />
        </div>
      )}
    </div>
  );
}
