import { useCallback, useId, useRef, useState } from 'react';
import { getNomeMateriaOuCodigo, getPendenciasPrerequisito } from '../../data';
import {
  CREDIT_MAX,
  DIAS_SEMANA,
  excedeLimiteCreditos,
  findNextAnpHour,
  formatarNomeProprio,
  horaExata,
  isAnpTurma,
  isTurmaSelecionavel,
  materiaComTurma,
  normalizarDia,
  normalizarHora,
  SATURDAY_INDEX,
  verificarConflitoMateria
} from '../../domain/gradeRules';
import { oQueDestrava } from '../../domain/sugestoes';
import { turmaDoProfessor } from '../../domain/professores';
import { getCorMateria } from '../Calendar/calendarUtils';
import useAccessibleDialog from '../../hooks/useAccessibleDialog';
import './MateriaModal.css';

const nomes = codigos => codigos.map(getNomeMateriaOuCodigo).join(', ');
const DIAS = [1, 2, 3, 4, 5, 6];
const HORA_INICIO = 7;
const HORA_FIM = 23;
const TRILHA_MAX = 4;

/** Horários da turma agrupados por faixa: "Ter · Qui 08:00–10:00". */
export function resumirHorarios(turma) {
  const grupos = new Map();
  (turma?.horarios || []).forEach(horario => {
    const dia = normalizarDia(horario?.dia);
    if (dia == null) return;
    const { inicio, fim } = horaExata(horario);
    const chave = `${inicio}–${fim}|${horario?.sala || ''}`;
    if (!grupos.has(chave)) grupos.set(chave, { dias: [], faixa: `${inicio}–${fim}`, sala: horario?.sala || '' });
    grupos.get(chave).dias.push(dia);
  });
  return [...grupos.values()]
    .sort((a, b) => Math.min(...a.dias) - Math.min(...b.dias))
    .map(({ dias, faixa, sala }) => ({
      dias: [...new Set(dias)].sort((a, b) => a - b).map(dia => DIAS_SEMANA[dia]).join(' · '),
      faixa,
      sala
    }));
}

/** Blocos {dia, início, fim} de uma entrada, cortados à janela da semana. */
const blocosDe = horarios => (horarios || []).flatMap(horario => {
  const dia = normalizarDia(horario?.dia);
  const inicio = normalizarHora(horario?.inicio);
  const fim = normalizarHora(horario?.fim);
  if (dia == null || dia < 1 || inicio == null || fim == null || fim <= inicio) return [];
  return [{ dia, inicio: Math.max(inicio, HORA_INICIO), fim: Math.min(fim, HORA_FIM) }];
});

const sobrepoe = (a, b) => a.dia === b.dia && a.inicio < b.fim && a.fim > b.inicio;

/** A resposta para "posso cursar?". */
function situacao({ materia, naGrade, pendencias, excede }) {
  if (naGrade) return { tom: 'ok', icone: 'fi-br-check-circle', texto: <>Na sua grade · Turma {naGrade.turmaId}</> };
  if (pendencias.faltandoForte.length > 0) {
    return {
      tom: 'erro',
      icone: 'fi-br-lock',
      texto: <>Falta {nomes(pendencias.faltandoForte)}</>,
      confirmar: materia.tipo === 'eletiva' ? pendencias.faltandoForte : null
    };
  }
  if (pendencias.faltandoMinimo.length > 0) {
    return { tom: 'aviso', icone: 'fi-br-lock', texto: <>Pede média mínima em {nomes(pendencias.faltandoMinimo)}</>, confirmar: pendencias.faltandoMinimo };
  }
  if (excede) return { tom: 'erro', icone: 'fi-br-triangle-warning', texto: <>Passaria de {CREDIT_MAX} créditos</> };
  if (pendencias.faltandoCoreq.length > 0) {
    return { tom: 'aviso', icone: 'fi-br-info', texto: <>Curse junto com {nomes(pendencias.faltandoCoreq)}</> };
  }
  return { tom: 'livre', icone: 'fi-br-check', texto: 'Pode cursar' };
}

