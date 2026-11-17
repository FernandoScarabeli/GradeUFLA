import { useState } from 'react';
import { calcularTotalCreditos, formatarNomeProprio } from '../../domain/gradeRules';
import { getCorMateria } from '../Calendar/calendarUtils';
import SemanaLeitura from './SemanaLeitura';
import './GradeCompartilhada.css';

/**
 * Grade aberta por um link #g= em modo visualização: dá pra ver ou importar pra um
 * dos seus planos. Nada aqui altera a grade de quem abriu.
 */
export default function GradeCompartilhada({
  compartilhada,
  cursoNome,
  periodoAtual,
  avisos = [],
  planosDestino,
  onUsarComoPlano,
  onFechar
}) {
  const [escolhendo, setEscolhendo] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  const { grade, periodo, semestre, matriz } = compartilhada;
  const materias = Object.entries(grade);
  const vazia = materias.length === 0;
  const creditos = calcularTotalCreditos(grade);

  const escolher = plano => {
    if (plano.vazio) onUsarComoPlano(plano.id);
    else setConfirmar(plano);
  };

  return (
    <section className="gc" aria-labelledby="gc-titulo">
      <header className="gc__topo">
        <button className="btn-voltar" type="button" onClick={onFechar}>
          <i className="fi fi-br-arrow-left" aria-hidden="true" />
          <span className="btn-voltar__text">Voltar</span>
        </button>
        <div className="gc__titulos">
          <h2 id="gc-titulo" className="gc__titulo">Grade compartilhada de {periodo}</h2>
          <p className="gc__sub">
            {semestre}º semestre · {cursoNome} · Matriz {matriz} · {materias.length} {materias.length === 1 ? 'matéria' : 'matérias'} · {creditos} créditos
          </p>
        </div>
      </header>

      {(periodo !== periodoAtual || avisos.length > 0) && (
        <div className="gc__avisos" role="status">
          {periodo !== periodoAtual && (
            <p>
              <i className="fi fi-br-triangle-warning" aria-hidden="true" />
              Essa grade é de outro período ({periodo}); algumas turmas podem não existir mais.
            </p>
          )}
          {avisos.map(aviso => (
            <p key={aviso}><i className="fi fi-br-triangle-warning" aria-hidden="true" />{aviso}</p>
          ))}
        </div>
      )}

      {vazia ? (
        <p className="gc__vazia">Nenhuma matéria dessa grade existe mais no período atual.</p>
      ) : (
        <>
          <SemanaLeitura grade={grade} />
          <ul className="gc__legenda">
            {materias.map(([codigo, materia]) => (
              <li key={codigo}>
                <span className="gc__cor" style={{ background: getCorMateria(codigo, grade) }} aria-hidden="true" />
                <span>
                  <strong>{materia.nome}</strong> · Turma {materia.turmaId}
                  {materia.anp && ' (ANP)'}
                  {materia.professor && <> · {formatarNomeProprio(materia.professor)}</>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="gc__acoes">
        {!escolhendo && (
          <>
            <button className="btn-primary" type="button" disabled={vazia} onClick={() => setEscolhendo(true)}>
              Usar como meu plano…
            </button>
          </>
        )}

        {escolhendo && !confirmar && (
          <div className="gc__escolha" role="group" aria-labelledby="gc-escolha-titulo">
            <p id="gc-escolha-titulo">
              Em qual plano do seu {semestre}º semestre (matriz {matriz})?
            </p>
            <div className="gc__planos">
              {planosDestino.map(plano => (
                <button
                  key={plano.id}
                  type="button"
                  className="gc__plano"
                  aria-label={`Usar como meu Plano ${plano.id}${plano.vazio ? ' (vazio)' : ''}`}
                  onClick={() => escolher(plano)}
                >
                  <strong>Plano {plano.id}</strong>
                  <span>{plano.vazio ? 'vazio' : `${plano.quantidade} ${plano.quantidade === 1 ? 'matéria' : 'matérias'}`}</span>
                </button>
              ))}
            </div>
            <button className="gc__link" type="button" onClick={() => setEscolhendo(false)}>Cancelar</button>
          </div>
        )}

        {confirmar && (
          <div className="gc__escolha" role="group" aria-labelledby="gc-confirmar-titulo">
            <p id="gc-confirmar-titulo">
              O seu Plano {confirmar.id} já tem {confirmar.quantidade} {confirmar.quantidade === 1 ? 'matéria' : 'matérias'}.
              Substituir pela grade compartilhada?
            </p>
            <div className="gc__planos">
              <button className="btn-primary" type="button" onClick={() => onUsarComoPlano(confirmar.id)}>
                Substituir
              </button>
              <button className="btn-secondary" type="button" onClick={() => setConfirmar(null)}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
