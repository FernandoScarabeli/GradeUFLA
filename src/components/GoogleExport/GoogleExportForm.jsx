import { useId, useState } from 'react';
import './GoogleExport.css';

const BOTOES = {
  desktop: { cancelar: 'btn btn-secondary', confirmar: 'btn btn-primary', acoes: 'minimo-modal-actions', rotulo: 'Entrar com Google e exportar' },
  mobile: { cancelar: 'm-btn m-btn--ghost m-btn--sm', confirmar: 'm-btn m-btn--primary m-btn--sm', acoes: 'm-actions', rotulo: 'Exportar' }
};

/** Escolha do período e confirmação. `onExportar` devolve a mensagem de erro, ou null. */
export default function GoogleExportForm({ periodoInicial, exportando, onExportar, onCancelar, variante = 'desktop' }) {
  const [inicio, setInicio] = useState(periodoInicial?.inicio || '');
  const [fim, setFim] = useState(periodoInicial?.fim || '');
  const [erro, setErro] = useState(null);
  const id = useId();
  const classes = BOTOES[variante];

  const enviar = async event => {
    event.preventDefault();
    setErro(null);
    setErro(await onExportar({ inicio, fim }));
  };

  return (
    <form className={`gcal-form gcal-form--${variante}`} onSubmit={enviar} noValidate>
      <p className="gcal-form__lead">
        As aulas entram num calendário separado, <strong>Grade UFLA</strong>, repetindo toda semana
        no período que você escolher. Se exportar de novo, ele é substituído.
      </p>
      <div className="gcal-form__datas">
        <label htmlFor={`${id}-inicio`}>
          De
          <input
            id={`${id}-inicio`}
            type="date"
            required
            value={inicio}
            max={fim || undefined}
            onChange={event => setInicio(event.target.value)}
          />
        </label>
        <label htmlFor={`${id}-fim`}>
          Até
          <input
            id={`${id}-fim`}
            type="date"
            required
            value={fim}
            min={inicio || undefined}
            onChange={event => setFim(event.target.value)}
          />
        </label>
      </div>
      {erro && <p className="gcal-form__erro" role="alert">{erro}</p>}
      <div className={classes.acoes}>
        <button type="button" className={classes.cancelar} onClick={onCancelar} disabled={exportando}>
          Cancelar
        </button>
        <button type="submit" className={classes.confirmar} disabled={exportando} aria-busy={exportando}>
          {exportando ? 'Exportando…' : classes.rotulo}
        </button>
      </div>
    </form>
  );
}
