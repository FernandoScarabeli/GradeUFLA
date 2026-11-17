// PROTÓTIPO do "Monta pra mim" (F5): gera combinações de turmas sem conflito e ordena
// pelas preferências do aluno. Ainda sem interface; ver docs/specs/montador-proposta.md.

import {
  comHorarioAnp,
  CREDIT_MAX,
  findNextAnpHour,
  isAnpTurma,
  isTurmaSelecionavel,
  materiaComTurma,
  SATURDAY_INDEX
} from './gradeRules';
import { buildCalendarOccupancy } from '../components/Calendar/useCalendarDrag';

export const PERIODOS = {
  manha: [7, 12],
  tarde: [12, 18],
  noite: [18, 23]
};

export const PESOS_PADRAO = {
  horaEvitada: 3, // por hora de aula num período que o aluno quer evitar
  horaEmDiaLivre: 10, // por hora de aula num dia que ele quer livre
  dia: 4, // por dia com aula (quando "menos dias" está ligado)
  buraco: 1 // por hora vaga entre aulas no mesmo dia (quando "menos buracos" está ligado)
};

// Hora da semana como número: dia * 24 + hora.
const slot = (dia, hora) => dia * 24 + hora;
const slotsDaGrade = grade => [...buildCalendarOccupancy(grade || {}).keys()].map(chave => {
  const [dia, hora] = chave.split(':').map(Number);
  return slot(dia, hora);
});

const emPeriodoEvitado = (hora, evitar) => evitar.some(periodo => {
  const [inicio, fim] = PERIODOS[periodo] || [Infinity, -Infinity];
  return hora >= inicio && hora < fim;
});

/** Custo das horas que só cresce ao acrescentar aulas (períodos evitados e dias livres). */
function custoDasHoras(slots, { evitar = [], diasLivres = [], pesos = PESOS_PADRAO }) {
  let custo = 0;
  for (const valor of slots) {
    const dia = Math.floor(valor / 24);
    if (diasLivres.includes(dia)) custo += pesos.horaEmDiaLivre;
    if (emPeriodoEvitado(valor % 24, evitar)) custo += pesos.horaEvitada;
  }
  return custo;
}

/** Avaliação completa de um conjunto de horas ocupadas. Menor `pontos` é melhor. */
function avaliarSlots(slots, preferencias = {}) {
  const { evitar = [], diasLivres = [], menosDias = false, menosBuracos = false, pesos = PESOS_PADRAO } = preferencias;
  const porDia = new Map();
  let horasEvitadas = 0;
  let horasEmDiasLivres = 0;
  for (const valor of slots) {
    const dia = Math.floor(valor / 24);
    const hora = valor % 24;
    const atual = porDia.get(dia);
    if (atual) {
      atual.min = Math.min(atual.min, hora);
      atual.max = Math.max(atual.max, hora);
      atual.horas += 1;
    } else {
      porDia.set(dia, { min: hora, max: hora, horas: 1 });
    }
    if (diasLivres.includes(dia)) horasEmDiasLivres += 1;
    if (emPeriodoEvitado(hora, evitar)) horasEvitadas += 1;
  }
  let buracos = 0;
  for (const { min, max, horas } of porDia.values()) buracos += max - min + 1 - horas;
  const dias = porDia.size;
  const pontos = horasEvitadas * pesos.horaEvitada
    + horasEmDiasLivres * pesos.horaEmDiaLivre
    + (menosDias ? dias * pesos.dia : 0)
    + (menosBuracos ? buracos * pesos.buraco : 0);
  return { pontos, dias, buracos, horasEvitadas, horasEmDiasLivres };
}

/** Pontuação de uma grade já montada (mesma regra usada na busca). */
export const pontuarGrade = (grade, preferencias = {}) => avaliarSlots(slotsDaGrade(grade), preferencias);

/** Pré-calcula, por turma, as horas ocupadas (sem a hora ANP do sábado) e o custo delas. */
function prepararMateria(materia, preferencias) {
  const turmas = (materia.turmas || []).filter(isTurmaSelecionavel).map(turma => {
    const entrada = materiaComTurma(materia, turma);
    const slots = slotsDaGrade({ [materia.codigo]: entrada });
    return {
      entrada,
      anp: isAnpTurma(entrada),
      slots,
      dias: [...new Set(slots.map(valor => Math.floor(valor / 24)))],
      custo: custoDasHoras(slots, preferencias)
    };
  });
  // A turma mais barata primeiro: boas grades aparecem cedo e a poda fica mais forte.
  turmas.sort((a, b) => a.custo - b.custo);
  return { materia, turmas, custoMinimo: turmas[0]?.custo ?? 0 };
}

const agora = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * materias: matérias do catálogo (já liberadas por pré-requisito).
 * opcoes.quantidade: quantas delas precisam entrar ("quero 5 dessas 8"); padrão: todas.
 * opcoes.tempoMaxMs / maxNos: orçamento; ao estourar, devolve o melhor achado até ali.
 * Devolve as `limite` melhores grades, do melhor pro pior.
 *
 * Backtracking com branch and bound: o limite inferior de um nó é o custo das horas já
 * escolhidas + dias usados + o custo mínimo das matérias que ainda precisam entrar.
 * Buracos e a hora ANP do sábado só entram na pontuação exata da grade completa.
 */
