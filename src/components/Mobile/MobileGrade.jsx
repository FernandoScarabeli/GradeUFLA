import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { getCursoInfo, getNomeMateriaOuCodigo } from '../../data';
import {
  calcularTotalCreditos,
  CREDIT_MAX,
  DIAS_SEMANA,
  getDependentesCorequisito,
  getPendenciasCorequisitosCalendario,
  horaExata
} from '../../domain/gradeRules';
import CalendarBoard from '../Calendar/CalendarBoard';
import { CREDIT_WARN, gerarHorarios, getCorMateria } from '../Calendar/calendarUtils';
import { buildCalendarOccupancy } from '../Calendar/useCalendarDrag';
import useCalendarExport from '../Calendar/useCalendarExport';
import useGoogleCalendarExport from '../../hooks/useGoogleCalendarExport';
import BottomSheet, { SheetHead } from './BottomSheet';
import GoogleExportForm from '../GoogleExport/GoogleExportForm';
import PlanosBar from '../Planos/PlanosBar';
import useCompartilharLink from '../Compartilhar/useCompartilharLink';
import { ListaCompartilhar, montarItensCompartilhar } from '../Compartilhar/CompartilharMenu';
import { ACADEMIC_TERM } from '../../config/academicTerm';
import { AddSheetContent, DetailSheetContent, TurmaSheetContent } from './GradeSheets';
import Snackbar, { useSnackbar } from './Snackbar';
import {
  blocosDoDia,
  diaInicial,
  DIAS_GRADE,
  DIAS_LONGOS,
  HORA_FIM,
  HORA_INICIO,
  listasParaAdicionar,
  materiaComTurma,
  pad2,
  primeiroDiaDaMateria
} from './mobileGrade';
import '../Calendar/Calendar.css';

const ADD_INICIAL = { aba: 'semestre', busca: '', confirmar: null };
const SWIPE_MINIMO = 60;
const HORAS_EXPORT = gerarHorarios(HORA_INICIO, HORA_FIM);
const nada = () => {};
const nulo = () => null;

