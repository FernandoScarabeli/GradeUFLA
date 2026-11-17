import { comHorarioAnp } from './gradeRules';
import {
  calcularHorariosEmComum,
  horasOcupadas,
  resumirLivres,
  trechosOcupadosDoDia
} from './horariosEmComum';

const materia = (codigo, horarios) => ({ codigo, nome: codigo, turmaId: 'A', horarios });

const eu = {
  id: 'voce',
  grade: { WEB: materia('WEB', [{ dia: 1, inicio: 8, fim: 10 }, { dia: 3, inicio: 8, fim: 10 }]) }
};
const ana = {
  id: 'ana',
  grade: { BD: materia('BD', [{ dia: 1, inicio: 9, fim: 12 }]) }
};

test('horasOcupadas usa a malha de horas cheias e conta o sábado do ANP', () => {
  const anp = comHorarioAnp({ codigo: 'ANP', turmaId: 'ANP', anp: true, horarios: [] }, 14);
  expect([...horasOcupadas({ WEB: eu.grade.WEB, ANP: anp })].sort()).toEqual(['1:8', '1:9', '3:8', '3:9', '6:14']);
  expect(horasOcupadas(undefined).size).toBe(0);
});

test('interseção: livre só quando ninguém tem aula, e mostra quem ocupa', () => {
  const { celulas, livres } = calcularHorariosEmComum([eu, ana], { dias: [1, 2], inicio: 7, fim: 14 });
  expect(celulas['1:8']).toEqual(['voce']);
  expect(celulas['1:9']).toEqual(['voce', 'ana']);
  expect(celulas['1:11']).toEqual(['ana']);
  expect(livres).toEqual([
    { dia: 1, inicio: 7, fim: 8 },
    { dia: 1, inicio: 12, fim: 14 },
    { dia: 2, inicio: 7, fim: 14 }
  ]);
});

test('uma pessoa só ou ninguém: tudo o que ela não ocupa é livre', () => {
  expect(calcularHorariosEmComum([], { dias: [1], inicio: 7, fim: 9 }).livres).toEqual([{ dia: 1, inicio: 7, fim: 9 }]);
  expect(calcularHorariosEmComum([eu], { dias: [3], inicio: 7, fim: 11 }).livres).toEqual([
    { dia: 3, inicio: 7, fim: 8 },
    { dia: 3, inicio: 10, fim: 11 }
  ]);
});

test('trechos ocupados agrupam horas seguidas com as mesmas pessoas', () => {
  const { celulas } = calcularHorariosEmComum([eu, ana]);
  expect(trechosOcupadosDoDia(celulas, 1)).toEqual([
    { dia: 1, inicio: 8, fim: 9, ocupados: ['voce'] },
    { dia: 1, inicio: 9, fim: 10, ocupados: ['voce', 'ana'] },
    { dia: 1, inicio: 10, fim: 12, ocupados: ['ana'] }
  ]);
});

test('resumo em texto por dia', () => {
  const { livres } = calcularHorariosEmComum([eu, ana], { dias: [1, 3], inicio: 7, fim: 13 });
  expect(resumirLivres(livres, [1, 2, 3])).toEqual([
    { dia: 1, nome: 'Seg', texto: '7h–8h, 12h–13h' },
    { dia: 3, nome: 'Qua', texto: '7h–8h, 10h–13h' }
  ]);
});
