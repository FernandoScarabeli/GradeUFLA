import {
  findNextAnpHour,
  formatarAula,
  getPendenciasPrerequisito,
  isAnpOnly,
  isAnpTurma,
  isTurmaSelecionavel,
  materiaComTurma,
  normalizarDia,
  normalizarHora,
  SATURDAY_INDEX,
  verificarConflitoMateria
} from '../../domain/gradeRules';
import { professorDaMateriaQueCasa, semAcento } from '../../domain/professores';

export const DIAS_GRADE = [1, 2, 3, 4, 5, 6];
export const HORA_INICIO = 7;
export const HORA_FIM = 23;
export const DIAS_LONGOS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Busca sem diferenciar maiúsculas nem acentos, por nome, código ou professor (CSV novo). */
export const casaBusca = (materia, termo) => {
  const q = semAcento(termo);
  if (!q) return true;
  return semAcento(materia?.nome).includes(q)
    || semAcento(materia?.codigo).includes(q)
    || professorDaMateriaQueCasa(materia, q) !== null;
};

/** Professor que fez a matéria aparecer na busca (quando não foi pelo nome nem pelo código). */
export const professorDaBusca = (materia, termo) => {
  const q = semAcento(termo);
  if (!q || semAcento(materia?.nome).includes(q) || semAcento(materia?.codigo).includes(q)) return null;
  return professorDaMateriaQueCasa(materia, q);
};

export const pad2 = hora => String(hora).padStart(2, '0');

export const formatarIntervalo = (horario, opcoes) => formatarAula(horario, opcoes);

/** Aulas de um dia, ordenadas, já com o horário do sábado marcado como ANP. */
export function blocosDoDia(materiasNoCalendario = {}, dia) {
  const blocos = [];
  for (const [codigo, materia] of Object.entries(materiasNoCalendario || {})) {
    (materia?.horarios || []).forEach((horario, index) => {
      if (normalizarDia(horario?.dia) !== dia) return;
      const inicio = normalizarHora(horario.inicio);
      const fim = normalizarHora(horario.fim);
      if (inicio == null || fim == null || fim <= inicio) return;
      const anp = isAnpTurma(materia)
        && dia === SATURDAY_INDEX
        && materia.anpHour != null
        && Number(materia.anpHour) === inicio;
      // Como na grade do desktop: para turma ANP, no sábado só vale a hora ANP alocada.
      if (isAnpTurma(materia) && dia === SATURDAY_INDEX && !anp) return;
      blocos.push({ key: `${codigo}-${index}`, codigo, materia, horario, inicio, fim, anp });
    });
  }
  return blocos.sort((a, b) => a.inicio - b.inicio);
}

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

// Mantido aqui por compatibilidade: a fonte é o domínio.
export { materiaComTurma };

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

export function descreverConflito(conflito) {
  if (!conflito) return '';
  if (!conflito.horarioConflito) return conflito.mensagem || 'Choca com a sua grade';
  return `Choca com ${conflito.materiaConflito} · ${formatarIntervalo(conflito.horarioConflito)}`;
}

/** Hora de sábado que a parte ANP ocuparia, ou null quando não há vaga. */
export const horaAnpPrevista = (materia, materiasNoCalendario = {}) => (
  findNextAnpHour(materiasNoCalendario, { ignorarCodigo: materia.codigo })
);

/**
 * O que impede (ou condiciona) adicionar a matéria, na ordem em que a lista mostra:
 * forte → mínimo → sem turmas → todas chocam → co-requisito.
 * Eletivas podem confirmar pré-requisito forte, como no desktop: muitas pedem
 * matérias de outros cursos, que não aparecem no histórico.
 */
export function situacaoMateria(materia, contexto) {
  const pendencias = getPendenciasPrerequisito(materia, contexto);
  const turmas = materia.turmas || [];
  const ehEletiva = materia.tipo === 'eletiva';

  if (pendencias.faltandoForte.length > 0) {
    return {
      tipo: 'forte',
      codigos: pendencias.faltandoForte,
      bloqueada: !ehEletiva,
      confirmavel: ehEletiva
    };
  }
  if (pendencias.faltandoMinimo.length > 0) {
    return { tipo: 'minimo', codigos: pendencias.faltandoMinimo, bloqueada: false, confirmavel: true };
  }
  if (!turmas.some(isTurmaSelecionavel)) {
    return { tipo: 'sem-turma', codigos: [], bloqueada: true, confirmavel: false };
  }
  const livres = turmas.filter(turma => avaliarTurma(materia, turma, contexto.materiasNoCalendario).disponivel);
  if (livres.length === 0) {
    return { tipo: 'choque', codigos: [], bloqueada: false, confirmavel: false };
  }
  if (pendencias.faltandoCoreq.length > 0) {
    return { tipo: 'coreq', codigos: pendencias.faltandoCoreq, bloqueada: false, confirmavel: false };
  }
  return { tipo: null, codigos: [], bloqueada: false, confirmavel: false };
}

/** Primeiro dia da semana em que a matéria tem aula (sábado para ANP pura). */
export function primeiroDiaDaMateria(materia) {
  const dias = (materia?.horarios || [])
    .map(horario => normalizarDia(horario?.dia))
    .filter(dia => dia != null && dia >= 1 && dia <= 6)
    .sort((a, b) => a - b);
  if (dias.length > 0) return dias[0];
  if (isAnpTurma(materia) && isAnpOnly(materia)) return SATURDAY_INDEX;
  return null;
}

/** Dia que a grade abre: hoje, se for de segunda a sábado; senão, segunda. */
export const diaInicial = (data = new Date()) => {
  const hoje = data.getDay();
  return hoje >= 1 && hoje <= 6 ? hoje : 1;
};