/** Mini-semana: sua grade nas cores dela, a turma em foco por cima, choques em vermelho. */
function Semana({ materia, materiasNoCalendario, foco }) {
  const ocupados = Object.entries(materiasNoCalendario || {})
    .filter(([codigo]) => codigo !== materia.codigo)
    .flatMap(([codigo, entrada]) => blocosDe(entrada.horarios).map(bloco => ({ ...bloco, codigo })));
  const focoBlocos = foco ? blocosDe(foco.horarios) : [];
  const choques = new Set(ocupados.filter(bloco => focoBlocos.some(novo => sobrepoe(novo, bloco))));
  const horas = HORA_FIM - HORA_INICIO;
  const pos = bloco => ({
    top: `${((bloco.inicio - HORA_INICIO) / horas) * 100}%`,
    height: `${((bloco.fim - bloco.inicio) / horas) * 100}%`
  });

  return (
    <div className="mm-semana" aria-hidden="true">
      <div className="mm-semana__cab">
        <span />
        {DIAS.map(dia => <span key={dia}>{DIAS_SEMANA[dia]}</span>)}
      </div>
      <div className="mm-semana__corpo">
        <div className="mm-semana__horas">
          {Array.from({ length: horas / 2 + 1 }, (_, k) => HORA_INICIO + k * 2).map(hora => (
            <span key={hora} style={{ top: `${((hora - HORA_INICIO) / horas) * 100}%` }}>{hora}h</span>
          ))}
        </div>
        {DIAS.map(dia => (
          <div key={dia} className="mm-semana__dia">
            {ocupados.filter(bloco => bloco.dia === dia).map((bloco, index) => (
              <i
                key={`o${index}`}
                className="mm-semana__bloco"
                data-choque={choques.has(bloco) || undefined}
                style={{ ...pos(bloco), '--c': getCorMateria(bloco.codigo, materiasNoCalendario) }}
              />
            ))}
            {focoBlocos.filter(bloco => bloco.dia === dia).map((bloco, index) => (
              <b key={`${foco.chave}-${index}`} className="mm-semana__foco" data-estado={foco.estado} style={pos(bloco)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Requisitos → esta matéria → o que ela libera. */
function Trilha({ materia, requisitos, pendentes, diretas, totalNaCadeia }) {
  if (requisitos.length === 0 && diretas.length === 0) return null;
  const antes = requisitos.slice(0, TRILHA_MAX);
  const depois = diretas.slice(0, TRILHA_MAX);

  return (
    <section className="mm-trilha" aria-label="Trilha da matéria">
      <div className="mm-trilha__col" data-lado="antes" data-vazia={antes.length === 0 || undefined}>
        <span className="mm-trilha__rotulo">Pede</span>
        <div className="mm-trilha__nos">
          {antes.length === 0 && <span className="mm-trilha__nada">Nada antes</span>}
          {antes.map(({ codigo, tipo }) => {
            const ok = !pendentes.has(codigo);
            return (
              <span key={`${tipo}-${codigo}`} className="mm-no" data-ok={ok} title={getNomeMateriaOuCodigo(codigo)}>
                <i className={`fi ${ok ? 'fi-br-check' : 'fi-br-cross-small'}`} aria-hidden="true" />
                <span className="mm-no__nome">{getNomeMateriaOuCodigo(codigo)}</span>
                {tipo && <span className="mm-no__tipo">{tipo}</span>}
                <span className="sr-only">{ok ? ' (cumprido)' : ' (pendente)'}</span>
              </span>
            );
          })}
          {requisitos.length > antes.length && <span className="mm-trilha__mais">+{requisitos.length - antes.length}</span>}
        </div>
      </div>

      <div className="mm-trilha__centro" aria-hidden="true">
        <span className="mm-trilha__esta">{materia.codigo}</span>
      </div>

      <div className="mm-trilha__col" data-lado="depois" data-vazia={depois.length === 0 || undefined}>
        <span className="mm-trilha__rotulo">
          Libera {diretas.length > 0 && <b>{diretas.length}</b>}
          {totalNaCadeia > diretas.length && <span className="mm-trilha__cadeia"> · {totalNaCadeia} na cadeia toda</span>}
        </span>
        <div className="mm-trilha__nos">
          {depois.length === 0 && <span className="mm-trilha__nada">Não é pré-requisito de nenhuma</span>}
          {depois.map(({ materia: alvo, liberaDeVez, faltaAinda }) => (
            <span
              key={alvo.codigo}
              className="mm-no"
              data-devez={liberaDeVez}
              title={liberaDeVez ? `${alvo.nome}: libera de vez` : `${alvo.nome}: também pede ${nomes(faltaAinda)}`}
            >
              {liberaDeVez && <i className="fi fi-br-unlock" aria-hidden="true" />}
              <span className="mm-no__nome">{alvo.nome}</span>
              <span className="sr-only">{liberaDeVez ? ' (libera de vez)' : ` (também pede ${nomes(faltaAinda)})`}</span>
            </span>
          ))}
          {diretas.length > depois.length && <span className="mm-trilha__mais">+{diretas.length - depois.length}</span>}
        </div>
      </div>
    </section>
  );
}

const MateriaModal = ({
  materia,
  materiasAprovadas,
  onClose,
  onSave,
  onRemove,
  onConfirmMinimo,
  materiasNoCalendario = {},
  materiasMinimoConfirmadas = [],
  allMateriasList = [],
  professorDestaque = ''
}) => {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const saindoRef = useRef(false);
  const [emFoco, setEmFoco] = useState(null);
  const [recemEscolhida, setRecemEscolhida] = useState(null);
  const titleId = `mm-title-${useId().replace(/:/g, '')}`;
  const statusId = `mm-status-${useId().replace(/:/g, '')}`;

  // Sai com um fade curto e só então avisa o pai; sem WAAPI (testes) ou com movimento reduzido, sai na hora.
  const fechar = useCallback((depois) => {
    if (saindoRef.current) return;
    const dialog = dialogRef.current;
    const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const terminar = () => { depois?.(); onClose?.(); };
    if (!dialog || typeof dialog.animate !== 'function' || reduzido) {
      terminar();
      return;
    }
    saindoRef.current = true;
    const opcoes = { duration: 160, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' };
    dialog.parentElement?.animate([{ opacity: 1 }, { opacity: 0 }], opcoes);
    dialog.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.97)' }], opcoes)
      .finished.then(terminar, terminar);
  }, [onClose]);

  useAccessibleDialog({ open: Boolean(materia), onClose: fechar, dialogRef, initialFocusRef: closeButtonRef });

  if (!materia) return null;

  const naGrade = materiasNoCalendario[materia.codigo] || null;
  const pendencias = getPendenciasPrerequisito(materia, {
    materiasAprovadas,
    materiasNoCalendario,
    prerequisitosConfirmados: materiasMinimoConfirmadas,
    allMateriasList
  });
  const excede = !naGrade && excedeLimiteCreditos(materiasNoCalendario, materia);
  const bloqueada = !naGrade && (!pendencias.podeAdicionar || excede);
  const status = situacao({ materia, naGrade, pendencias, excede });
  const pendentes = new Set([...pendencias.faltandoForte, ...pendencias.faltandoMinimo, ...pendencias.faltandoCoreq]);
  const detalhada = materia.preRequisitosDetalhada;
  const requisitos = detalhada
    ? [
        ...(detalhada.forte || []).map(codigo => ({ codigo, tipo: null })),
        ...(detalhada.minimo || []).map(codigo => ({ codigo, tipo: 'mínimo' })),
        ...(detalhada.coreq || []).map(codigo => ({ codigo, tipo: 'junto' }))
      ]
    : (materia.preRequisitos || []).map(codigo => ({ codigo, tipo: null }));
  const { diretas, totalNaCadeia } = oQueDestrava(materia.codigo, allMateriasList, {
    materiasAprovadas,
    prerequisitosConfirmados: materiasMinimoConfirmadas
  });

  const turmas = materia.turmas || [];
  const todasAnp = turmas.length > 0 && turmas.every(isAnpTurma);
  const avaliadas = turmas.map(turma => {
    const atual = naGrade?.turmaId === turma.id;
    const selecionavel = isTurmaSelecionavel(turma);
    const conflito = selecionavel
      ? verificarConflitoMateria(turma, materiasNoCalendario, { ignorarCodigo: materia.codigo })
      : { temConflito: false };
    let estado = 'livre';
    if (atual) estado = 'atual';
    else if (!selecionavel) estado = 'off';
    else if (conflito.temConflito) estado = 'choque';
    else if (bloqueada) estado = 'bloqueada';
    return { turma, conflito, estado };
  });
  const cabem = avaliadas.filter(item => item.estado === 'livre' || item.estado === 'atual').length;

  // A semana mostra a turma sob o ponteiro ou o foco; sem isso, a que já está na grade.
  const focoItem = avaliadas.find(item => item.turma.id === emFoco)
    || avaliadas.find(item => item.estado === 'atual')
    || null;
  let foco = null;
  if (focoItem) {
    const horarios = [...(focoItem.turma.horarios || [])];
    if (isAnpTurma(focoItem.turma)) {
      const hora = focoItem.estado === 'atual' && naGrade?.anpHour != null
        ? Number(naGrade.anpHour)
        : findNextAnpHour(materiasNoCalendario, { ignorarCodigo: materia.codigo });
      if (hora != null) horarios.push({ dia: SATURDAY_INDEX, inicio: hora, fim: hora + 1 });
    }
    const acabou = focoItem.estado === 'atual' && recemEscolhida === focoItem.turma.id;
    foco = {
      chave: `${focoItem.turma.id}-${acabou ? 'encaixou' : 'v'}`,
      horarios,
      estado: acabou ? 'encaixou' : focoItem.estado
    };
  }

  const escolher = turma => {
    if (onSave?.(materiaComTurma(materia, turma)) !== false) setRecemEscolhida(turma.id);
  };

  return (
    <div className="mm-overlay" onClick={() => fechar()}>
      <div
        ref={dialogRef}
        className="mm"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={statusId}
        tabIndex={-1}
      >
        <header className="mm__head">
          <div className="mm__titulos">
            <p className="mm__meta">
              <code>{materia.codigo}</code>
              <span>{materia.creditos} créditos</span>
              <span>{materia.tipo === 'eletiva' ? 'Eletiva' : 'Obrigatória'}</span>
            </p>
            <h3 className="mm__titulo" id={titleId}>{materia.nome}</h3>
          </div>
          <div className="mm__status" data-tom={status.tom} id={statusId} key={`${status.tom}-${naGrade?.turmaId || ''}`}>
            <i className={`fi ${status.icone}`} aria-hidden="true" />
            <span>{status.texto}</span>
            {status.confirmar && onConfirmMinimo && (
              <button
                type="button"
                className="mm__status-acao"
                onClick={() => status.confirmar.forEach(codigo => onConfirmMinimo(codigo))}
                title={status.tom === 'aviso'
                  ? 'Confirmar que cursou sem reprovar por frequência e com média de pelo menos 50'
                  : 'Confirmar que já foi aprovado'}
              >
                Já cursei
              </button>
            )}
          </div>
          <button ref={closeButtonRef} className="mm__fechar" onClick={() => fechar()} type="button" aria-label="Fechar detalhes da disciplina">
            <i className="fi fi-br-cross-small" aria-hidden="true" />
          </button>
        </header>

        <div className="mm__palco">
          <div className="mm__semana-col">
            <Semana materia={materia} materiasNoCalendario={materiasNoCalendario} foco={foco} />
            <p className="mm__legenda" aria-hidden="true">
              <span data-k="grade">sua grade</span>
              <span data-k="turma">{foco ? `turma ${focoItem.turma.id}` : 'passe o mouse numa turma'}</span>
              <span data-k="choque">choque</span>
            </p>
          </div>

          <div className="mm__turmas-col">
            <div className="mm__secao-head">
              <h4 className="mm__secao">Turmas</h4>
              <span className="mm__secao-info">
                {turmas.length === 0 ? 'nenhuma neste período' : <><b>{cabem}</b> de {turmas.length} cabem</>}
                {todasAnp && ' · todas com 1h ANP no sáb'}
              </span>
            </div>
            <ul className="mm__turmas" onMouseLeave={() => setEmFoco(null)}>
              {avaliadas.map(({ turma, conflito, estado }) => {
                const indisponivel = estado !== 'livre';
                const destaque = turmaDoProfessor(turma, professorDestaque);
                return (
                  <li key={turma.id}>
                    <button
                      type="button"
                      className="mm-turma"
                      data-estado={estado}
                      data-professor={destaque || undefined}
                      data-recem={recemEscolhida === turma.id && estado === 'atual' ? true : undefined}
                      aria-disabled={indisponivel}
                      aria-describedby={estado === 'bloqueada' ? statusId : undefined}
                      onMouseEnter={() => setEmFoco(turma.id)}
                      onFocus={() => setEmFoco(turma.id)}
                      onBlur={() => setEmFoco(null)}
                      onClick={() => { if (!indisponivel) escolher(turma); }}
                    >
                      <span className="mm-turma__topo">
                        <span className="mm-turma__id">Turma {turma.id}</span>
                        <span className="mm-turma__fim">
                          {estado === 'atual' && <><i className="fi fi-br-check" aria-hidden="true" />Na sua grade</>}
                          {estado === 'livre' && (
                            <span className="mm-turma__acao">
                              {naGrade ? 'Trocar' : 'Adicionar'}
                              <i className="fi fi-br-arrow-right" aria-hidden="true" />
                            </span>
                          )}
                          {estado === 'off' && 'Sem horário'}
                        </span>
                      </span>
                      <span className="mm-turma__horarios">
                        {resumirHorarios(turma).map(linha => (
                          <span key={`${linha.dias}${linha.faixa}${linha.sala}`}>
                            <b>{linha.dias}</b> {linha.faixa}
                            {linha.sala && <span className="mm-turma__sala"> · {linha.sala}</span>}
                          </span>
                        ))}
                        {isAnpTurma(turma) && !todasAnp && <span className="mm-turma__sala">+ 1h ANP no sáb</span>}
                      </span>
                      {turma.professor && (
                        <span className="mm-turma__prof">
                          {formatarNomeProprio(turma.professor)}
                          {destaque && <span className="mm-turma__filtro"> · professor do filtro</span>}
                        </span>
                      )}
                      {estado === 'choque' && (
                        <span className="mm-turma__choque">
                          {conflito.materiaConflito ? `Choca com ${conflito.materiaConflito}` : (conflito.mensagem || 'Choca com a grade')}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <Trilha materia={materia} requisitos={requisitos} pendentes={pendentes} diretas={diretas} totalNaCadeia={totalNaCadeia} />

        {naGrade && (
          <footer className="mm__pe">
            <button type="button" className="mm__remover" onClick={() => fechar(() => onRemove?.(materia.codigo))}>
              <i className="fi fi-br-trash" aria-hidden="true" />
              Remover da grade
            </button>
          </footer>
        )}
      </div>
    </div>
  );
};

export default MateriaModal;