export default function MobileGrade({
  cursoSelecionado,
  semestreAtual,
  materiasPorSemestre,
  eletivas,
  materiasAprovadas,
  materiasNoCalendario,
  minimoConfirmados,
  onAddMateria,
  onRemoveMateria,
  onRestaurar,
  onConfirmMinimo,
  onVoltar,
  planosBar = null,
  onGerarLink,
  onComparar
}) {
  const [vista, setVista] = useState('dia');
  const [dia, setDia] = useState(diaInicial);
  const [slide, setSlide] = useState(null);
  const [pulso, setPulso] = useState(null);
  const [sheet, setSheet] = useState({ aberto: false, tipo: null, codigo: null, voltar: null, chave: 0 });
  const [addEstado, setAddEstado] = useState(ADD_INICIAL);
  const { snack, mostrar, fechar: fecharSnack } = useSnackbar();
  const agendaRef = useRef(null);
  const exportRef = useRef(null);
  const manterScrollRef = useRef(false);
  const toqueRef = useRef(null);
  const titleId = `m-sheet-${useId().replace(/:/g, '')}`;
  const gcalTitleId = `m-gcal-${useId().replace(/:/g, '')}`;
  const shareTitleId = `m-share-${useId().replace(/:/g, '')}`;
  const [compartilhando, setCompartilhando] = useState(false);

  const allMateriasList = useMemo(() => [
    ...Object.values(materiasPorSemestre || {}).flat(),
    ...(Array.isArray(eletivas) ? eletivas : [])
  ], [materiasPorSemestre, eletivas]);
  const catalogo = useMemo(() => new Map(allMateriasList.map(materia => [materia.codigo, materia])), [allMateriasList]);
  const eletivasCodigos = useMemo(() => new Set((eletivas || []).map(materia => materia.codigo)), [eletivas]);

  const contexto = {
    materiasAprovadas,
    materiasNoCalendario,
    prerequisitosConfirmados: minimoConfirmados,
    allMateriasList
  };
  const listas = listasParaAdicionar({
    materiasPorSemestre,
    eletivas,
    semestreAtual,
    materiasAprovadas,
    materiasNoCalendario
  });
  const total = calcularTotalCreditos(materiasNoCalendario);
  const pendenciasCoreq = getPendenciasCorequisitosCalendario(materiasNoCalendario, materiasAprovadas, minimoConfirmados);
  const cursoNome = getCursoInfo(cursoSelecionado)?.nome || cursoSelecionado;
  const cor = codigo => getCorMateria(codigo, materiasNoCalendario);

  const tipoMateria = useCallback(codigo => {
    if (eletivasCodigos.has(codigo)) return 'eletiva';
    const semestre = Number(catalogo.get(codigo)?.semestre);
    if (Number.isFinite(semestre) && semestre > Number(semestreAtual)) return 'futura';
    return 'obrigatoria';
  }, [catalogo, eletivasCodigos, semestreAtual]);

  const triggerToast = useCallback((mensagem, nivel) => mostrar(mensagem, { erro: nivel === 'error' }), [mostrar]);
  const baixar = useCalendarExport({
    wrapperRef: exportRef,
    semestreAtual,
    materiasNoCalendario,
    materiasAprovadas,
    materiasMinimoConfirmadas: minimoConfirmados,
    triggerToast
  });
  const googleExport = useGoogleCalendarExport({
    materiasNoCalendario,
    materiasAprovadas,
    materiasMinimoConfirmadas: minimoConfirmados,
    notificar: triggerToast
  });
  const { copiarLink, compartilhar, podeCompartilhar } = useCompartilharLink({
    gerarLink: onGerarLink,
    periodo: ACADEMIC_TERM,
    notificar: triggerToast
  });
  const itensCompartilhar = montarItensCompartilhar({
    baixarPng: baixar,
    rotuloPng: 'Baixar imagem da grade',
    google: { ...googleExport, abrir: () => { fecharSnack(); googleExport.abrir(); } },
    copiarLink,
    compartilhar,
    podeCompartilhar,
    onComparar
  });
  const ocupacao = useMemo(() => buildCalendarOccupancy(materiasNoCalendario), [materiasNoCalendario]);

  // Rolagem da agenda: vai até a primeira aula do dia, ou até a que acabou de entrar.
  useEffect(() => {
    if (vista !== 'dia' || !agendaRef.current) return;
    if (manterScrollRef.current) {
      manterScrollRef.current = false;
      return;
    }
    const wrap = agendaRef.current;
    const hora = parseFloat(getComputedStyle(wrap).getPropertyValue('--hour')) || 56;
    const blocos = blocosDoDia(materiasNoCalendario, dia);
    const alvo = blocos.find(bloco => bloco.codigo === pulso) || blocos[0];
    wrap.scrollTop = alvo ? Math.max(0, (alvo.inicio - HORA_INICIO) * hora - 16) : 0;
    // A rolagem só deve seguir troca de dia, de vista ou uma matéria recém-adicionada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dia, vista, pulso]);

  useEffect(() => {
    if (!pulso) return undefined;
    const timer = setTimeout(() => setPulso(null), 1400);
    return () => clearTimeout(timer);
  }, [pulso]);

  const abrirSheet = (tipo, extra = {}) => {
    // A mensagem anterior não pode cobrir o conteúdo da gaveta.
    fecharSnack();
    setSheet(atual => ({
      aberto: true,
      tipo,
      codigo: null,
      voltar: null,
      // Nova chave a cada matéria: a gaveta de turma começa sem seleção.
      chave: atual.chave + 1,
      ...extra
    }));
  };
  const fecharSheet = useCallback(() => setSheet(atual => ({ ...atual, aberto: false })), []);

  const mudarDia = (novo, direcao) => {
    if (novo < 1 || novo > 6) return;
    setVista('dia');
    if (novo === dia) return;
    setSlide(direcao === undefined ? (novo > dia ? 'esq' : 'dir') : direcao);
    setDia(novo);
  };

  const snapshot = () => ({ ...materiasNoCalendario });

  const adicionar = (materia, turma) => {
    const antes = snapshot();
    const candidata = materiaComTurma(materia, turma);
    const trocando = Boolean(materiasNoCalendario[materia.codigo]);
    if (!onAddMateria(candidata)) return;
    fecharSheet();
    const destino = primeiroDiaDaMateria(candidata);
    setSlide(null);
    setVista('dia');
    if (destino) setDia(destino);
    setPulso(materia.codigo);
    mostrar(trocando ? `${materia.nome} agora na turma ${turma.id}` : `${materia.nome} adicionada`, {
      acao: { label: 'Desfazer', onClick: () => { manterScrollRef.current = true; onRestaurar(antes); } }
    });
  };

  const remover = codigo => {
    const antes = snapshot();
    const saem = [...getDependentesCorequisito(codigo, materiasNoCalendario)].filter(item => materiasNoCalendario[item]);
    manterScrollRef.current = true;
    onRemoveMateria(codigo, { silencioso: true });
    fecharSheet();
    mostrar(saem.length > 1 ? `${saem.length} matérias removidas` : `${getNomeMateriaOuCodigo(codigo)} removida`, {
      acao: { label: 'Desfazer', onClick: () => { manterScrollRef.current = true; onRestaurar(antes); } }
    });
  };

  const escolherNaLista = (materia, situacao) => {
    if (situacao.bloqueada && situacao.tipo === 'forte') {
      mostrar(`Você precisa ter feito ${situacao.codigos.map(getNomeMateriaOuCodigo).join(', ')} antes.`, { erro: true });
      return;
    }
    if (situacao.tipo === 'sem-turma') {
      mostrar('Esta matéria não tem turmas com horário neste período.', { erro: true });
      return;
    }
    if (situacao.confirmavel) {
      setAddEstado(atual => ({ ...atual, confirmar: atual.confirmar === materia.codigo ? null : materia.codigo }));
      return;
    }
    abrirSheet('turma', { codigo: materia.codigo, voltar: 'add' });
  };

  const confirmarPrereq = (materia, codigos) => {
    codigos.forEach(codigo => onConfirmMinimo(codigo));
    setAddEstado(atual => ({ ...atual, confirmar: null }));
    abrirSheet('turma', { codigo: materia.codigo, voltar: 'add' });
  };

  const corrigirCoreq = codigo => {
    if (!catalogo.get(codigo)) {
      mostrar(`${getNomeMateriaOuCodigo(codigo)} não está na matriz deste curso. Confirme no SIG.`, { erro: true });
      return;
    }
    abrirSheet('turma', { codigo });
  };

  const aoTocar = event => {
    if (sheet.aberto) return;
    const toque = event.touches[0];
    toqueRef.current = { x: toque.clientX, y: toque.clientY };
  };
  const aoSoltar = event => {
    const inicio = toqueRef.current;
    toqueRef.current = null;
    if (!inicio) return;
    const toque = event.changedTouches[0];
    const dx = toque.clientX - inicio.x;
    const dy = toque.clientY - inicio.y;
    if (Math.abs(dx) > SWIPE_MINIMO && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) mudarDia(dia + 1, 'esq');
      else mudarDia(dia - 1, 'dir');
    }
  };

  const tecladoDias = event => {
    const passos = { ArrowRight: 1, ArrowLeft: -1 };
    if (event.key === 'Home' || event.key === 'End' || passos[event.key]) {
      event.preventDefault();
      let novo = dia + (passos[event.key] || 0);
      if (event.key === 'Home') novo = 1;
      if (event.key === 'End') novo = 6;
      if (novo < 1 || novo > 6) return;
      // Navegação por teclado é frequente: troca sem animação.
      setSlide(null);
      setDia(novo);
      event.currentTarget.querySelector(`[data-dia="${novo}"]`)?.focus();
    }
  };

  // ---------- gaveta ----------
  let conteudoSheet = null;
  const sheetMateria = sheet.codigo ? catalogo.get(sheet.codigo) : null;
  if (sheet.tipo === 'add') {
    conteudoSheet = (
      <AddSheetContent
        titleId={titleId}
        listas={listas}
        estado={addEstado}
        setEstado={setAddEstado}
        contexto={contexto}
        onPick={escolherNaLista}
        onConfirmarPrereq={confirmarPrereq}
        onClose={fecharSheet}
      />
    );
  } else if (sheet.tipo === 'turma' && sheetMateria) {
    const voltar = sheet.voltar === 'add'
      ? () => abrirSheet('add')
      : sheet.voltar === 'detail'
        ? () => abrirSheet('detail', { codigo: sheet.codigo })
        : null;
    conteudoSheet = (
      <TurmaSheetContent
        key={sheet.chave}
        titleId={titleId}
        materia={sheetMateria}
        materiasNoCalendario={materiasNoCalendario}
        contexto={contexto}
        onBack={voltar}
        onClose={fecharSheet}
        onConfirm={adicionar}
        onConfirmarPrereq={(materia, codigos) => codigos.forEach(codigo => onConfirmMinimo(codigo))}
        professorDestaque={sheet.voltar === 'add' ? addEstado.busca : ''}
      />
    );
  } else if (sheet.tipo === 'detail' && materiasNoCalendario[sheet.codigo]) {
    const entrada = materiasNoCalendario[sheet.codigo];
    const tipo = tipoMateria(sheet.codigo);
    const semestre = catalogo.get(sheet.codigo)?.semestre;
    const dependentes = [...getDependentesCorequisito(sheet.codigo, materiasNoCalendario)]
      .filter(codigo => codigo !== sheet.codigo && materiasNoCalendario[codigo]);
    conteudoSheet = (
      <DetailSheetContent
        key={sheet.chave}
        titleId={titleId}
        entrada={entrada}
        catalogo={catalogo.get(sheet.codigo)}
        tipoRotulo={tipo === 'eletiva' ? 'eletiva' : semestre ? `${semestre}º semestre` : 'obrigatória'}
        contexto={contexto}
        dependentes={dependentes}
        onRemove={remover}
        onSwap={() => abrirSheet('turma', { codigo: sheet.codigo, voltar: 'detail' })}
        onClose={fecharSheet}
      />
    );
  }

  // ---------- corpo ----------
  const blocosHoje = blocosDoDia(materiasNoCalendario, dia);
  const pct = Math.min(1, total / CREDIT_MAX);
  const tomCreditos = total >= CREDIT_MAX ? 'full' : total > CREDIT_WARN ? 'warn' : 'ok';
  const aviso = pendenciasCoreq[0];

  return (
    <div className="m-screen">
      <header className="m-top">
        <button className="m-iconbtn" type="button" onClick={onVoltar} aria-label="Voltar ao histórico">
          <i className="fi fi-br-angle-left" aria-hidden="true" />
        </button>
        <div className="m-top__titles">
          <h1 className="m-top__title">Minha grade</h1>
          <p className="m-top__sub">{semestreAtual}º semestre · {cursoNome}</p>
        </div>
        <div className="m-viewtoggle" role="group" aria-label="Visualização">
          <button type="button" aria-pressed={vista === 'dia'} onClick={() => { setSlide(null); setVista('dia'); }}>Dia</button>
          <button type="button" aria-pressed={vista === 'semana'} onClick={() => setVista('semana')}>Semana</button>
        </div>
        <button
          className="m-iconbtn"
          type="button"
          onClick={() => { fecharSnack(); setCompartilhando(true); }}
          aria-haspopup="dialog"
          aria-label="Compartilhar"
        >
          <i className="fi fi-br-share" aria-hidden="true" />
        </button>
      </header>

      {/* O "Desfazer" de uma mensagem antiga não pode agir sobre outro plano: fecha antes. */}
      {planosBar && (
        <PlanosBar
          {...planosBar}
          variante="mobile"
          onTrocar={id => { fecharSnack(); planosBar.onTrocar(id); }}
          onDuplicar={destino => { fecharSnack(); planosBar.onDuplicar(destino); }}
          onLimpar={() => { fecharSnack(); planosBar.onLimpar(); }}
          onAviso={mensagem => mostrar(mensagem)}
        />
      )}

      {vista === 'dia' ? (
        <>
          <div className="m-days" role="tablist" aria-label="Dias da semana" onKeyDown={tecladoDias}>
            {DIAS_GRADE.map(numero => {
              const cores = [...new Set(blocosDoDia(materiasNoCalendario, numero).map(bloco => cor(bloco.codigo)))].slice(0, 4);
              const quantidade = new Set(blocosDoDia(materiasNoCalendario, numero).map(bloco => bloco.codigo)).size;
              return (
                <button
                  key={numero}
                  className="m-day"
                  type="button"
                  role="tab"
                  data-dia={numero}
                  aria-selected={dia === numero}
                  aria-controls="m-agenda"
                  aria-label={`${DIAS_LONGOS[numero]}, ${quantidade === 0 ? 'sem aulas' : `${quantidade} matéria${quantidade > 1 ? 's' : ''}`}`}
                  tabIndex={dia === numero ? 0 : -1}
                  onClick={() => mudarDia(numero)}
                >
                  <span className="m-day__name">{DIAS_SEMANA[numero]}</span>
                  <span className="m-day__dots">{cores.map(c => <i key={c} style={{ background: c }} />)}</span>
                </button>
              );
            })}
          </div>
          <div className="m-agenda-wrap" ref={agendaRef} onTouchStart={aoTocar} onTouchEnd={aoSoltar}>
            <div
              key={dia}
              id="m-agenda"
              className="m-agenda"
              role="tabpanel"
              aria-label={`Aulas de ${DIAS_LONGOS[dia]}`}
              data-slide={slide || undefined}
              style={{ '--horas': HORA_FIM - HORA_INICIO }}
            >
              {Array.from({ length: HORA_FIM - HORA_INICIO + 1 }, (_, k) => (
                <div key={k} className="m-hourline" style={{ top: `calc(var(--hour) * ${k})` }} aria-hidden="true">
                  <span>{pad2(HORA_INICIO + k)}:00</span>
                </div>
              ))}
              {blocosHoje.map(bloco => (
                <button
                  key={bloco.key}
                  className="m-block"
                  type="button"
                  data-short={bloco.fim - bloco.inicio < 2}
                  data-pulse={pulso === bloco.codigo}
                  onClick={() => abrirSheet('detail', { codigo: bloco.codigo })}
                  style={{
                    '--c': cor(bloco.codigo),
                    top: `calc(var(--hour) * ${bloco.inicio - HORA_INICIO} + 2px)`,
                    height: `calc(var(--hour) * ${bloco.fim - bloco.inicio} - 4px)`
                  }}
                >
                  <span className="m-block__name">{bloco.materia.nome}</span>
                  <span className="m-block__meta">
                    {bloco.anp && <><span className="m-badge">ANP</span>{' '}</>}
                    Turma {bloco.materia.turmaId} · {bloco.anp ? `${pad2(bloco.inicio)}:00–${pad2(bloco.fim)}:00` : `${horaExata(bloco.horario).inicio}–${horaExata(bloco.horario).fim}`}
                    {bloco.horario?.sala && !bloco.anp && <> · {bloco.horario.sala}</>}
                  </span>
                </button>
              ))}
              {blocosHoje.length === 0 && (
                <div className="m-empty">
                  <strong>Nenhuma aula na {DIAS_LONGOS[dia]}</strong>
                  Toque em “Adicionar matéria” para montar este dia.
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="m-week-wrap">
          <div className="m-week">
            <span />
            {DIAS_GRADE.map(numero => (
              <button key={numero} className="m-week__head" type="button" onClick={() => mudarDia(numero, null)}>
                {DIAS_SEMANA[numero]}
              </button>
            ))}
            <div className="m-week__hours" aria-hidden="true">
              {Array.from({ length: HORA_FIM - HORA_INICIO }, (_, k) => (
                <span key={k} style={{ top: `calc(var(--wh) * ${k})` }}>{HORA_INICIO + k}</span>
              ))}
            </div>
            {DIAS_GRADE.map(numero => (
              <div key={numero} className="m-week__col">
                {blocosDoDia(materiasNoCalendario, numero).map(bloco => (
                  <button
                    key={bloco.key}
                    className="m-wblock"
                    type="button"
                    aria-label={`${bloco.materia.nome}, ${DIAS_LONGOS[numero]} das ${bloco.inicio} às ${bloco.fim}`}
                    onClick={() => abrirSheet('detail', { codigo: bloco.codigo })}
                    style={{
                      '--c': cor(bloco.codigo),
                      top: `calc(var(--wh) * ${bloco.inicio - HORA_INICIO} + 1px)`,
                      height: `calc(var(--wh) * ${bloco.fim - bloco.inicio} - 2px)`
                    }}
                  >
                    {bloco.codigo.slice(0, 3)}<br />{bloco.codigo.slice(3)}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <p className="m-week__hint">
            {total === 0 ? 'Sua semana está vazia. Comece adicionando uma matéria.' : 'Toque num dia para ver os detalhes.'}
          </p>
        </div>
      )}

      <div className="m-dock">
        <div className="m-snack-zone">
          <Snackbar snack={snack} onClose={fecharSnack} />
        </div>
        {aviso && (
          <button className="m-warn" type="button" onClick={() => corrigirCoreq(aviso.coreqCodigo)}>
            <i className="fi fi-br-triangle-warning" aria-hidden="true" />
            <span>
              <strong>{getNomeMateriaOuCodigo(aviso.materiaCodigo)}</strong> precisa ser cursada junto com{' '}
              <strong>{getNomeMateriaOuCodigo(aviso.coreqCodigo)}</strong>. Toque para adicionar.
            </span>
          </button>
        )}
        <div className="m-dock__row">
          <div className="m-credits" role="img" aria-label={`${total} de ${CREDIT_MAX} créditos`}>
            <div className="m-credits__num"><b>{total}</b> / {CREDIT_MAX} créditos</div>
            <div className="m-meter" data-tone={tomCreditos}><i style={{ transform: `scaleX(${pct})` }} /></div>
          </div>
          <button
            className="m-btn m-btn--primary"
            type="button"
            onClick={() => { setAddEstado(ADD_INICIAL); abrirSheet('add'); }}
          >
            <i className="fi fi-br-plus" aria-hidden="true" />Adicionar matéria
          </button>
        </div>
      </div>

      <BottomSheet open={sheet.aberto} onClose={fecharSheet} titleId={titleId}>
        {conteudoSheet}
      </BottomSheet>

      <BottomSheet open={compartilhando} onClose={() => setCompartilhando(false)} titleId={shareTitleId}>
        <SheetHead titleId={shareTitleId} title="Compartilhar" onClose={() => setCompartilhando(false)} />
        <ListaCompartilhar
          itens={itensCompartilhar}
          className="compartilhar__lista compartilhar__lista--sheet"
          onEscolher={() => setCompartilhando(false)}
        />
      </BottomSheet>

      <BottomSheet open={googleExport.aberto} onClose={googleExport.fechar} titleId={gcalTitleId}>
        <SheetHead titleId={gcalTitleId} title="Exportar pro Google Agenda" onClose={googleExport.fechar} />
        <GoogleExportForm
          variante="mobile"
          periodoInicial={googleExport.periodoInicial}
          exportando={googleExport.exportando}
          onExportar={googleExport.exportar}
          onCancelar={googleExport.fechar}
        />
      </BottomSheet>

      {/* Grade de 7 colunas usada só para gerar o PNG, igual à do desktop. */}
      <div className="m-export" aria-hidden="true" inert>
        <CalendarBoard
          wrapperRef={exportRef}
          semestreAtual={semestreAtual}
          isDragging={false}
          draggingMateria={null}
          selectedTurmaIndex={null}
          verificarConflito={() => ({ temConflito: false })}
          getCorTurma={nulo}
          horarios={HORAS_EXPORT}
          getMateriasEmCelula={(horaIdx, diaIdx) => ocupacao.get(`${diaIdx}:${HORA_INICIO + horaIdx}`) || []}
          getCellPreviewInfo={nulo}
          getTipoMateria={tipoMateria}
          getCorMateria={cor}
          isMobile={false}
          onDragStartFromCalendar={nada}
          onMateriaClick={nada}
          onCellHover={nada}
          materiasNoCalendario={materiasNoCalendario}
        />
      </div>
    </div>
  );
}
