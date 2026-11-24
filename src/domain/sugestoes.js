import {
  findNextAnpHour,
  getPendenciasPrerequisito,
  isAnpTurma,
  isTurmaSelecionavel,
  materiaComTurma,
  normalizarDia,
  normalizarHora,
  excedeLimiteCreditos,
  verificarConflitoMateria
} from './gradeRules';

/** Matérias que ainda podem ir para a grade, separadas como nas abas da gaveta. */
export function listasParaAdicionar({
  materiasPorSemestre = {},
  eletivas = [],
  semestreAtual,
  materiasAprovadas = [],
  materiasNoCalendario = {}
}) {
  const aprovadas = new Set(materiasAprovadas);
  const livre = materia => !aprovadas.has(materia.codigo) && !materiasNoCalendario[materia.codigo];
  const atual = Number(semestreAtual);
  const semestres = Object.keys(materiasPorSemestre)
    .map(Number)
    .filter(numero => Number.isFinite(numero) && numero > 0)
    .sort((a, b) => a - b);

  const doSemestre = (materiasPorSemestre[atual] || []).filter(livre);
  const pendentes = [];
  const futuras = [];
  semestres.forEach(numero => {
    if (numero === atual) return;
    const destino = numero < atual ? pendentes : futuras;
    (materiasPorSemestre[numero] || []).forEach(materia => {
      if (livre(materia)) destino.push({ ...materia, semestreOriginal: numero });
    });
  });

  return {
    semestre: doSemestre,
    pendentes,
    eletivas: (Array.isArray(eletivas) ? eletivas : []).filter(livre),
    futuras
  };
}

/** Situação de cada turma: disponível, sem horário, em conflito ou já na grade. */
export function avaliarTurma(materia, turma, materiasNoCalendario = {}) {
  const atual = materiasNoCalendario[materia.codigo]?.turmaId === turma.id;
  const selecionavel = isTurmaSelecionavel(turma);
  const candidata = materiaComTurma(materia, turma);
  let conflito = selecionavel
    ? verificarConflitoMateria(candidata, materiasNoCalendario, { ignorarCodigo: materia.codigo })
    : { temConflito: false };
  // Turma híbrida: os horários da semana cabem, mas a hora ANP do sábado também precisa caber.
  if (!conflito.temConflito && isAnpTurma(candidata)
    && findNextAnpHour(materiasNoCalendario, { ignorarCodigo: materia.codigo }) == null) {
    conflito = { temConflito: true, mensagem: 'Sem vaga ANP no sábado' };
  }
  return {
    atual,
    selecionavel,
    conflito: conflito.temConflito ? conflito : null,
    disponivel: selecionavel && !conflito.temConflito && !atual
  };
}

// ---------- "o que isso destrava" ----------

/** Pré-requisitos que travam a matéria (forte e mínimo; co-requisito é cursado junto). */
const requisitosQueTravam = materia => {
  const detalhada = materia?.preRequisitosDetalhada;
  if (!detalhada) return materia?.preRequisitos || [];
  return [...(detalhada.forte || []), ...(detalhada.minimo || [])];
};

/**
 * Matérias da matriz que têm `codigo` como pré-requisito (forte ou mínimo) e ainda não foram feitas.
 * `liberaDeVez` diz se, feita `codigo`, ela não pede mais nada; senão `faltaAinda` lista o resto.
 * `totalNaCadeia` conta tudo o que depende dela, direta ou indiretamente.
 */
