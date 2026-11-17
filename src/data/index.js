// Carregador central: lê os CSVs de /public/data (sem fallback para dados mockados)

import { useSyncExternalStore } from 'react';
import { loadCursos, loadMaterias, computeTotalSemestres } from './csvLoader';
export {
  getPendenciasPrerequisito,
  verificarPreRequisitos,
  verificarPreRequisitosDetalhada
} from '../domain/gradeRules';

let csvCursos = null;
let csvDadosPorCurso = null;
let csvNomesMaterias = null;
let csvData = null;
let csvLoadPromise = null;
let csvLoadState = { status: 'idle', error: null };
const csvLoadListeners = new Set();

const setCsvLoadState = (status, error = null) => {
  csvLoadState = { status, error };
  csvLoadListeners.forEach(listener => listener(csvLoadState));
};

export const getCsvLoadState = () => csvLoadState;

export const subscribeCsvLoadState = listener => {
  csvLoadListeners.add(listener);
  return () => csvLoadListeners.delete(listener);
};

/** Hook React que acompanha o estado da carga dos CSVs (idle/loading/success/error). */
export const useCsvLoadState = () =>
  useSyncExternalStore(subscribeCsvLoadState, getCsvLoadState, getCsvLoadState);

function buildDadosPorCurso(cursos, materiasRows) {
  const dadosPorCurso = {};
  if (Array.isArray(cursos)) {
    cursos.forEach(c => {
      if (c && c.id) {
        dadosPorCurso[c.id] = { matrizes: {}, eletivas: [] };
      }
    });
  }

  materiasRows.forEach(m => {
    const cursoKey = m.curso;
    if (!cursoKey) return;

    const matrizKey = m.matriz || 'default';
    dadosPorCurso[cursoKey] = dadosPorCurso[cursoKey] || { matrizes: {}, eletivas: [] };
    dadosPorCurso[cursoKey].matrizes[matrizKey] = dadosPorCurso[cursoKey].matrizes[matrizKey] || { materiasPorSemestre: {}, eletivas: [] };

    if (m.tipo === 'eletiva') {
      dadosPorCurso[cursoKey].matrizes[matrizKey].eletivas.push(m);
      dadosPorCurso[cursoKey].eletivas.push(m);
    } else {
      const sem = String(m.semestre || '0');
      const target = dadosPorCurso[cursoKey].matrizes[matrizKey].materiasPorSemestre;
      target[sem] = target[sem] || [];
      target[sem].push(m);
    }
  });

  return dadosPorCurso;
}

function buildNomesMaterias(materiasRows) {
  const nomes = new Map();
  materiasRows.forEach(materia => {
    const nome = materia?.nome;
    if (!nome) return;

    [materia.codigo, materia.id].forEach(identificador => {
      if (identificador === undefined || identificador === null) return;
      const chave = String(identificador);
      if (!nomes.has(chave)) nomes.set(chave, nome);
    });
  });
  return nomes;
}

export function ensureCsvLoaded() {
  if (csvLoadState.status === 'success' && csvData) {
    return Promise.resolve(csvData);
  }
  if (csvLoadState.status === 'loading' && csvLoadPromise) {
    return csvLoadPromise;
  }
  if (csvLoadState.status === 'error') {
    return Promise.reject(csvLoadState.error);
  }

  setCsvLoadState('loading');
  csvLoadPromise = (async () => {
    try {
      const [cursosCarregados, materiasRows] = await Promise.all([loadCursos(), loadMaterias()]);

      // Calcula o total de semestres de cada matriz a partir das disciplinas
      const cursos = computeTotalSemestres(cursosCarregados, materiasRows);
      const dadosPorCurso = buildDadosPorCurso(cursos, materiasRows);
      const nomesMaterias = buildNomesMaterias(materiasRows);

      csvCursos = cursos;
      csvDadosPorCurso = dadosPorCurso;
      csvNomesMaterias = nomesMaterias;
      csvData = { cursos, dadosPorCurso };

      if (import.meta.env.DEV && typeof window !== 'undefined') {
        // Expostos apenas em desenvolvimento para depuração no console
        window.__csvCursos = csvCursos;
        window.__csvDadosPorCurso = csvDadosPorCurso;
      }

      setCsvLoadState('success');
      return csvData;
    } catch (error) {
      csvCursos = null;
      csvDadosPorCurso = null;
      csvNomesMaterias = null;
      csvData = null;
      csvLoadPromise = null;
      setCsvLoadState('error', error);
      throw error;
    }
  })();

  return csvLoadPromise;
}

export function retryCsvLoad() {
  if (csvLoadState.status === 'loading') return csvLoadPromise;
  if (csvLoadState.status !== 'error') return ensureCsvLoaded();

  csvCursos = null;
  csvDadosPorCurso = null;
  csvNomesMaterias = null;
  csvData = null;
  csvLoadPromise = null;
  setCsvLoadState('idle');
  return ensureCsvLoaded();
}

// Consultas sobre os dados carregados

// Informações do curso
export const getCursoInfo = (cursoId) => {
  if (!csvCursos) return null;
  return (csvCursos || []).find(c => c.id === cursoId) || null;
};

