import { useSyncExternalStore } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import * as data from './data';

vi.mock('./components/Particles', () => ({ default: () => null }));

vi.mock('./components', async () => {
  const [toast, hero, historico, calendar, materiaModal, setupWizard] = await Promise.all([
    vi.importActual('./components/Toast/Toast'),
    vi.importActual('./components/Hero/Hero'),
    vi.importActual('./components/Historico/Historico'),
    vi.importActual('./components/Calendar/Calendar'),
    vi.importActual('./components/Modal/MateriaModal'),
    vi.importActual('./components/SetupWizard/SetupWizard')
  ]);
  return {
    AboutMe: () => null,
    SetupWizard: setupWizard.default,
    Hero: hero.default,
    Historico: historico.default,
    Calendar: calendar.default,
    MateriaModal: materiaModal.default,
    ToastContainer: toast.default,
    useToast: toast.useToast
  };
});

vi.mock('./data', async () => {
  const gradeRules = await vi.importActual('./domain/gradeRules');
  const getCsvLoadState = vi.fn();
  const subscribeCsvLoadState = vi.fn();
  const getNomeMateria = vi.fn();
  return {
    ensureCsvLoaded: vi.fn(),
    getCsvLoadState,
    useCsvLoadState: () => useSyncExternalStore(subscribeCsvLoadState, getCsvLoadState),
    getNomeMateriaOuCodigo: codigo => getNomeMateria(codigo) || codigo,
    getPendenciasPrerequisito: gradeRules.getPendenciasPrerequisito,
    getCursoInfo: vi.fn(),
    getCursosImplementados: vi.fn(),
    getEletivas: vi.fn(),
    getMateriasPorSemestre: vi.fn(),
    getMatrizesByCurso: vi.fn(),
    getNomeMateria,
    getTotalSemestres: vi.fn(),
    retryCsvLoad: vi.fn(),
    subscribeCsvLoadState,
    verificarPreRequisitos: gradeRules.verificarPreRequisitos,
    verificarPreRequisitosDetalhada: gradeRules.verificarPreRequisitosDetalhada
  };
});

const introducao = {
  codigo: 'GCC101',
  nome: 'Introdução à Computação',
  semestre: 1,
  creditos: 4,
  tipo: 'obrigatoria',
  preRequisitos: [],
  preRequisitosDetalhada: { forte: [], minimo: [], coreq: [] },
  turmas: [{ id: 'A', horarios: [{ dia: 1, inicio: 8, fim: 10 }] }]
};

const algoritmos = {
  codigo: 'GCC202',
  nome: 'Algoritmos e Estruturas de Dados',
  semestre: 2,
  creditos: 4,
  tipo: 'obrigatoria',
  preRequisitos: ['GCC101'],
  preRequisitosDetalhada: { forte: ['GCC101'], minimo: [], coreq: [] },
  turmas: [
    { id: 'A', horarios: [{ dia: 2, inicio: 8, fim: 10 }] },
    { id: 'B', horarios: [{ dia: 4, inicio: 10, fim: 12 }] }
  ]
};

const materiasPorSemestre = {
  1: [introducao],
  2: [algoritmos]
};

let csvListener;

const selectOption = (comboboxName, optionName) => {
  fireEvent.click(screen.getByRole('combobox', { name: comboboxName }));
  fireEvent.click(screen.getByRole('option', { name: optionName }));
};

const completeSetup = async () => {
  fireEvent.click(screen.getByRole('button', { name: /vamos lá/i }));

  expect(await screen.findByRole('heading', { name: /qual é o seu curso/i })).toBeInTheDocument();
  selectOption(/curso/i, /G001 - Sistemas de Informação/i);
  fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

  expect(screen.getByRole('heading', { name: /qual é a sua matriz curricular/i })).toBeInTheDocument();
  selectOption(/matriz curricular/i, /matriz 2023\/01/i);
  fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

  expect(screen.getByRole('heading', { name: /qual semestre você está/i })).toBeInTheDocument();
  selectOption(/semestre/i, /2º módulo/i);
  fireEvent.click(screen.getByRole('button', { name: /finalizar/i }));

  expect(await screen.findByRole('heading', { name: 'Matérias' })).toBeInTheDocument();
};