export function oQueDestrava(
  codigo,
  allMateriasList = [],
  { materiasAprovadas = [], prerequisitosConfirmados = [] } = {}
) {
  const vazio = { diretas: [], totalNaCadeia: 0 };
  if (!codigo || !Array.isArray(allMateriasList)) return vazio;

  const feitas = new Set([...materiasAprovadas, ...prerequisitosConfirmados]);
  const porCodigo = new Map();
  allMateriasList.forEach(materia => {
    if (materia?.codigo && !porCodigo.has(materia.codigo)) porCodigo.set(materia.codigo, materia);
  });
  const abertas = [...porCodigo.values()].filter(materia => !feitas.has(materia.codigo));
  const dependeDe = (materia, alvo) => requisitosQueTravam(materia).includes(alvo);

  const diretas = abertas
    .filter(materia => materia.codigo !== codigo && dependeDe(materia, codigo))
    .map(materia => {
      const faltaAinda = requisitosQueTravam(materia)
        .filter(requisito => requisito !== codigo && !feitas.has(requisito));
      return { materia, liberaDeVez: faltaAinda.length === 0, faltaAinda };
    })
    .sort((a, b) => (
      Number(b.liberaDeVez) - Number(a.liberaDeVez)
      || (Number(a.materia.semestre) || 99) - (Number(b.materia.semestre) || 99)
      || String(a.materia.nome).localeCompare(String(b.materia.nome), 'pt-BR')
    ));

  const cadeia = new Set();
  const fila = [codigo];
  while (fila.length > 0) {
    const atual = fila.shift();
    abertas.forEach(materia => {
      if (materia.codigo === codigo || cadeia.has(materia.codigo)) return;
      if (dependeDe(materia, atual)) {
        cadeia.add(materia.codigo);
        fila.push(materia.codigo);
      }
    });
  }

  return { diretas, totalNaCadeia: cadeia.size };
}

/** Quantas matérias ainda não feitas pedem `codigo` diretamente. Para o selo dos cards. */
export function contarDestravadas(
  codigo,
  allMateriasList = [],
  { materiasAprovadas = [], prerequisitosConfirmados = [] } = {}
) {
  if (!codigo || !Array.isArray(allMateriasList)) return 0;
  const feitas = new Set([...materiasAprovadas, ...prerequisitosConfirmados]);
  const contadas = new Set();
  allMateriasList.forEach(materia => {
    if (!materia?.codigo || materia.codigo === codigo || feitas.has(materia.codigo)) return;
    if (requisitosQueTravam(materia).includes(codigo)) contadas.add(materia.codigo);
  });
  return contadas.size;
}

/** "Libera X" / "Libera X e Y" / "Libera X, Y e mais 2", com os nomes das que liberam de vez primeiro. */
export function resumoDestrava({ diretas }, limite = 2) {
  if (diretas.length === 0) return '';
  const nomes = diretas.slice(0, limite).map(item => item.materia.nome);
  const resto = diretas.length - nomes.length;
  if (resto > 0) return `${nomes.join(', ')} e mais ${resto}`;
  return nomes.length === 2 ? `${nomes[0]} e ${nomes[1]}` : nomes[0];
}

// ---------- "o que encaixa neste horário" ----------

const turmaCobre = (turma, dia, hora) => (turma?.horarios || []).some(horario => {
  if (normalizarDia(horario?.dia) !== dia) return false;
  const inicio = normalizarHora(horario.inicio);
  const fim = normalizarHora(horario.fim);
  return inicio != null && fim != null && inicio <= hora && hora < fim;
});

export const GRUPOS_ENCAIXE = [
  ['semestre', 'Do semestre'],
  ['pendentes', 'Pendentes'],
  ['eletivas', 'Eletivas'],
  ['futuras', 'Futuras']
];

/**
 * Matérias com turma que tem aula em `dia` (0 = dom … 6 = sáb) na hora `hora`
 * e que entram na grade sem choque, sem pré-requisito pendente e sem passar do limite de créditos.
 * `listas` vem de `listasParaAdicionar`. Devolve os grupos na ordem das abas, sem os vazios,
 * e quantas ficaram de fora só por pré-requisito ou créditos (para explicar a lista vazia).
 */
export function oQueEncaixa(dia, hora, listas = {}, contexto = {}) {
  const { materiasNoCalendario = {} } = contexto;
  const grupos = [];
  let barradas = 0;

  GRUPOS_ENCAIXE.forEach(([chave, rotulo]) => {
    const itens = [];
    (listas[chave] || []).forEach(materia => {
      const turmas = (materia.turmas || []).filter(turma => (
        turmaCobre(turma, dia, hora)
        && avaliarTurma(materia, turma, materiasNoCalendario).disponivel
      ));
      if (turmas.length === 0) return;
      const pendencias = getPendenciasPrerequisito(materia, contexto);
      if (!pendencias.podeAdicionar || excedeLimiteCreditos(materiasNoCalendario, materia)) {
        barradas += 1;
        return;
      }
      itens.push({ materia, turmas, faltandoCoreq: pendencias.faltandoCoreq });
    });
    if (itens.length > 0) grupos.push({ chave, rotulo, itens });
  });

  return { grupos, total: grupos.reduce((soma, grupo) => soma + grupo.itens.length, 0), barradas };
}
