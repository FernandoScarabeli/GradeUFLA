import { useEffect, useId, useRef, useState } from 'react';
import './Planos.css';

const MENU_FECHADO = null;

/**
 * Abas Plano A | B | C com os créditos de cada uma, mais o menu "Duplicar em…" e
 * "Limpar plano". Usada na montagem do desktop (acima da grade) e do celular.
 */
export default function PlanosBar({
  ativo,
  planos,
  onTrocar,
  onDuplicar,
  onLimpar,
  onAviso,
  variante = 'desktop'
}) {
  const [menu, setMenu] = useState(MENU_FECHADO);
  const wrapRef = useRef(null);
  const botaoMenuRef = useRef(null);
  const menuId = `planos-menu-${useId().replace(/:/g, '')}`;
  const atual = planos.find(plano => plano.id === ativo);
  const outros = planos.filter(plano => plano.id !== ativo);

  const fecharMenu = ({ focar = false } = {}) => {
    setMenu(MENU_FECHADO);
    if (focar) botaoMenuRef.current?.focus();
  };

  useEffect(() => {
    if (menu === MENU_FECHADO) return undefined;
    const fora = event => {
      if (!wrapRef.current?.contains(event.target)) setMenu(MENU_FECHADO);
    };
    document.addEventListener('pointerdown', fora);
    return () => document.removeEventListener('pointerdown', fora);
  }, [menu]);

  const duplicar = destino => {
    onDuplicar(destino.id);
    onAviso?.(`Plano ${ativo} copiado no Plano ${destino.id}.`);
    fecharMenu({ focar: true });
  };

  const pedirDuplicar = destino => {
    if (destino.vazio) duplicar(destino);
    else setMenu({ tipo: 'duplicar', destino });
  };

  const limpar = () => {
    onLimpar();
    onAviso?.(`Plano ${ativo} limpo.`);
    fecharMenu({ focar: true });
  };

  const tecladoAbas = event => {
    const indice = planos.findIndex(plano => plano.id === ativo);
    const passos = { ArrowRight: 1, ArrowLeft: -1 };
    let novo = null;
    if (passos[event.key]) novo = (indice + passos[event.key] + planos.length) % planos.length;
    if (event.key === 'Home') novo = 0;
    if (event.key === 'End') novo = planos.length - 1;
    if (novo === null) return;
    event.preventDefault();
    onTrocar(planos[novo].id);
    event.currentTarget.querySelector(`[data-plano="${planos[novo].id}"]`)?.focus();
  };

  let conteudoMenu = null;
  if (menu?.tipo === 'duplicar') {
    conteudoMenu = (
      <>
        <p className="planos__menu-texto">
          O Plano {menu.destino.id} já tem matérias. Trocar pelo que está no Plano {ativo}?
        </p>
        <div className="planos__menu-acoes">
          <button type="button" className="planos__menu-btn planos__menu-btn--perigo" onClick={() => duplicar(menu.destino)}>
            Substituir
          </button>
          <button type="button" className="planos__menu-btn" onClick={() => setMenu('lista')}>Cancelar</button>
        </div>
      </>
    );
  } else if (menu === 'limpar') {
    conteudoMenu = (
      <>
        <p className="planos__menu-texto">Tirar todas as matérias do Plano {ativo}?</p>
        <div className="planos__menu-acoes">
          <button type="button" className="planos__menu-btn planos__menu-btn--perigo" onClick={limpar}>
            Limpar
          </button>
          <button type="button" className="planos__menu-btn" onClick={() => setMenu('lista')}>Cancelar</button>
        </div>
      </>
    );
  } else if (menu === 'lista') {
    conteudoMenu = (
      <>
        <p className="planos__menu-titulo">Duplicar este plano em…</p>
        {outros.map(destino => (
          <button
            key={destino.id}
            type="button"
            className="planos__menu-item"
            onClick={() => pedirDuplicar(destino)}
            disabled={atual?.vazio}
            aria-label={`Duplicar em Plano ${destino.id}`}
          >
            <i className="fi fi-br-copy" aria-hidden="true" />
            Plano {destino.id}
            <span className="planos__menu-meta">{destino.vazio ? 'vazio' : `${destino.creditos} cr`}</span>
          </button>
        ))}
        <hr className="planos__menu-sep" />
        <button
          type="button"
          className="planos__menu-item planos__menu-item--perigo"
          onClick={() => setMenu('limpar')}
          disabled={atual?.vazio}
        >
          <i className="fi fi-br-trash" aria-hidden="true" />
          Limpar Plano {ativo}
        </button>
      </>
    );
  }

  return (
    <div className={`planos planos--${variante}`} ref={wrapRef}>
      <div className="planos__tabs" role="tablist" aria-label="Planos" onKeyDown={tecladoAbas}>
        {planos.map(plano => (
          <button
            key={plano.id}
            type="button"
            role="tab"
            className="planos__tab"
            data-plano={plano.id}
            aria-selected={plano.id === ativo}
            aria-label={`Plano ${plano.id}, ${plano.creditos} créditos`}
            tabIndex={plano.id === ativo ? 0 : -1}
            onClick={() => onTrocar(plano.id)}
          >
            <span className="planos__tab-nome">{variante === 'mobile' ? plano.id : `Plano ${plano.id}`}</span>
            <span className="planos__tab-cr">{plano.creditos} cr</span>
          </button>
        ))}
      </div>

      <div className="planos__menu-wrap">
        <button
          ref={botaoMenuRef}
          type="button"
          className="planos__opcoes"
          aria-haspopup="true"
          aria-expanded={menu !== MENU_FECHADO}
          aria-controls={menuId}
          aria-label={`Opções do Plano ${ativo}`}
          title={`Opções do Plano ${ativo}`}
          onClick={() => setMenu(aberto => (aberto === MENU_FECHADO ? 'lista' : MENU_FECHADO))}
        >
          <i className="fi fi-br-menu-dots" aria-hidden="true" />
        </button>
        {menu !== MENU_FECHADO && (
          <div
            id={menuId}
            className="planos__menu"
            role="group"
            aria-label={`Opções do Plano ${ativo}`}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                fecharMenu({ focar: true });
              }
            }}
          >
            {conteudoMenu}
          </div>
        )}
      </div>
    </div>
  );
}