const reachCalendar = async () => {
  await completeSetup();
  fireEvent.click(screen.getByRole('button', { name: /continuar para montagem/i }));
  expect(await screen.findByRole('heading', { name: /minha grade - 2º semestre/i })).toBeInTheDocument();
};

const openAlgoritmosModal = () => {
  fireEvent.click(screen.getAllByRole('button', {
    name: `Ver informações de ${algoritmos.nome}`
  })[0]);
  return screen.getByRole('dialog', { name: algoritmos.nome });
};

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  csvListener = null;
  window.history.replaceState(null, document.title, '/');

  data.ensureCsvLoaded.mockResolvedValue({});
  data.getCsvLoadState.mockReturnValue({ status: 'success', error: null });
  data.getCursoInfo.mockReturnValue({
    id: 'G001',
    nome: 'Sistemas de Informação',
    totalSemestres: 8
  });
  data.getCursosImplementados.mockReturnValue([
    { id: 'G001', nome: 'Sistemas de Informação', implementado: true }
  ]);
  data.getMatrizesByCurso.mockReturnValue([{ id: '2023/01', nome: '2023/01' }]);
  data.getTotalSemestres.mockReturnValue(8);
  data.getMateriasPorSemestre.mockReturnValue(materiasPorSemestre);
  data.getEletivas.mockReturnValue([]);
  data.getNomeMateria.mockImplementation(codigo => ({
    GCC101: introducao.nome,
    GCC202: algoritmos.nome
  })[codigo] || codigo);
  data.subscribeCsvLoadState.mockImplementation(listener => {
    csvListener = listener;
    return () => {
      if (csvListener === listener) csvListener = null;
    };
  });
  data.retryCsvLoad.mockResolvedValue({});
});

afterEach(() => {
  vi.clearAllMocks();
});

test('percorre Hero, Setup, Histórico e Montagem preservando o histórico acadêmico', async () => {
  render(<App />);

  await completeSetup();

  const introducaoCheckbox = screen.getByLabelText(/introdução à computação/i);
  expect(introducaoCheckbox).toBeChecked();

  fireEvent.click(screen.getByRole('button', { name: /continuar para montagem/i }));

  expect(await screen.findByRole('heading', { name: /minha grade - 2º semestre/i })).toBeInTheDocument();
  expect(screen.getByText(algoritmos.nome)).toBeInTheDocument();
  expect(window.history.state).toEqual({ etapa: 'montagem' });
});

test('mostra a falha do CSV, executa retry e libera o fluxo completo', async () => {
  const errorState = { status: 'error', error: new Error('Falha de rede') };
  const successState = { status: 'success', error: null };
  data.getCsvLoadState.mockReturnValue(errorState);
  data.retryCsvLoad.mockImplementation(() => {
    data.getCsvLoadState.mockReturnValue(successState);
    csvListener?.(successState);
    return Promise.resolve({});
  });

  render(<App />);

  expect(screen.getByRole('alert')).toHaveTextContent(/não foi possível carregar os dados acadêmicos/i);
  expect(screen.getByRole('button', { name: /vamos lá/i })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));

  await waitFor(() => expect(screen.getByRole('button', { name: /vamos lá/i })).toBeEnabled());
  expect(data.retryCsvLoad).toHaveBeenCalledTimes(1);

  await completeSetup();
  fireEvent.click(screen.getByRole('button', { name: /continuar para montagem/i }));
  expect(await screen.findByRole('heading', { name: /minha grade - 2º semestre/i })).toBeInTheDocument();
});