export function montarGrades(
  materias,
  preferencias = {},
  {
    quantidade = materias.length,
    limite = 20,
    maxNos = 2_000_000,
    tempoMaxMs = Infinity,
    creditoMax = CREDIT_MAX
  } = {}
) {
  const pesos = preferencias.pesos || PESOS_PADRAO;
  // Menos turmas primeiro: o conflito aparece cedo e corta a árvore mais perto da raiz.
  const ordenadas = materias
    .map(materia => prepararMateria(materia, preferencias))
    .filter(item => item.turmas.length > 0)
    .sort((a, b) => a.turmas.length - b.turmas.length);
  const alvo = Math.min(quantidade, ordenadas.length);
  const opcionais = alvo < ordenadas.length;

  const restoMinimo = new Array(ordenadas.length + 1).fill(0);
  for (let indice = ordenadas.length - 1; indice >= 0; indice--) {
    restoMinimo[indice] = restoMinimo[indice + 1] + ordenadas[indice].custoMinimo;
  }
  // Com opcionais: soma dos k menores custos mínimos dali pra frente.
  const minimoDosRestantes = (indice, faltam) => {
    if (faltam <= 0) return 0;
    if (!opcionais) return restoMinimo[indice];
    return ordenadas.slice(indice).map(item => item.custoMinimo).sort((a, b) => a - b)
      .slice(0, faltam).reduce((total, custo) => total + custo, 0);
  };

  const inicio = agora();
  const melhores = [];
  const stats = { nos: 0, completas: 0, podadas: 0, interrompido: false, ms: 0 };
  const pior = () => (melhores.length < limite ? Infinity : melhores[melhores.length - 1].avaliacao.pontos);

  const ocupadas = new Set();
  const usoPorDia = new Map();
  const grade = {};

  const registrar = () => {
    stats.completas += 1;
    const slots = [...ocupadas];
    for (const entrada of Object.values(grade)) {
      if (entrada.anp && entrada.anpHour != null) slots.push(slot(SATURDAY_INDEX, entrada.anpHour));
    }
    const avaliacao = avaliarSlots(slots, preferencias);
    if (avaliacao.pontos >= pior()) return;
    const item = { grade: { ...grade }, avaliacao };
    const indice = melhores.findIndex(outro => outro.avaliacao.pontos > avaliacao.pontos);
    if (indice === -1) melhores.push(item);
    else melhores.splice(indice, 0, item);
    if (melhores.length > limite) melhores.pop();
  };

  const visitar = (indice, escolhidas, creditos, custo) => {
    if (stats.interrompido) return;
    if (stats.nos >= maxNos || ((stats.nos & 1023) === 0 && agora() - inicio > tempoMaxMs)) {
      stats.interrompido = true;
      return;
    }
    stats.nos += 1;
    if (escolhidas === alvo) {
      registrar();
      return;
    }
    if (indice >= ordenadas.length || escolhidas + (ordenadas.length - indice) < alvo) return;
    const limiteInferior = custo
      + (preferencias.menosDias ? usoPorDia.size * pesos.dia : 0)
      + minimoDosRestantes(indice, alvo - escolhidas);
    if (limiteInferior >= pior()) {
      stats.podadas += 1;
      return;
    }

    const { materia, turmas } = ordenadas[indice];
    const novosCreditos = creditos + Number(materia.creditos || 0);
    if (novosCreditos <= creditoMax) {
      for (const turma of turmas) {
        if (turma.slots.some(valor => ocupadas.has(valor))) continue;
        let entrada = turma.entrada;
        if (turma.anp) {
          const hora = findNextAnpHour(grade);
          if (hora == null) continue;
          entrada = comHorarioAnp(entrada, hora);
        }
        grade[materia.codigo] = entrada;
        turma.slots.forEach(valor => ocupadas.add(valor));
        turma.dias.forEach(dia => usoPorDia.set(dia, (usoPorDia.get(dia) || 0) + 1));

        visitar(indice + 1, escolhidas + 1, novosCreditos, custo + turma.custo);

        turma.dias.forEach(dia => {
          const uso = usoPorDia.get(dia) - 1;
          if (uso === 0) usoPorDia.delete(dia);
          else usoPorDia.set(dia, uso);
        });
        turma.slots.forEach(valor => ocupadas.delete(valor));
        delete grade[materia.codigo];
        if (stats.interrompido) return;
      }
    }
    // Pular esta matéria só faz sentido quando nem todas são obrigatórias.
    if (opcionais) visitar(indice + 1, escolhidas, creditos, custo);
  };

  visitar(0, 0, 0, 0);
  stats.ms = agora() - inicio;
  return { opcoes: melhores, stats };
}
