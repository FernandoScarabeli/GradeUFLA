// Horários livres em comum entre a sua grade e as de amigos (vindas de links #g=).
// Usa a mesma malha de horas cheias da grade; ANP no sábado conta como ocupado.

import { buildCalendarOccupancy } from '../components/Calendar/useCalendarDrag';
import { DIAS_SEMANA } from './gradeRules';

export const DIAS_COMUM = [1, 2, 3, 4, 5, 6];
export const HORA_INICIO_COMUM = 7;
export const HORA_FIM_COMUM = 23;

/** Conjunto "dia:hora" das horas ocupadas por uma grade. */
export function horasOcupadas(grade) {
  return new Set(buildCalendarOccupancy(grade || {}).keys());
}

/**
 * pessoas: [{ id, grade }]
 * -> { celulas: { "dia:hora": [ids ocupados] }, livres: [{ dia, inicio, fim }] }
 * `livres` junta horas seguidas em que ninguém tem aula.
 */
export function calcularHorariosEmComum(
  pessoas,
  { dias = DIAS_COMUM, inicio = HORA_INICIO_COMUM, fim = HORA_FIM_COMUM } = {}
) {
  const ocupacoes = (pessoas || []).map(pessoa => ({ id: pessoa.id, horas: horasOcupadas(pessoa.grade) }));
  const celulas = {};
  const livres = [];

  for (const dia of dias) {
    let atual = null;
    for (let hora = inicio; hora < fim; hora++) {
      const chave = `${dia}:${hora}`;
      const ocupados = ocupacoes.filter(pessoa => pessoa.horas.has(chave)).map(pessoa => pessoa.id);
      celulas[chave] = ocupados;
      if (ocupados.length > 0) {
        atual = null;
      } else if (atual) {
        atual.fim = hora + 1;
      } else {
        atual = { dia, inicio: hora, fim: hora + 1 };
        livres.push(atual);
      }
    }
  }

  return { celulas, livres };
}

/** Trechos seguidos de um dia com o mesmo grupo de pessoas ocupadas (pra lista do celular). */
export function trechosOcupadosDoDia(celulas, dia, { inicio = HORA_INICIO_COMUM, fim = HORA_FIM_COMUM } = {}) {
  const trechos = [];
  let atual = null;
  for (let hora = inicio; hora < fim; hora++) {
    const ocupados = celulas[`${dia}:${hora}`] || [];
    const assinatura = ocupados.join('|');
    if (ocupados.length === 0) {
      atual = null;
    } else if (atual && atual.assinatura === assinatura) {
      atual.fim = hora + 1;
    } else {
      atual = { dia, inicio: hora, fim: hora + 1, ocupados, assinatura };
      trechos.push(atual);
    }
  }
  return trechos.map(({ assinatura: _assinatura, ...trecho }) => trecho);
}

export const formatarTrecho = ({ inicio, fim }) => `${inicio}h–${fim}h`;

/** [{ dia, texto: "14h–16h, 18h–23h" }] só com os dias que têm horário livre. */
export function resumirLivres(livres, dias = DIAS_COMUM) {
  return dias
    .map(dia => ({
      dia,
      nome: DIAS_SEMANA[dia],
      texto: livres.filter(livre => livre.dia === dia).map(formatarTrecho).join(', ')
    }))
    .filter(item => item.texto);
}