test('troca e remove uma turma pelo modal conectado ao App', async () => {
  render(<App />);
  await reachCalendar();

  let dialog = openAlgoritmosModal();
  fireEvent.click(within(dialog).getByRole('button', { name: /turma a/i }));
  fireEvent.click(within(dialog).getByRole('button', { name: /fechar detalhes/i }));

  expect(screen.getByText('Créditos:').parentElement).toHaveTextContent('Créditos: 4');

  dialog = openAlgoritmosModal();
  fireEvent.click(within(dialog).getByRole('button', { name: /turma b/i }));
  fireEvent.click(within(dialog).getByRole('button', { name: /fechar detalhes/i }));

  dialog = openAlgoritmosModal();
  expect(within(dialog).getByText('Turma B').closest('.turma-item')).toHaveTextContent(/horário escolhido/i);

  fireEvent.click(within(dialog).getByRole('button', { name: /remover do calendário/i }));

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByText('Créditos:').parentElement).toHaveTextContent('Créditos: 0');
  expect(screen.getAllByRole('button', { name: `Ver informações de ${algoritmos.nome}` })).toHaveLength(1);
});

test('responde a voltar e avançar do navegador sem perder a seleção do setup', async () => {
  render(<App />);
  await reachCalendar();

  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state: { etapa: 'historico' } }));
  });
  expect(await screen.findByRole('heading', { name: 'Matérias' })).toBeInTheDocument();

  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state: { etapa: 'setup' } }));
  });
  expect(await screen.findByRole('heading', { name: /qual semestre você está/i })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: /semestre/i })).toHaveTextContent(/2º módulo/i);

  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state: { etapa: 'historico' } }));
  });
  expect(await screen.findByRole('heading', { name: 'Matérias' })).toBeInTheDocument();
});

test('confirmações de pré-requisito mínimo valem só para a combinação em que foram feitas', async () => {
  const estatistica = {
    codigo: 'GES105',
    nome: 'Bioestatística',
    semestre: 2,
    creditos: 4,
    tipo: 'obrigatoria',
    preRequisitos: ['GMM116'],
    preRequisitosDetalhada: { forte: [], minimo: ['GMM116'], coreq: [] },
    turmas: [{ id: 'A', horarios: [{ dia: 3, inicio: 8, fim: 10 }] }]
  };
  data.getMateriasPorSemestre.mockReturnValue({ 1: [introducao], 2: [algoritmos, estatistica] });
  data.getMatrizesByCurso.mockReturnValue([
    { id: '2023/01', nome: '2023/01' },
    { id: '2019/01', nome: '2019/01' }
  ]);

  const cardBloqueado = () => screen.getByText(estatistica.nome)
    .closest('.materia-card')
    .querySelector('.materia-card__minimo-btn');

  const refazerSetupComMatriz = async matriz => {
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^voltar$/i }));
    await screen.findByRole('heading', { name: /qual semestre você está/i });
    fireEvent.click(document.querySelector('.stepper-back-button'));
    selectOption(/matriz curricular/i, new RegExp(`matriz ${matriz}`, 'i'));
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    selectOption(/semestre/i, /2º módulo/i);
    fireEvent.click(screen.getByRole('button', { name: /finalizar/i }));
    fireEvent.click(await screen.findByRole('button', { name: /continuar para montagem/i }));
    expect(await screen.findByText(estatistica.nome)).toBeInTheDocument();
  };

  render(<App />);
  await reachCalendar();

  fireEvent.click(cardBloqueado());
  fireEvent.click(screen.getByRole('button', { name: /sim, destravar matéria/i }));
  expect(cardBloqueado()).toBeNull();

  // Outra matriz começa sem a confirmação…
  await refazerSetupComMatriz('2019/01');
  expect(cardBloqueado()).not.toBeNull();

  // …e voltar pra matriz original recupera o que foi confirmado nela.
  await refazerSetupComMatriz('2023/01');
  expect(cardBloqueado()).toBeNull();
});

const adicionarAlgoritmos = turma => {
  const dialog = openAlgoritmosModal();
  fireEvent.click(within(dialog).getByRole('button', { name: new RegExp(`turma ${turma}`, 'i') }));
  fireEvent.click(within(dialog).getByRole('button', { name: /fechar detalhes/i }));
};

const creditos = () => screen.getByText('Créditos:').parentElement;

