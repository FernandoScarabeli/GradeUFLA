import Papa from 'papaparse';

const CSV_DATA_VERSION = import.meta.env.VITE_CSV_VERSION || '2026-07-28';

const versionCsvPath = path => {
  if (!path.startsWith('/data/')) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}v=${encodeURIComponent(CSV_DATA_VERSION)}`;
};

/**
 * Converte o dia do CSV (convenção da UFLA: 1=Dom, 2=Seg ... 7=Sáb) para o
 * índice usado no app (0=Dom ... 6=Sáb). É o ÚNICO ponto de conversão: o
 * restante do código (gradeRules) recebe sempre 0..6.
 */
export function diaUflaParaIndice(valor) {
  const numero = Number(valor);
  if (Number.isNaN(numero)) return valor;
  if (numero >= 1 && numero <= 7) return numero - 1;
  return numero;
}

class CsvFetchError extends Error {
  constructor(path, status) {
    super(`Falha ao buscar ${path} (${status})`);
    this.name = 'CsvFetchError';
    this.status = status;
  }
}

const formatParseError = (path, parseError) => {
  const line = Number.isInteger(parseError?.row) ? ` na linha ${parseError.row + 2}` : '';
  const detail = parseError?.message ? `: ${parseError.message}` : '';
  return new Error(`CSV inválido em ${path}${line}${detail}`);
};

// Busca um CSV em public/data e faz o parse
export function loadCsv(path) {
  return fetch(versionCsvPath(path))
    .then(res => {
      if (!res.ok) throw new CsvFetchError(path, res.status);
      return res.text();
    })
    .then(text => new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          if (res.errors?.length) {
            reject(formatParseError(path, res.errors[0]));
            return;
          }
          resolve(res.data);
        },
        error: (err) => reject(err)
      });
    }));
}

// Converte "Forte: A, B; Minimo: C; Co-requisito: D" em objeto estruturado
function parsePreRequisitosString(preField) {
  const result = { forte: [], minimo: [], coreq: [] };
  if (!preField) return result;
  const s = preField.toString().trim();
  if (!s) return result;

  // Separa os grupos rotulados por ponto e vírgula ou quebra de linha
  const parts = s.split(/[;\n]+/).map(p => p.trim()).filter(Boolean);
  const hasLabel = /\bForte\b|\bMinimo\b|\bCo-?requisito\b/i.test(s);

  if (!hasLabel) {
    // Sem rótulo: separa por vírgula, barra ou pipe e trata tudo como forte
    const items = s.split(new RegExp('[,|/]+')).map(x => x.trim()).filter(Boolean);
    result.forte = items;
    return result;
  }

  parts.forEach(part => {
    let m;
    if ((m = part.match(/Forte\s*:\s*(.*)/i))) {
      const list = m[1].split(/[;,]+/).map(x => x.trim()).filter(Boolean);
      result.forte.push(...list);
    } else if ((m = part.match(/Minimo\s*:\s*(.*)/i))) {
      const list = m[1].split(/[;,]+/).map(x => x.trim()).filter(Boolean);
      result.minimo.push(...list);
    } else if ((m = part.match(/Co-?requisito\s*:\s*(.*)/i))) {
      const list = m[1].split(/[;,]+/).map(x => x.trim()).filter(Boolean);
      result.coreq.push(...list);
    } else {
      // Fragmento sem rótulo é tratado como forte
      const list = part.split(/[;,]+/).map(x => x.trim()).filter(Boolean);
      result.forte.push(...list);
    }
  });

  // Normaliza os códigos (remove pontuação e espaços)
  ['forte', 'minimo', 'coreq'].forEach(k => {
    result[k] = result[k].map(code => (code || '').toString().replace(/[^A-Za-z0-9_-]/g, '').toUpperCase()).filter(Boolean);
  });

  return result;
}

async function tryLoad(paths) {
  for (const p of paths) {
    try {
      const rows = await loadCsv(p);
      if (rows && rows.length) return rows;
    } catch (e) {
      // Só tenta o próximo nome se o arquivo anterior não existir (404).
      // Erros de parse, permissão e rede precisam chegar à interface.
      if (!(e instanceof CsvFetchError) || e.status !== 404) throw e;
    }
  }
  throw new Error('Nenhum dos CSVs foi encontrado: ' + paths.join(', '));
}

const assertRequired = (value, { entity, field, rowIndex }) => {
  if (value !== undefined && value !== null && String(value).trim() !== '') return;
  throw new Error(`CSV inválido: linha ${rowIndex + 2} de ${entity} sem ${field}.`);
};

export async function loadCursos() {
  // Tenta os nomes de arquivo conhecidos
  const paths = ['/data/courses.csv', '/data/cursos.csv', '/data/example_cursos.csv'];
  const rows = await tryLoad(paths);

  const normalizeMatriz = (m) => {
    if (!m) return '';
    const s = String(m).trim();
    const mMatch = s.match(/(\d{4})\D*(\d{1,2})/);
    if (mMatch) return `${mMatch[1]}/${String(mMatch[2]).padStart(2, '0')}`;
    return s;
  };

  // Agrupa os cursos por id
  const map = new Map();
  rows.forEach((r, rowIndex) => {
    const id = (r.curso_id || r.id || r.curso || '').toString().trim();
    const nome = (r.nome || r.name || '').toString().trim();
    const matrizRaw = (r.matriz || r.matrix || r.matriz_curricular || '').toString().trim();
    const matriz = normalizeMatriz(matrizRaw);
    assertRequired(id, { entity: 'cursos', field: 'identificador', rowIndex });
    assertRequired(nome, { entity: 'cursos', field: 'nome', rowIndex });
    assertRequired(matriz, { entity: 'cursos', field: 'matriz', rowIndex });
    if (!map.has(id)) {
      map.set(id, {
        id,
        nome: nome || id,
        // Campos opcionais
        tipo: r.tipo || r.type || 'Bacharelado',
        // totalSemestres é recalculado depois a partir das disciplinas
        totalSemestres: 8, // fallback value
        // Sem a coluna, o curso é considerado implementado
        implementado: (r.implementado || 'true').toString().toLowerCase() === 'true',
        // Matrizes encontradas para o curso
        _matrizesSet: new Set()
      });
    }
    if (matriz) map.get(id)._matrizesSet.add(matriz);
  });

  // Converte os Sets em arrays
  const result = Array.from(map.values()).map(entry => {
    const matrizesArr = Array.from(entry._matrizesSet || []).filter(Boolean);
    // Ordena as matrizes da mais recente para a mais antiga
    matrizesArr.sort((a,b) => {
      const ma = String(a).match(/(\d{4})\D*(\d{1,2})/);
      const mb = String(b).match(/(\d{4})\D*(\d{1,2})/);
      if (ma && mb) return (Number(mb[1])*100 + Number(mb[2])) - (Number(ma[1])*100 + Number(ma[2]));
      return String(b).localeCompare(String(a));
    });
    const { _matrizesSet, ...rest } = entry;
    return { ...rest, matrizes: matrizesArr };
  });

  return result;
}

// Calcula o total de semestres de cada curso/matriz a partir das disciplinas
export function computeTotalSemestres(cursos, materias) {
  // Agrupa as matérias por curso + matriz
  const matrizSemestresMap = new Map(); // key: "cursoId|matriz" -> max semestre found

  materias.forEach(m => {
    if (!m.curso || !m.matriz || m.tipo !== 'obrigatoria') return;
    if (m.semestre == null || String(m.semestre).toLowerCase() === 'indefinido') return;

    const semestreNum = Number(m.semestre);
    if (isNaN(semestreNum) || semestreNum <= 0) return;

    const key = `${m.curso}|${m.matriz}`;
    const current = matrizSemestresMap.get(key) || 0;
    if (semestreNum > current) {
      matrizSemestresMap.set(key, semestreNum);
    }
  });

  // Guarda o total por matriz, não só o da mais recente
  cursos.forEach(curso => {
    if (!curso.matrizes || curso.matrizes.length === 0) return;

    // Total de semestres por matriz
    if (!curso.totalSemestresPorMatriz) {
      curso.totalSemestresPorMatriz = {};
    }

    curso.matrizes.forEach(matrizId => {
      const key = `${curso.id}|${matrizId}`;
      const computed = matrizSemestresMap.get(key);
      if (computed && computed > 0) {
        curso.totalSemestresPorMatriz[matrizId] = computed;
      } else {
        curso.totalSemestresPorMatriz[matrizId] = 8; // fallback
      }
    });

    // totalSemestres do curso = o da matriz mais recente
    const mainMatriz = curso.matrizes[0];
    const mainKey = `${curso.id}|${mainMatriz}`;
    const mainComputed = matrizSemestresMap.get(mainKey);
    curso.totalSemestres = mainComputed && mainComputed > 0 ? mainComputed : 8;
  });

  return cursos;
}

export async function loadMaterias() {
  // Tenta nomes de arquivo em inglês e português
  const paths = ['/data/subjects.csv', '/data/materias.csv', '/data/example_materias.csv'];
  const rows = await tryLoad(paths);

  return rows.map((r, rowIndex) => {
    // Aceita variações de nome de coluna (curso_id / course_id ...)
    const cursoRaw = (r.curso_id || r.course_id || r.curso || r.course || '').toString().trim() || undefined;
    const curso = cursoRaw ? cursoRaw.toString().trim() : undefined;
    const matrizRaw = (r.matriz || r.matrix || '').toString().trim() || undefined;
    const normalizeMatriz = (m) => {
      if (!m) return undefined;
      const mm = String(m).trim();
      const mMatch = mm.match(/(\d{4})\D*(\d{1,2})/);
      if (mMatch) return `${mMatch[1]}/${String(mMatch[2]).padStart(2,'0')}`;
      return mm;
    };
    const matriz = normalizeMatriz(matrizRaw);
    let semestreRaw = r.semestre || r.semester || r.period || '';
    semestreRaw = typeof semestreRaw === 'string' ? semestreRaw.trim() : semestreRaw;
    // Mantém como texto quando não é numérico
    const semestre = semestreRaw === '' ? undefined : (isNaN(Number(semestreRaw)) ? semestreRaw : Number(semestreRaw));

    const codigo = (r.codigo || r.code || '').toString().trim();
    const nome = (r.nome || r.name || '').toString().trim();
    const creditos = Number(r.creditos || r.credits || 0) || 0;
    const tipo = (r.tipo || r.type || 'obrigatoria').toString().trim();
    const subgrupo = (r.subgrupo || r.subgroup || '').toString().trim() || undefined;

    assertRequired(curso, { entity: 'disciplinas', field: 'curso', rowIndex });
    assertRequired(matriz, { entity: 'disciplinas', field: 'matriz', rowIndex });
    assertRequired(semestre, { entity: 'disciplinas', field: 'semestre', rowIndex });
    assertRequired(codigo, { entity: 'disciplinas', field: 'código', rowIndex });
    assertRequired(nome, { entity: 'disciplinas', field: 'nome', rowIndex });

    // preRequisitos vem como texto rotulado no CSV
    const preField = r.preRequisitos || r.prerequisitos || r.prereqs || r.requisitos || '';
    const preDetalhado = parsePreRequisitosString(preField);
    // Lista plana usada por consumidores antigos
    const preFlat = [...new Set([...(preDetalhado.forte || []), ...(preDetalhado.minimo || []), ...(preDetalhado.coreq || [])])];

    // turmas vem como JSON na célula; há também uma notação simples de fallback
    let turmas = [];
    const turmasField = r.turmas || r.turmas_json || r.classes || '';
    if (turmasField) {
      try {
        // Remove aspas externas, se houver
        const raw = typeof turmasField === 'string' ? turmasField.trim().replace(/^"|"$/g, '') : turmasField;
        turmas = JSON.parse(raw);
        // Normaliza dia para 0..6 e horários "08:00" para número
        if (Array.isArray(turmas)) {
          turmas.forEach(t => {
            if (t && Array.isArray(t.horarios)) {
              t.horarios.forEach(h => {
                if (!h || h.dia == null) return;
                h.dia = diaUflaParaIndice(h.dia);

                if (typeof h.inicio === 'string') {
                  const m = h.inicio.match(/^(\d{1,2})(?::(\d{2}))?/);
                  if (m) h.inicio = parseInt(m[1], 10);
                }
                if (typeof h.fim === 'string') {
                  const m2 = h.fim.match(/^(\d{1,2})(?::(\d{2}))?/);
                  if (m2) h.fim = parseInt(m2[1], 10);
                }
              });
            }
          });
        }
      } catch (e) {
        // Não é JSON: tenta a notação "id:10A|horarios:3-8,5-8,7-9;anp:false"
        const raw = (typeof turmasField === 'string' ? turmasField.trim() : '');
        if (raw.startsWith('[') || raw.startsWith('{')) {
          throw new Error(`CSV inválido: linha ${rowIndex + 2} de disciplinas com JSON de turmas inválido.`);
        }
        if (raw) {
          const items = raw.split(/\s*;\s*/).filter(Boolean);
          turmas = items.map(it => {
            const obj = { id: null, horarios: [], anp: false };
            const parts = it.split(/\s*\|\s*/).filter(Boolean);
            parts.forEach(p => {
              const [k, v] = p.split(/\s*:\s*/);
              if (!k) return;
              const key = k.toLowerCase().trim();
              if (key === 'id') obj.id = v;
              else if (key === 'anp') obj.anp = String(v).toLowerCase() === 'true';
              else if (key === 'horarios') {
                const hs = v.split(/\s*,\s*/).filter(Boolean);
                hs.forEach(hsItem => {
                  const mm = hsItem.match(/(\d)\s*-\s*(\d+)/);
                  if (mm) {
                    const inicio = Number(mm[2]);
                    obj.horarios.push({ dia: diaUflaParaIndice(mm[1]), inicio, fim: inicio + 1 });
                  }
                });
              }
            });
            return obj;
          });
        } else {
          turmas = [];
        }
      }
    }

    return {
      curso,
      matriz,
      semestre,
      codigo,
      nome,
      creditos,
      tipo,
      subgrupo,
      preRequisitos: preFlat,
      preRequisitosDetalhada: preDetalhado,
      turmas
    };
  });
}
