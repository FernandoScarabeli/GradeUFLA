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
import GradeCompartilhada from './components/GradeCompartilhada/GradeCompartilhada';
import Comparar from './components/Comparar/Comparar';
import { ACADEMIC_TERM } from './config/academicTerm';
import useIsMobileFlow from './hooks/useIsMobileFlow';
import usePersistedSetup from './hooks/usePersistedSetup';

// Data
import {
  ensureCsvLoaded,
  getCsvLoadState,
  getCursoInfo,
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
  reidratarGrade,
  reidratarSetup
} from './state/gradeSalva';
import {
  codificarGrade,
  decodificarGrade,
  extrairToken,
  extrairTokenDeTexto,
  LinkInvalidoError,
  paraGradeSalva,
  urlDaGrade
} from './state/linkGrade';

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
  MONTAGEM: 'montagem',
  // Grade aberta por um link #g= (só leitura)
  COMPARTILHADA: 'compartilhada',
  // Horários livres em comum com amigos
  COMPARAR: 'comparar'
};

// Etapas que usam o fluxo próprio do celular (MobileShell).
const ETAPAS_MOBILE = [ETAPAS.SETUP, ETAPAS.HISTORICO, ETAPAS.MONTAGEM];

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
  // Filtro por professor do desktop: filtra a lista e destaca as turmas dele no modal.
  const [professorFiltro, setProfessorFiltro] = useState('');
  const csvLoadState = useCsvLoadState();
  // No celular, setup, histórico e grade usam o fluxo próprio (a tela inicial é a mesma).
  const isMobile = useIsMobileFlow();
  const fluxoMobile = isMobile && ETAPAS_MOBILE.includes(etapa);
  // Link #g= lido uma vez no carregamento; a URL é limpa logo em seguida.
  const [tokenLink] = useState(() => extrairToken(window.location.hash));
  const [compartilhada, setCompartilhada] = useState(null);
  const [comparacao, setComparacao] = useState(null);
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
      // Sem o #g=: recarregar não reabre a grade compartilhada.
      const url = tokenLink
        ? `${window.location.pathname}${window.location.search}`
        : window.location.href;
      window.history.replaceState({ etapa: ETAPAS.INICIO }, document.title, url);
    } catch {
      // Alguns ambientes (ex.: iframes restritos) não permitem alterar o histórico.
    }
  }, [tokenLink]);

  // Integração com histórico do navegador (botões voltar/avançar)
  useEffect(() => {
    // Handler para quando usuário clica em voltar/avançar
    const handlePopState = (event) => {
      if (event.state && event.state.etapa) {
        let novaEtapa = event.state.etapa;
        // A grade compartilhada só existe na memória da página.
        if (novaEtapa === ETAPAS.COMPARTILHADA && !compartilhada) novaEtapa = ETAPAS.INICIO;
        if (novaEtapa === ETAPAS.COMPARAR && !comparacao) novaEtapa = ETAPAS.INICIO;

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
  }, [etapa, compartilhada, comparacao]);

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
      mensagensRemovidas(`do Plano ${id}`, estado.removidas[id], getNomeMateriaOuCodigo)
        .forEach(mensagem => addToast(mensagem, 'warning'));
    });
  };

  // Combinação nunca usada: começa com os semestres anteriores aprovados e planos vazios.
  const iniciarCombinacao = (curso, matriz, semestre) => {
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
  };

  const handleSetupComplete = ({ curso, matriz, semestre }) => {
    // Voltar pra uma combinação já usada recupera o histórico e os planos dela.
    const salvo = persistencia.lerSetup(curso, matriz, semestre);
    if (salvo) aplicarSetupSalvo(curso, matriz, semestre, salvo);
    else iniciarCombinacao(curso, matriz, semestre);

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

  // ---------- grade compartilhada por link (#g=) ----------
  const abrirGradeCompartilhada = dados => {
    const catalogo = catalogoDe(dados.curso, dados.matriz);
    if (catalogo.size === 0) {
      addToast('Esse link é de um curso ou matriz que não está no site agora.', 'error');
      return false;
    }
    const { grade, removidas } = reidratarGrade(paraGradeSalva(dados.turmas), catalogo);
    setCompartilhada({ ...dados, grade, removidas });
    navegarParaEtapa(ETAPAS.COMPARTILHADA);
    return true;
  };

  const gerarLinkGrade = useCallback(async () => {
    if (!combinacaoCarregada || Object.keys(materiasNoCalendario).length === 0) return null;
    const token = await codificarGrade({
      curso: cursoSelecionado,
      matriz: matrizSelecionada,
      semestre: semestreAtual,
      periodo: ACADEMIC_TERM,
      grade: materiasNoCalendario
    });
    return urlDaGrade(token);
  }, [combinacaoCarregada, cursoSelecionado, matrizSelecionada, materiasNoCalendario, semestreAtual]);

  // Planos do aluno na combinação da grade compartilhada (pra escolher onde importar).
  const planosDestino = compartilhada
    ? (() => {
        const salvo = persistencia.lerSetup(compartilhada.curso, compartilhada.matriz, compartilhada.semestre);
        return PLANOS.map(id => {
          const quantidade = Object.keys(salvo?.planos?.[id] || {}).length;
          return { id, quantidade, vazio: quantidade === 0 };
        });
      })()
    : [];

  const handleUsarComoPlano = id => {
    if (!compartilhada || !PLANOS.includes(id)) return;
    const { curso, matriz, semestre, grade } = compartilhada;
    const salvo = persistencia.lerSetup(curso, matriz, semestre);
    if (salvo) aplicarSetupSalvo(curso, matriz, semestre, salvo);
    else iniciarCombinacao(curso, matriz, semestre);
    // Roda depois do setPlanos acima (mesmo lote): só troca o plano escolhido.
    setPlanos(atual => ({ ...atual, [id]: grade }));
    setPlanoAtivo(id);
    setCompartilhada(null);
    setSetupInitialStep(3);
    navegarParaEtapa(ETAPAS.MONTAGEM);
    addToast(`Grade compartilhada salva no seu Plano ${id}.`, 'success');
  };

  // ---------- horários livres em comum ----------
  const descreverCombinacao = (curso, semestre) => `${semestre}º semestre · ${getCursoInfo(curso)?.nome || curso}`;

  // Sua grade pra comparar: o plano aberto agora ou, se nada estiver aberto, o último salvo.
  const minhaGradeParaComparar = () => {
    if (combinacaoCarregada && Object.keys(materiasNoCalendario).length > 0) {
      return {
        grade: materiasNoCalendario,
        descricao: `Plano ${planoAtivo} · ${descreverCombinacao(cursoSelecionado, semestreAtual)}`
      };
    }
    const ultimo = persistencia.ultimoSalvo();
    if (!ultimo) return null;
    const estado = reidratarSetup(ultimo.setup, catalogoDe(ultimo.curso, ultimo.matriz));
    const grade = estado.planos[estado.planoAtivo];
    if (Object.keys(grade).length === 0) return null;
    return { grade, descricao: `Plano ${estado.planoAtivo} · ${descreverCombinacao(ultimo.curso, ultimo.semestre)}` };
  };

  const abrirComparacao = (amigos = []) => {
    const minha = minhaGradeParaComparar();
    setComparacao({
      chave: Date.now(),
      pessoas: [
        ...(minha ? [{ id: 'voce', nome: 'Você', fixo: true, ...minha }] : []),
        ...amigos
      ]
    });
    navegarParaEtapa(ETAPAS.COMPARAR);
  };

  const handleCompararCompartilhada = () => {
    if (!compartilhada) return;
    abrirComparacao([{
      id: 'amigo-link',
      nome: 'Amigo 1',
      grade: compartilhada.grade,
      descricao: descreverCombinacao(compartilhada.curso, compartilhada.semestre)
    }]);
  };

  const carregarLinkParaComparar = async texto => {
    const token = extrairTokenDeTexto(texto);
    if (!token) throw new Error('Cole o link de uma grade do GradeUFLA (ele tem “#g=” no final).');
    let dados;
    try {
      dados = await decodificarGrade(token);
    } catch (erro) {
      throw new Error(erro?.message && erro.message !== new LinkInvalidoError().message
        ? erro.message
        : 'Esse link está incompleto ou corrompido. Peça pra pessoa copiar de novo.');
    }
    const catalogo = catalogoDe(dados.curso, dados.matriz);
    if (catalogo.size === 0) throw new Error('Esse link é de um curso ou matriz que não está no site agora.');
    const { grade, removidas } = reidratarGrade(paraGradeSalva(dados.turmas), catalogo);
    return {
      grade,
      descricao: descreverCombinacao(dados.curso, dados.semestre),
      avisos: mensagensRemovidas('dessa grade', removidas, getNomeMateriaOuCodigo)
    };
  };

  const handleVoltarDaComparacao = () => {
    try {
      window.history.back();
    } catch {
      navegarParaEtapa(ETAPAS.INICIO);
    }
  };

  const handleFecharCompartilhada = () => {
    setCompartilhada(null);
    if (!continuarDeOndeParei()) navegarParaEtapa(ETAPAS.INICIO);
  };

  // Recarregou a página (ou abriu um link): assim que o CSV chega, vai pro lugar certo.
  const restauracaoFeitaRef = useRef(false);
  useEffect(() => {
    if (restauracaoFeitaRef.current || csvLoadState.status !== 'success') return;
    restauracaoFeitaRef.current = true;
    if (etapa !== ETAPAS.INICIO) return;
    if (!tokenLink) {
      continuarDeOndeParei();
      return;
    }
    decodificarGrade(tokenLink)
      .then(dados => {
        if (!abrirGradeCompartilhada(dados)) continuarDeOndeParei();
      })
      .catch(erro => {
        addToast(
          erro instanceof LinkInvalidoError && erro.message !== new LinkInvalidoError().message
            ? erro.message
            : 'Link de grade inválido ou incompleto. Peça pra pessoa copiar de novo.',
          'error'
        );
        continuarDeOndeParei();
      });
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
        {/* No celular o botão flutuante cobriria a grade compartilhada. */}
        {!fluxoMobile && !(isMobile && [ETAPAS.COMPARTILHADA, ETAPAS.COMPARAR].includes(etapa)) && <AboutMe />}
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
                onGerarLink={gerarLinkGrade}
                onComparar={() => abrirComparacao()}
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
          {etapa === ETAPAS.COMPARTILHADA && compartilhada && (
            <GradeCompartilhada
              compartilhada={compartilhada}
              cursoNome={getCursoInfo(compartilhada.curso)?.nome || compartilhada.curso}
              periodoAtual={ACADEMIC_TERM}
              avisos={mensagensRemovidas('da grade compartilhada', compartilhada.removidas, getNomeMateriaOuCodigo)}
              planosDestino={planosDestino}
              onUsarComoPlano={handleUsarComoPlano}
              onComparar={handleCompararCompartilhada}
              onFechar={handleFecharCompartilhada}
            />
          )}
          {etapa === ETAPAS.COMPARAR && comparacao && (
            <Comparar
              key={comparacao.chave}
              pessoasIniciais={comparacao.pessoas}
              carregarLink={carregarLinkParaComparar}
              onVoltar={handleVoltarDaComparacao}
              compacto={isMobile}
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
              onGerarLink={gerarLinkGrade}
              onComparar={() => abrirComparacao()}
              professorFiltro={professorFiltro}
              onProfessorFiltro={setProfessorFiltro}
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
            professorDestaque={fluxoMobile ? '' : professorFiltro}
          />
        )}
      </div>
    </>
  );
}

export default App;