// Total de semestres de uma combinação curso/matriz
export const getTotalSemestres = (cursoId, matrizId) => {
  if (!csvCursos || !cursoId) return 8; // fallback
  const curso = csvCursos.find(c => c.id === cursoId);
  if (!curso) return 8;

  // Sem matriz: usa a mais recente
  if (!matrizId) return curso.totalSemestres || 8;

  // Valor específico da matriz, quando existir
  if (curso.totalSemestresPorMatriz && curso.totalSemestresPorMatriz[matrizId]) {
    return curso.totalSemestresPorMatriz[matrizId];
  }

  // Valor padrão
  return curso.totalSemestres || 8;
};

// Matérias por semestre; retorna [] quando os dados não estão disponíveis
export function getMateriasPorSemestre(cursoId, semestre, matrizId) {
  if (!csvDadosPorCurso) return [];
  const dados = csvDadosPorCurso;
  const cursoKey = cursoId || Object.keys(dados)[0];
  if (!cursoKey || !dados[cursoKey]) return [];

  const matrizes = dados[cursoKey].matrizes || {};
  const matrizKey = matrizId || Object.keys(matrizes)[0] || 'default';
  const materiasPorSemestre = (matrizes[matrizKey] && matrizes[matrizKey].materiasPorSemestre) || {};

  if (typeof semestre !== 'undefined' && semestre !== null) {
    return materiasPorSemestre[String(semestre)] || [];
  }
  return materiasPorSemestre;
}

export function getEletivas(cursoId, matrizId) {
  if (!csvDadosPorCurso) return [];
  const dados = csvDadosPorCurso;
  const cursoKey = cursoId || Object.keys(dados)[0];
  if (!cursoKey || !dados[cursoKey]) return [];
  const matrizes = dados[cursoKey].matrizes || {};
  const matrizKey = matrizId || Object.keys(matrizes)[0] || 'default';
  return (matrizes[matrizKey] && matrizes[matrizKey].eletivas) || [];
}

export function getHorariosPorDisciplina(disciplinaCodigo) {
  if (!csvDadosPorCurso) return [];
  const dados = csvDadosPorCurso;
  for (const cursoKey of Object.keys(dados)) {
    const cursoObj = dados[cursoKey];
    const matrizes = cursoObj.matrizes || {};
    for (const matrizKey of Object.keys(matrizes)) {
      const materiasMap = matrizes[matrizKey].materiasPorSemestre || {};
      for (const sem of Object.keys(materiasMap)) {
        const list = materiasMap[sem] || [];
        const found = list.find(m => m.codigo === disciplinaCodigo || String(m.id) === String(disciplinaCodigo));
        if (found) {
          const horarios = [];
          (found.turmas || []).forEach(t => {
            (t.horarios || []).forEach(h => {
              horarios.push({ ...h, turma: t.id || t.turma || 'A', docente: t.docente || null, disciplinaCodigo: found.codigo, disciplinaNome: found.nome });
            });
          });
          return horarios;
        }
      }
    }
  }
  return [];
}

export function getCursos() {
  if (!csvCursos) return [];
  const list = csvCursos;
  if (!Array.isArray(list)) return [];
  return list.slice().sort((a, b) => {
    const extract = s => {
      if (!s || !s.id) return Number.POSITIVE_INFINITY;
      const m = String(s.id).match(/\d+/);
      return m ? Number(m[0]) : Number.POSITIVE_INFINITY;
    };
    const na = extract(a);
    const nb = extract(b);
    if (na !== nb) return na - nb;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

export function getMatrizesByCurso(cursoId) {
  if (csvCursos && Array.isArray(csvCursos)) {
    const curso = csvCursos.find(c => c.id === cursoId);
    if (curso && Array.isArray(curso.matrizes) && curso.matrizes.length > 0) {
      const keys = curso.matrizes.slice().sort((a, b) => String(b).localeCompare(String(a)));
      return keys.map(k => ({ id: k, nome: k }));
    }
  }

  if (csvDadosPorCurso && csvDadosPorCurso[cursoId]) {
    const matrizesObj = csvDadosPorCurso[cursoId].matrizes || {};
    const keys = Object.keys(matrizesObj);
    if (keys.length > 0) {
      // Converte chaves como 2019/01 em número para ordenar
      const parseKey = (k) => {
        if (!k) return null;
        const m = String(k).match(/(\d{4})\D*(\d{1,2})/);
        if (m) return Number(m[1]) * 100 + Number(m[2]);
        const num = Number(String(k).replace(/\D/g, ''));
        return isNaN(num) ? null : num;
      };

      keys.sort((a, b) => {
        const pa = parseKey(a);
        const pb = parseKey(b);
        if (pa != null && pb != null) return pb - pa;
        if (pa != null) return -1;
        if (pb != null) return 1;
        return String(b).localeCompare(String(a));
      });

      return keys.map(k => ({ id: k, nome: k }));
    }
  }

  return [];
}

export function getCursosImplementados() {
  if (!csvCursos) return [];
  const list = csvCursos;
  return list.filter(c => c.implementado !== false);
}

export function buscarCursos(termo) {
  if (!csvCursos) return [];
  const list = csvCursos;
  const t = termo.toString().toLowerCase();
  return list.filter(c => (c.nome || '').toString().toLowerCase().includes(t) || (c.id || '').toString().toLowerCase().includes(t));
}

export function getNomeMateria(codigo) {
  if (!csvNomesMaterias || codigo === undefined || codigo === null) return null;
  return csvNomesMaterias.get(String(codigo)) || null;
}

/** Nome da matéria para exibição; usa o próprio código quando o nome não é conhecido. */
export function getNomeMateriaOuCodigo(codigo) {
  return getNomeMateria(codigo) || String(codigo ?? '');
}
