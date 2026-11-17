import { lazy, Suspense, useState, useRef, useEffect, useCallback } from 'react';

// Components
import {
  Hero,
  Historico,
  Calendar,
  MateriaModal,
  ToastContainer,
  useToast,
  AboutMe,
  SetupWizard
} from './components';
import { MobileGrade, MobileHistorico, MobileSetup, MobileShell } from './components/Mobile';
import useIsMobileFlow from './hooks/useIsMobileFlow';
import usePersistedSetup from './hooks/usePersistedSetup';

// Data
import {
  ensureCsvLoaded,
  getCsvLoadState,
  getEletivas,
  getMateriasPorSemestre,
  getNomeMateriaOuCodigo,
  retryCsvLoad,
  useCsvLoadState
} from './data';
import {
  calcularTotalCreditos,
  comHorarioAnp,
  CREDIT_MAX,
  excedeLimiteCreditos,
  findNextAnpHour,
  getDependentesAprovados,
  getDependentesCorequisito,
  isAnpTurma,
  isTurmaSelecionavel,
  normalizarDia,
  normalizarHora,
  verificarConflitoMateria
} from './domain/gradeRules';
import {
  chaveSetup,
  mensagensRemovidas,
  PLANOS,
  planosVazios,
  reidratarSetup
} from './state/gradeSalva';

// Styles
import './styles/global.css';

// O fundo animado (WebGL/ogl) é decorativo: carregado em um chunk separado
// para não atrasar a primeira renderização.
const Particles = lazy(() => import('./components/Particles'));

// Etapas do fluxo
const ETAPAS = {
  INICIO: 'inicio',
  SETUP: 'setup',
  HISTORICO: 'historico',
  MONTAGEM: 'montagem'
};

const DIAS_SEMANA_NOMES = {
  0: 'Domingo',
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado'
};

/** Catálogo (código -> matéria) de obrigatórias e eletivas de um curso/matriz. */
const catalogoDe = (curso, matriz) => new Map([
  ...Object.values(getMateriasPorSemestre(curso, undefined, matriz) || {}).flat(),
  ...(getEletivas(curso, matriz) || [])
].map(materia => [materia.codigo, materia]));

const formatarHorario = (horario) => {
  const dia = normalizarDia(horario?.dia);
  const diaNome = DIAS_SEMANA_NOMES[dia] || 'Dia desconhecido';
  const inicio = normalizarHora(horario?.inicio);
  const fim = normalizarHora(horario?.fim);
  return `${diaNome} das ${inicio}:00 às ${fim}:00`;
};


