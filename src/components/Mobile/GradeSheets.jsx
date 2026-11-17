import { useState } from 'react';
import { getNomeMateriaOuCodigo } from '../../data';
import {
  calcularTotalAposSelecao,
  CREDIT_MAX,
  DIAS_SEMANA,
  formatarNomeProprio,
  getPendenciasPrerequisito,
  isAnpTurma,
  normalizarDia,
  normalizarHora,
  SATURDAY_INDEX
} from '../../domain/gradeRules';
import { SheetHead } from './BottomSheet';
import {
  avaliarTurma,
  blocosDoDia,
  casaBusca,
  DIAS_GRADE,
  descreverConflito,
  formatarIntervalo,
  HORA_FIM,
  HORA_INICIO,
  horaAnpPrevista,
  materiaComTurma,
  pad2,
  situacaoMateria
} from './mobileGrade';

const nomes = codigos => codigos.map(getNomeMateriaOuCodigo).join(', ');

export const ABAS = [
  ['semestre', 'Do semestre'],
  ['pendentes', 'Pendentes'],
  ['eletivas', 'Eletivas'],
  ['futuras', 'Futuras']
];

const VAZIO = {
  semestre: 'Todas as matérias do semestre já estão na grade ou foram feitas.',
  pendentes: 'Nenhuma matéria pendente de semestres anteriores.',
  eletivas: 'Nenhuma eletiva disponível.',
  futuras: 'Nenhuma matéria de semestres futuros.'
};

function textoSituacao(situacao) {
  switch (situacao.tipo) {
    case 'forte':
      return situacao.bloqueada
        ? { classe: 'lock', texto: `Precisa ter feito ${nomes(situacao.codigos)}` }
        : { classe: 'min', texto: `Pede ${nomes(situacao.codigos)} · toque para confirmar` };
    case 'minimo':
      return { classe: 'min', texto: `Pede média mínima em ${nomes(situacao.codigos)} · toque para confirmar` };
    case 'sem-turma':
      return { classe: 'muted', texto: 'Sem turmas com horário neste período' };
    case 'choque':
      return { classe: 'muted', texto: 'Todas as turmas chocam com a sua grade' };
    case 'coreq':
      return { classe: 'min', texto: `Curse junto com ${nomes(situacao.codigos)}` };
    default:
      return null;
  }
}

/** Pergunta de confirmação de pré-requisito, na própria lista (nada de window.confirm). */
export function ConfirmarPrereq({ situacao, onNao, onSim }) {
  const lista = nomes(situacao.codigos);
  return (
    <div className="m-inline-confirm">
      <p>
        {situacao.tipo === 'forte'
          ? <>Você já cursou e foi aprovado em <strong>{lista}</strong>?</>
          : <>Você já cursou <strong>{lista}</strong> sem reprovar por frequência e com média final de pelo menos 50?</>}
      </p>
      <div className="m-actions">
        <button className="m-btn m-btn--ghost m-btn--sm" type="button" onClick={onNao}>Não</button>
        <button className="m-btn m-btn--primary m-btn--sm" type="button" onClick={onSim}>Sim, cursei</button>
      </div>
    </div>
  );
}