test('recarregar a página volta pra montagem com a grade salva', async () => {
  const { unmount } = render(<App />);
  await reachCalendar();
  adicionarAlgoritmos('B');
  expect(creditos()).toHaveTextContent('Créditos: 4');

  // Desmontar grava o que estava pendente no debounce (como o pagehide ao recarregar).
  unmount();
  const salvo = JSON.parse(window.localStorage.getItem('gradeufla:v1'));
  expect(salvo.setups['G001|2023/01|2'].planos.A).toEqual({ GCC202: { turmaId: 'B' } });

  render(<App />);
  expect(await screen.findByRole('heading', { name: /minha grade - 2º semestre/i })).toBeInTheDocument();
  expect(creditos()).toHaveTextContent('Créditos: 4');
  const dialog = openAlgoritmosModal();
  expect(within(dialog).getByText('Turma B').closest('.turma-item')).toHaveTextContent(/horário escolhido/i);
});

test('cada plano guarda a sua grade e o duplicar copia o plano ativo', async () => {
  render(<App />);
  await reachCalendar();
  adicionarAlgoritmos('A');

  fireEvent.click(screen.getByRole('tab', { name: /plano b/i }));
  expect(screen.getByRole('tab', { name: /plano b/i })).toHaveAttribute('aria-selected', 'true');
  expect(creditos()).toHaveTextContent('Créditos: 0');

  fireEvent.click(screen.getByRole('tab', { name: /plano a/i }));
  expect(creditos()).toHaveTextContent('Créditos: 4');
  expect(screen.getByRole('tab', { name: /plano a/i })).toHaveAccessibleName('Plano A, 4 créditos');

  fireEvent.click(screen.getByRole('button', { name: /opções do plano a/i }));
  fireEvent.click(screen.getByRole('button', { name: /duplicar em plano c/i }));
  expect(screen.getByRole('tab', { name: /plano c/i })).toHaveAttribute('aria-selected', 'true');
  expect(creditos()).toHaveTextContent('Créditos: 4');

  fireEvent.click(screen.getByRole('button', { name: /opções do plano c/i }));
  fireEvent.click(screen.getByRole('button', { name: /limpar plano c/i }));
  fireEvent.click(screen.getByRole('button', { name: /^limpar$/i }));
  expect(creditos()).toHaveTextContent('Créditos: 0');
  expect(screen.getByRole('tab', { name: /plano a/i })).toHaveAccessibleName('Plano A, 4 créditos');
});

test('começar do zero apaga a grade salva', async () => {
  window.localStorage.setItem('gradeufla:v1', JSON.stringify({
    v: 1,
    ultimo: 'G001|2023/01|2',
    etapa: 'historico',
    setups: {
      'G001|2023/01|2': { aprovadas: ['GCC101'], minimoConfirmados: [], planoAtivo: 'A', planos: { A: {}, B: {}, C: {} } }
    }
  }));
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Matérias' })).toBeInTheDocument();

  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state: { etapa: 'inicio' } }));
  });
  fireEvent.click(await screen.findByRole('button', { name: /começar do zero/i }));
  fireEvent.click(screen.getByRole('button', { name: /apagar e começar/i }));

  expect(await screen.findByRole('heading', { name: /qual é o seu curso/i })).toBeInTheDocument();
  expect(window.localStorage.getItem('gradeufla:v1')).toBeNull();
});

test('avisa quando uma matéria salva saiu da grade porque a turma não existe mais', async () => {
  window.localStorage.setItem('gradeufla:v1', JSON.stringify({
    v: 1,
    ultimo: 'G001|2023/01|2',
    etapa: 'montagem',
    setups: {
      'G001|2023/01|2': {
        aprovadas: ['GCC101'],
        minimoConfirmados: [],
        planoAtivo: 'A',
        planos: { A: { GCC202: { turmaId: 'Z' } }, B: {}, C: {} }
      }
    }
  }));
  render(<App />);

  expect(await screen.findByRole('heading', { name: /minha grade - 2º semestre/i })).toBeInTheDocument();
  expect(await screen.findByText(/Algoritmos e Estruturas de Dados saiu do Plano A porque a turma não existe mais/))
    .toBeInTheDocument();
  expect(creditos()).toHaveTextContent('Créditos: 0');
});