function App() {
  const calendarioRef = useRef(null);

  // A combinação ativa (aprovadas, confirmações e planos A/B/C) fica salva no navegador.
  // Ao recarregar, o aluno volta pra onde estava (histórico ou montagem); veja usePersistedSetup.
  const [etapa, setEtapa] = useState(ETAPAS.INICIO);
  const [cursoSelecionado, setCursoSelecionado] = useState(null);
  const [matrizSelecionada, setMatrizSelecionada] = useState(null);
  const [semestreAtual, setSemestreAtual] = useState(null);
  const [materiasAprovadas, setMateriasAprovadas] = useState([]);
  const [minimoConfirmados, setMinimoConfirmados] = useState([]); // lista de prereqs 'mínimo' que o usuário confirmou
  // Cada plano tem a sua grade; curso, matriz, semestre e histórico são compartilhados.
  const [planos, setPlanos] = useState(planosVazios);
  const [planoAtivo, setPlanoAtivo] = useState('A');
  // Combinação cujos dados estão no estado: evita salvar uma mistura enquanto o setup é editado.
  const [combinacaoCarregada, setCombinacaoCarregada] = useState(null);
  const materiasNoCalendario = planos[planoAtivo];
  const setMateriasNoCalendario = useCallback(valor => {
    setPlanos(atual => ({
      ...atual,
      [planoAtivo]: typeof valor === 'function' ? valor(atual[planoAtivo]) : valor
    }));
  }, [planoAtivo]);
  const [modalMateria, setModalMateria] = useState(null);
  const csvLoadState = useCsvLoadState();
  // No celular, setup, histórico e grade usam o fluxo próprio (a tela inicial é a mesma).
  const isMobile = useIsMobileFlow();
  const fluxoMobile = isMobile && etapa !== ETAPAS.INICIO;
  const [setupInitialStep, setSetupInitialStep] = useState(1);

  // Hook de toast para notificações
  const { toasts, addToast, removeToast } = useToast();

  const combinacaoAtual = cursoSelecionado && matrizSelecionada && semestreAtual != null
    ? chaveSetup(cursoSelecionado, matrizSelecionada, semestreAtual)
    : null;
  const persistencia = usePersistedSetup({
    ativo: (etapa === ETAPAS.HISTORICO || etapa === ETAPAS.MONTAGEM)
      && combinacaoAtual !== null
      && combinacaoAtual === combinacaoCarregada,
    etapa,
    curso: cursoSelecionado,
    matriz: matrizSelecionada,
    semestre: semestreAtual,
    aprovadas: materiasAprovadas,
    minimoConfirmados,
    planoAtivo,
    planos
  });

  // Inicia uma única carga; o estado é compartilhado com o wizard via useCsvLoadState.
  useEffect(() => {
    if (getCsvLoadState().status === 'idle') {
      ensureCsvLoaded().catch(() => {
        // O erro permanece no estado central e é apresentado na interface.
      });
    }
  }, []);

  // Marca a entrada atual do histórico como tela inicial (uma vez, no carregamento).
  useEffect(() => {
    try {
      window.history.replaceState({ etapa: ETAPAS.INICIO }, document.title, window.location.href);
    } catch {
      // Alguns ambientes (ex.: iframes restritos) não permitem alterar o histórico.
    }
  }, []);

  // Integração com histórico do navegador (botões voltar/avançar)
  useEffect(() => {
    // Handler para quando usuário clica em voltar/avançar
    const handlePopState = (event) => {
      if (event.state && event.state.etapa) {
        const novaEtapa = event.state.etapa;

        // Se está voltando para SETUP de HISTORICO ou MONTAGEM, começar na última etapa (seleção de semestre)
        if (novaEtapa === ETAPAS.SETUP && (etapa === ETAPAS.HISTORICO || etapa === ETAPAS.MONTAGEM)) {
          setSetupInitialStep(3);
        }

        // Se está indo do SETUP para INICIO, resetar o setupInitialStep para 1
        if (novaEtapa === ETAPAS.INICIO && etapa === ETAPAS.SETUP) {
          setSetupInitialStep(1);
        }

        setEtapa(novaEtapa);

        // Scroll suave para a seção apropriada
        if (novaEtapa === ETAPAS.MONTAGEM || novaEtapa === ETAPAS.HISTORICO) {
          setTimeout(() => {
            calendarioRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [etapa]);

  // Função helper para mudar de etapa e atualizar o histórico
  const navegarParaEtapa = (novaEtapa) => {
    if (novaEtapa !== etapa) {
      setEtapa(novaEtapa);
      // Adiciona ao histórico do navegador
      window.history.pushState({ etapa: novaEtapa }, document.title, window.location.href);
    }
  };

  const showToast = useCallback((mensagem, tipo) => addToast(mensagem, tipo), [addToast]);

  // Matérias do curso + matriz selecionados
  const materiasPorSemestre = cursoSelecionado ? getMateriasPorSemestre(cursoSelecionado, undefined, matrizSelecionada) : {};
  const eletivas = cursoSelecionado ? getEletivas(cursoSelecionado, matrizSelecionada) : [];

  // Criar lista completa de todas as matérias (obrigatórias + eletivas) para verificação de pré-requisitos
  const allMateriasList = [...Object.values(materiasPorSemestre).flat(), ...eletivas];

  // Handlers de navegação
  const handleGetStartedClick = () => {
    if (csvLoadState.status !== 'success') return;
    setSetupInitialStep(1);
    navegarParaEtapa(ETAPAS.SETUP);
    setTimeout(() => {
      calendarioRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleRetryCsv = () => {
    retryCsvLoad().catch(() => {
      // O novo erro é publicado pelo estado central e continua visível no Hero.
    });
  };

  // Carrega uma combinação salva, reidratando as grades a partir do CSV atual.
  const aplicarSetupSalvo = (curso, matriz, semestre, setupSalvo) => {
    const estado = reidratarSetup(setupSalvo, catalogoDe(curso, matriz));
    setCursoSelecionado(curso);
    setMatrizSelecionada(matriz);
    setSemestreAtual(semestre);
    setMateriasAprovadas(estado.aprovadas);
    setMinimoConfirmados(estado.minimoConfirmados);
    setPlanos(estado.planos);
    setPlanoAtivo(estado.planoAtivo);
    setCombinacaoCarregada(chaveSetup(curso, matriz, semestre));
    PLANOS.forEach(id => {
      mensagensRemovidas(id, estado.removidas[id], getNomeMateriaOuCodigo)
        .forEach(mensagem => addToast(mensagem, 'warning'));
    });
  };

  const handleSetupComplete = ({ curso, matriz, semestre }) => {
    // Voltar pra uma combinação já usada recupera o histórico e os planos dela.
    const salvo = persistencia.lerSetup(curso, matriz, semestre);
    if (salvo) {
      aplicarSetupSalvo(curso, matriz, semestre, salvo);
    } else {
      setCursoSelecionado(curso);
      setMatrizSelecionada(matriz);
      setSemestreAtual(semestre);

      // Por padrão, marca todas as matérias de semestres anteriores como aprovadas
      const materiasCurso = getMateriasPorSemestre(curso, undefined, matriz);
      const materiasAnteriores = [];
      for (let i = 1; i < semestre; i++) {
        const materias = materiasCurso[i] || [];
        materias.forEach(m => materiasAnteriores.push(m.codigo));
      }
      setMateriasAprovadas(materiasAnteriores);
      // Confirmações manuais valem apenas para a combinação em que foram feitas.
      setMinimoConfirmados([]);
      setPlanos(planosVazios());
      setPlanoAtivo('A');
      setCombinacaoCarregada(chaveSetup(curso, matriz, semestre));
    }

    // No celular, quem está no 1º semestre não tem histórico para marcar.
    navegarParaEtapa(isMobile && semestre === 1 ? ETAPAS.MONTAGEM : ETAPAS.HISTORICO);
  };

  // Volta pra última combinação salva, na etapa em que o aluno parou.
  const continuarDeOndeParei = () => {
    const ultimo = persistencia.ultimoSalvo();
    if (!ultimo || catalogoDe(ultimo.curso, ultimo.matriz).size === 0) return false;
    aplicarSetupSalvo(ultimo.curso, ultimo.matriz, ultimo.semestre, ultimo.setup);
    setSetupInitialStep(3);
    const direto = ultimo.etapa === ETAPAS.MONTAGEM || (isMobile && ultimo.semestre === 1);
    navegarParaEtapa(direto ? ETAPAS.MONTAGEM : ETAPAS.HISTORICO);
    return true;
  };

  const handleContinuarDeOndeParei = () => {
    if (csvLoadState.status !== 'success') return;
    if (!continuarDeOndeParei()) {
      addToast('Não foi possível abrir a grade salva. Escolha o curso de novo.', 'warning');
      handleGetStartedClick();
    }
  };

  const handleComecarDoZero = () => {
    if (csvLoadState.status !== 'success') return;
    persistencia.apagarTudo();
    setCursoSelecionado(null);
    setMatrizSelecionada(null);
    setSemestreAtual(null);
    setMateriasAprovadas([]);
    setMinimoConfirmados([]);
    setPlanos(planosVazios());
    setPlanoAtivo('A');
    setCombinacaoCarregada(null);
    handleGetStartedClick();
  };

  // Recarregou a página: assim que o CSV chega, volta pra onde o aluno estava.
  const restauracaoFeitaRef = useRef(false);
  useEffect(() => {
    if (restauracaoFeitaRef.current || csvLoadState.status !== 'success') return;
    restauracaoFeitaRef.current = true;
    if (etapa === ETAPAS.INICIO) continuarDeOndeParei();
    // Só uma vez, na primeira carga bem-sucedida do CSV.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvLoadState.status]);

  const handleVoltarParaInicio = () => {
    navegarParaEtapa(ETAPAS.INICIO);
  };

  const handleVoltarParaSetup = () => {
    // Ao voltar para o setup, abre direto na etapa de semestre
    setSetupInitialStep(3);
    navegarParaEtapa(ETAPAS.SETUP);
  };

  const handleVoltarParaHistorico = () => {
    if (isMobile && semestreAtual === 1) {
      handleVoltarParaSetup();
      return;
    }
    // Um retorno posterior ao setup deve abrir na etapa de semestre
    setSetupInitialStep(3);
    navegarParaEtapa(ETAPAS.HISTORICO);
  };

  const handleContinuar = () => {
    navegarParaEtapa(ETAPAS.MONTAGEM);
  };

  // Handler para toggle de matéria aprovada
  const handleToggleMateriaAprovada = (codigo) => {
    if (materiasAprovadas.includes(codigo)) {
      // Ao desmarcar, remove também as matérias que dependem dela (forte/mínimo)
      const materiasParaRemover = getDependentesAprovados(codigo, materiasAprovadas, allMateriasList);
      setMateriasAprovadas(materiasAprovadas.filter(c => !materiasParaRemover.has(c)));
    } else {
      setMateriasAprovadas([...materiasAprovadas, codigo]);
      // Matéria já feita não fica em nenhum plano.
      setPlanos(atual => {
        if (!PLANOS.some(id => atual[id][codigo])) return atual;
        return Object.fromEntries(PLANOS.map(id => {
          const { [codigo]: _removida, ...resto } = atual[id];
          return [id, resto];
        }));
      });
    }
  };

  // Marca um pré-requisito 'mínimo' como confirmado (não é aprovado, apenas ignorado para checagens mínimas)
  const handleConfirmMinimo = (codigo) => {
    setMinimoConfirmados(prev => (prev.includes(codigo) ? prev : [...prev, codigo]));
  };

  // Handlers do calendário
  const handleAddMateria = (materia) => {
    if (!materia) return false;

    if (!isTurmaSelecionavel(materia)) {
      addToast('Esta turma não possui horário informado.', 'error');
      return false;
    }

    if (excedeLimiteCreditos(materiasNoCalendario, materia)) {
      addToast(`Adicionar esta matéria excederia o limite de ${CREDIT_MAX} créditos.`, 'error');
      return false;
    }

    // Validação central: vale tanto para turmas normais quanto para ANP híbridas.
    const conflitoCheck = verificarConflitoMateria(materia, materiasNoCalendario, {
      ignorarCodigo: materia.codigo
    });
    if (conflitoCheck.temConflito) {
      const mensagem = conflitoCheck.horarioConflito
        ? `Conflito de horário com "${conflitoCheck.materiaConflito}" - ${formatarHorario(conflitoCheck.horarioConflito)}`
        : conflitoCheck.mensagem || `Conflito de horário com ${conflitoCheck.materiaConflito}`;
      addToast(mensagem, 'error');
      return false;
    }

    const isAnp = isAnpTurma(materia);

    if (isAnp) {
      const nextHour = findNextAnpHour(materiasNoCalendario, {
        ignorarCodigo: materia.codigo
      });
      if (nextHour === null) {
        addToast('Sem vagas ANP disponíveis no sábado.', 'error');
        return false;
      }

      // Preserva os horários originais (seg-sex) e acrescenta o do sábado
      const toAdd = comHorarioAnp(materia, nextHour);

      setMateriasNoCalendario(prevState => ({ ...prevState, [materia.codigo]: toAdd }));
      return true;
    }

    setMateriasNoCalendario(prevState => ({ ...prevState, [materia.codigo]: materia }));
    return true;
  };

  const handleRemoveMateria = (codigo, { silencioso = false } = {}) => {
    // Remove em cascata as matérias que têm a removida como co-requisito
    const toRemove = getDependentesCorequisito(codigo, materiasNoCalendario);

    const novas = { ...materiasNoCalendario };
    const removedDependents = [];
    toRemove.forEach(code => {
      if (novas[code]) {
        if (code !== codigo) removedDependents.push(novas[code].nome || code);
        delete novas[code];
      }
    });

    setMateriasNoCalendario(novas);

    if (silencioso) return;
    removedDependents.forEach(nome =>
      addToast(`A matéria "${nome}" foi removida porque dependia do co-requisito removido.`, 'warning')
    );
  };

  // Usado pelo "Desfazer" do fluxo mobile: volta a grade para um estado anterior.
  const handleRestaurarCalendario = (snapshot) => {
    setMateriasNoCalendario(snapshot || {});
  };

  // ---------- planos A/B/C ----------
  const handleTrocarPlano = id => {
    if (PLANOS.includes(id)) setPlanoAtivo(id);
  };

  const handleDuplicarPlano = destino => {
    if (!PLANOS.includes(destino) || destino === planoAtivo) return;
    setPlanos(atual => ({ ...atual, [destino]: { ...atual[planoAtivo] } }));
    setPlanoAtivo(destino);
  };

  const handleLimparPlano = () => {
    setPlanos(atual => ({ ...atual, [planoAtivo]: {} }));
  };

  const planosBar = {
    ativo: planoAtivo,
    planos: PLANOS.map(id => ({
      id,
      creditos: calcularTotalCreditos(planos[id]),
      vazio: Object.keys(planos[id]).length === 0
    })),
    onTrocar: handleTrocarPlano,
    onDuplicar: handleDuplicarPlano,
    onLimpar: handleLimparPlano
  };

  // Effect para rolar para o calendário quando muda para a etapa de montagem
  useEffect(() => {
    if (etapa === ETAPAS.MONTAGEM) {
      setTimeout(() => {
        calendarioRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [etapa]);

  return (
    <>
      {!fluxoMobile && (
        <Suspense fallback={null}>
          <Particles />
        </Suspense>
      )}
      <div className="app-container">
        <ToastContainer toasts={toasts} removeToast={removeToast} />
        {!fluxoMobile && <AboutMe />}
        {fluxoMobile && (
          <MobileShell>
            {etapa === ETAPAS.SETUP && (
              <MobileSetup
                initialStep={setupInitialStep}
                cursoSelecionado={cursoSelecionado}
                setCursoSelecionado={setCursoSelecionado}
                matrizSelecionada={matrizSelecionada}
                setMatrizSelecionada={setMatrizSelecionada}
                semestreSelecionado={semestreAtual}
                setSemestreSelecionado={setSemestreAtual}
                onComplete={handleSetupComplete}
                onVoltar={handleVoltarParaInicio}
              />
            )}
            {etapa === ETAPAS.HISTORICO && (
              <MobileHistorico
                cursoSelecionado={cursoSelecionado}
                matrizSelecionada={matrizSelecionada}
                semestreAtual={semestreAtual}
                materiasAprovadas={materiasAprovadas}
                materiasPorSemestre={materiasPorSemestre}
                onToggleMateria={handleToggleMateriaAprovada}
                onConfirmMinimo={handleConfirmMinimo}
                onVoltar={handleVoltarParaSetup}
                onContinuar={handleContinuar}
              />
            )}
            {etapa === ETAPAS.MONTAGEM && (
              <MobileGrade
                cursoSelecionado={cursoSelecionado}
                semestreAtual={semestreAtual}
                materiasPorSemestre={materiasPorSemestre}
                eletivas={eletivas}
                materiasAprovadas={materiasAprovadas}
                materiasNoCalendario={materiasNoCalendario}
                minimoConfirmados={minimoConfirmados}
                onAddMateria={handleAddMateria}
                onRemoveMateria={handleRemoveMateria}
                onRestaurar={handleRestaurarCalendario}
                planosBar={planosBar}
                onConfirmMinimo={handleConfirmMinimo}
                onVoltar={handleVoltarParaHistorico}
              />
            )}
          </MobileShell>
        )}
        <div className="calendario-container" ref={calendarioRef} hidden={fluxoMobile}>
          {etapa === ETAPAS.INICIO && (
            <Hero
              onGetStartedClick={handleGetStartedClick}
              temGradeSalva={persistencia.temSalvo}
              onContinuarSalvo={handleContinuarDeOndeParei}
              onComecarDoZero={handleComecarDoZero}
              csvLoadStatus={csvLoadState.status}
              onRetryCsv={handleRetryCsv}
            />
          )}
          {!fluxoMobile && etapa === ETAPAS.SETUP && (
            <SetupWizard
              cursoSelecionado={cursoSelecionado}
              setCursoSelecionado={setCursoSelecionado}
              matrizSelecionada={matrizSelecionada}
              setMatrizSelecionada={setMatrizSelecionada}
              semestreSelecionado={semestreAtual}
              setSemestreSelecionado={setSemestreAtual}
              onShowToast={showToast}
              onComplete={handleSetupComplete}
              initialStep={setupInitialStep}
              onVoltar={handleVoltarParaInicio}
            />
          )}
          {!fluxoMobile && etapa === ETAPAS.HISTORICO && (
            <Historico
              materiasAprovadas={materiasAprovadas}
              materiasPorSemestre={materiasPorSemestre}
              onToggleMateria={handleToggleMateriaAprovada}
              onConfirmMinimo={handleConfirmMinimo}
              onShowToast={showToast}
              onVoltar={handleVoltarParaSetup}
              onContinuar={handleContinuar}
              semestreAtual={semestreAtual}
            />
          )}
          {!fluxoMobile && etapa === ETAPAS.MONTAGEM && (
            <Calendar
              materiasPorSemestre={materiasPorSemestre}
              eletivas={eletivas}
              materiasAprovadas={materiasAprovadas}
              materiasNoCalendario={materiasNoCalendario}
              onAddMateria={handleAddMateria}
              onRemoveMateria={handleRemoveMateria}
              onVoltar={handleVoltarParaHistorico}
              onShowToast={showToast}
              semestreAtual={semestreAtual}
              materiasMinimoConfirmadas={minimoConfirmados}
              onConfirmMinimo={handleConfirmMinimo}
              onMateriaClick={setModalMateria}
              planosBar={planosBar}
            />
          )}
        </div>
        {modalMateria && (
          <MateriaModal
            materia={modalMateria}
            onClose={() => setModalMateria(null)}
            onSave={handleAddMateria}
            onRemove={handleRemoveMateria}
            materiasAprovadas={materiasAprovadas}
            materiasNoCalendario={materiasNoCalendario}
            materiasMinimoConfirmadas={minimoConfirmados}
            allMateriasList={allMateriasList}
            onShowToast={showToast}
          />
        )}
      </div>
    </>
  );
}

export default App;