export function AddSheetContent({ titleId, listas, estado, setEstado, contexto, onPick, onConfirmarPrereq, onClose }) {
  const lista = listas[estado.aba].filter(materia => casaBusca(materia, estado.busca));

  return (
    <>
      <SheetHead titleId={titleId} title="Adicionar matéria" onClose={onClose} />
      <div className="m-tabs" role="tablist" aria-label="Origem da matéria">
        {ABAS.map(([chave, rotulo]) => (
          <button
            key={chave}
            className="m-tab"
            type="button"
            role="tab"
            aria-selected={estado.aba === chave}
            onClick={() => setEstado(atual => ({ ...atual, aba: chave, confirmar: null }))}
          >
            {rotulo}<small>{listas[chave].length}</small>
          </button>
        ))}
      </div>
      <label className="m-search m-search--sheet">
        <i className="fi fi-br-search" aria-hidden="true" />
        <input
          type="search"
          placeholder="Buscar matéria ou código"
          aria-label="Buscar matéria"
          value={estado.busca}
          onChange={event => setEstado(atual => ({ ...atual, busca: event.target.value, confirmar: null }))}
          autoComplete="off"
        />
      </label>
      <div className="m-sheet__scroll" role="tabpanel">
        {lista.length === 0 && (
          <p className="m-lead m-lead--center">{estado.busca.trim() ? 'Nada encontrado para essa busca.' : VAZIO[estado.aba]}</p>
        )}
        {lista.map(materia => {
          const situacao = situacaoMateria(materia, contexto);
          const linha = textoSituacao(situacao);
          const turmas = (materia.turmas || []).length;
          return (
            <div key={materia.codigo} className="m-mrow-group">
              <button
                className="m-mrow"
                type="button"
                data-locked={situacao.bloqueada}
                aria-expanded={situacao.confirmavel ? estado.confirmar === materia.codigo : undefined}
                onClick={() => onPick(materia, situacao)}
              >
                <span className="m-mrow__txt">
                  <span className="m-mrow__name">{materia.nome}</span>
                  <span className="m-mrow__meta">
                    <code>{materia.codigo}</code>
                    {materia.semestreOriginal ? ` · ${materia.semestreOriginal}º sem` : ''}
                    {` · ${turmas} turma${turmas === 1 ? '' : 's'}`}
                  </span>
                  {linha && (
                    <span className="m-mrow__state" data-tone={linha.classe}>
                      {linha.classe === 'lock' && <i className="fi fi-br-lock" aria-hidden="true" />}
                      {linha.texto}
                    </span>
                  )}
                </span>
                <span className="m-mrow__cr">{materia.creditos} cr</span>
              </button>
              {estado.confirmar === materia.codigo && (
                <ConfirmarPrereq
                  situacao={situacao}
                  onNao={() => setEstado(atual => ({ ...atual, confirmar: null }))}
                  onSim={() => onConfirmarPrereq(materia, situacao.codigos)}
                />
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function chipsDaTurma(turma) {
  const chips = (turma.horarios || []).map(horario => formatarIntervalo(horario, { comSala: true }));
  return { chips, anp: isAnpTurma(turma) };
}

/** Prévia da semana com as aulas atuais e a turma escolhida (verde) ou em choque (vermelho). */
function PreviaSemana({ materia, turma, materiasNoCalendario }) {
  const altura = 120 / (HORA_FIM - HORA_INICIO);
  const outras = { ...materiasNoCalendario };
  delete outras[materia.codigo];
  const candidata = turma ? materiaComTurma(materia, turma) : null;
  const conflito = turma ? avaliarTurma(materia, turma, materiasNoCalendario).conflito : null;
  const novos = candidata ? [...(candidata.horarios || [])] : [];
  if (candidata && isAnpTurma(candidata)) {
    const hora = horaAnpPrevista(materia, materiasNoCalendario);
    if (hora != null) novos.push({ dia: SATURDAY_INDEX, inicio: hora, fim: hora + 1 });
  }
  const estilo = (inicio, fim) => ({
    top: `${(inicio - HORA_INICIO) * altura}px`,
    height: `${Math.max(2, (fim - inicio) * altura - 1)}px`
  });

  return (
    <>
      <p className="m-preview-title">Como fica a semana</p>
      <div className="m-minweek" aria-hidden="true">
        {DIAS_GRADE.map(dia => (
          <span key={dia}>
            <b>{DIAS_SEMANA[dia]}</b>
            <div>
              {blocosDoDia(outras, dia).map(bloco => (
                <i key={bloco.key} style={estilo(bloco.inicio, bloco.fim)} />
              ))}
              {novos.filter(horario => normalizarDia(horario.dia) === dia).map((horario, index) => {
                const inicio = normalizarHora(horario.inicio);
                const fim = normalizarHora(horario.fim);
                return <i key={`n${index}`} data-kind={conflito ? 'clash' : 'new'} style={estilo(inicio, fim)} />;
              })}
            </div>
          </span>
        ))}
      </div>
    </>
  );
}

export function TurmaSheetContent({
  titleId,
  materia,
  materiasNoCalendario,
  contexto,
  onBack,
  onClose,
  onConfirm,
  onConfirmarPrereq
}) {
  const [selecionada, setSelecionada] = useState(null);
  const naGrade = materiasNoCalendario[materia.codigo];
  const turmas = materia.turmas || [];
  const turma = turmas.find(item => item.id === selecionada) || null;
  const situacao = situacaoMateria(materia, contexto);
  const pendencias = getPendenciasPrerequisito(materia, contexto);
  const total = calcularTotalAposSelecao(materiasNoCalendario, materia);
  const excede = total > CREDIT_MAX;
  const prereqBloqueia = !pendencias.podeAdicionar;

  let nota = { texto: `${materia.creditos} créditos · sua grade ficará com ${total}`, erro: false };
  if (excede) {
    nota = { texto: `Passaria de ${CREDIT_MAX} créditos (ficaria com ${total}). Remova alguma matéria antes.`, erro: true };
  } else if (prereqBloqueia && situacao.bloqueada) {
    nota = { texto: `Você precisa ter feito ${nomes(pendencias.faltandoForte)}. Ajuste no histórico.`, erro: true };
  } else if (prereqBloqueia) {
    nota = { texto: 'Confirme o pré-requisito acima para adicionar.', erro: true };
  } else if (pendencias.faltandoCoreq.length > 0) {
    nota = { texto: `Lembre de adicionar também ${nomes(pendencias.faltandoCoreq)}.`, erro: false };
  }

  const pode = Boolean(turma) && !excede && !prereqBloqueia;
  const rotulo = turma
    ? `${naGrade ? 'Trocar para' : 'Adicionar'} turma ${turma.id}`
    : 'Escolha uma turma';

  return (
    <>
      <SheetHead titleId={titleId} title={materia.nome} onBack={onBack} onClose={onClose} />
      <div className="m-sheet__scroll">
        <p className="m-lead m-lead--tight"><code>{materia.codigo}</code> · {materia.creditos} créditos · escolha uma turma</p>
        {prereqBloqueia && situacao.confirmavel && (
          <ConfirmarPrereq
            situacao={situacao}
            onNao={onBack || onClose}
            onSim={() => onConfirmarPrereq(materia, situacao.codigos)}
          />
        )}
        <div className="m-turmas" role="radiogroup" aria-label="Turmas">
          {turmas.map(item => {
            const avaliacao = avaliarTurma(materia, item, materiasNoCalendario);
            const { chips, anp } = chipsDaTurma(item);
            return (
              <button
                key={item.id}
                className="m-turma"
                type="button"
                role="radio"
                aria-checked={selecionada === item.id}
                disabled={!avaliacao.disponivel}
                onClick={() => setSelecionada(item.id)}
              >
                <span className="m-turma__top">
                  <span className="m-turma__id">Turma {item.id}</span>
                  {avaliacao.atual && <span className="m-turma__cur">Na sua grade</span>}
                </span>
                {item.professor && <span className="m-turma__prof">{formatarNomeProprio(item.professor)}</span>}
                <span className="m-chips">
                  {chips.map(chip => <span key={chip} className="m-chip">{chip}</span>)}
                  {anp && <span className="m-chip"><span className="m-badge">ANP</span> 1h no sábado</span>}
                  {chips.length === 0 && !anp && <span className="m-chip">Horário não informado</span>}
                </span>
                {avaliacao.conflito && !avaliacao.atual && (
                  <span className="m-turma__conf">{descreverConflito(avaliacao.conflito)}</span>
                )}
              </button>
            );
          })}
        </div>
        <PreviaSemana materia={materia} turma={turma} materiasNoCalendario={materiasNoCalendario} />
      </div>
      <div className="m-sheet__foot">
        <p className="m-sheet__note" data-erro={nota.erro}>{nota.texto}</p>
        <button className="m-btn m-btn--primary" type="button" disabled={!pode} onClick={() => onConfirm(materia, turma)}>
          {rotulo}
        </button>
      </div>
    </>
  );
}

const TIPOS_REQ = [['forte', 'forte'], ['minimo', 'mínimo'], ['coreq', 'co-requisito']];

export function DetailSheetContent({
  titleId,
  entrada,
  catalogo,
  tipoRotulo,
  contexto,
  dependentes,
  onRemove,
  onSwap,
  onClose
}) {
  const [confirmando, setConfirmando] = useState(false);
  const detalhada = entrada.preRequisitosDetalhada
    || { forte: entrada.preRequisitos || [], minimo: [], coreq: [] };
  const requisitos = TIPOS_REQ.flatMap(([chave, rotulo]) => (detalhada[chave] || []).map(codigo => ({ codigo, rotulo })));
  const pendencias = getPendenciasPrerequisito(entrada, contexto);
  const pendentes = new Set([...pendencias.faltandoForte, ...pendencias.faltandoMinimo, ...pendencias.faltandoCoreq]);
  const anpHour = entrada.anpHour != null ? Number(entrada.anpHour) : null;
  const podeTrocar = (catalogo?.turmas || []).length > 1;

  return (
    <>
      <SheetHead titleId={titleId} title={entrada.nome} onClose={onClose} />
      <div className="m-sheet__scroll">
        <div className="m-dl">
          <p className="m-lead m-lead--tight"><code>{entrada.codigo}</code> · {entrada.creditos} créditos · {tipoRotulo}</p>
          <div>
            <h3>Turma {entrada.turmaId}</h3>
            {entrada.professor && <p className="m-turma__prof">{formatarNomeProprio(entrada.professor)}</p>}
            <div className="m-chips">
              {(entrada.horarios || []).map((horario, index) => {
                const dia = normalizarDia(horario.dia);
                const inicio = normalizarHora(horario.inicio);
                const ehAnp = isAnpTurma(entrada) && dia === SATURDAY_INDEX && inicio === anpHour;
                return (
                  <span key={index} className="m-chip">
                    {ehAnp && <><span className="m-badge">ANP</span>{' '}</>}
                    {ehAnp ? `${DIAS_SEMANA[dia]} ${pad2(inicio)}:00–${pad2(inicio + 1)}:00` : formatarIntervalo(horario, { comSala: true })}
                  </span>
                );
              })}
            </div>
          </div>
          {requisitos.length > 0 && (
            <div>
              <h3>Pré-requisitos</h3>
              <ul className="m-reqs">
                {requisitos.map(({ codigo, rotulo }) => {
                  const ok = !pendentes.has(codigo);
                  return (
                    <li key={`${rotulo}-${codigo}`} className="m-req" data-ok={ok}>
                      <i className={`fi ${ok ? 'fi-br-check' : 'fi-br-cross-small'}`} aria-hidden="true" />
                      <span>
                        {getNomeMateriaOuCodigo(codigo)} <small>· {rotulo}{ok ? '' : ' · pendente'}</small>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
      <div className="m-sheet__foot">
        {confirmando && (
          <div className="m-inline-confirm">
            <p>
              <strong>{nomes(dependentes)}</strong> {dependentes.length > 1 ? 'dependem' : 'depende'} desta matéria
              como co-requisito e também {dependentes.length > 1 ? 'sairão' : 'sairá'} da grade.
            </p>
            <div className="m-actions">
              <button className="m-btn m-btn--ghost m-btn--sm" type="button" onClick={() => setConfirmando(false)}>Manter</button>
              <button className="m-btn m-btn--danger m-btn--sm" type="button" onClick={() => onRemove(entrada.codigo)}>
                {dependentes.length > 1 ? `Remover as ${dependentes.length + 1}` : 'Remover as duas'}
              </button>
            </div>
          </div>
        )}
        <div className="m-actions">
          <button
            className="m-btn m-btn--danger"
            type="button"
            onClick={() => (dependentes.length > 0 ? setConfirmando(true) : onRemove(entrada.codigo))}
          >
            <i className="fi fi-br-trash" aria-hidden="true" />Remover
          </button>
          <button className="m-btn m-btn--ghost" type="button" onClick={onSwap} disabled={!podeTrocar}>
            <i className="fi fi-br-exchange" aria-hidden="true" />Trocar turma
          </button>
        </div>
      </div>
    </>
  );
}
