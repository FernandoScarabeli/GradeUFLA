import {
  nomesDoProfessor,
  professorDaMateriaQueCasa,
  professoresDasMaterias,
  professorQueCasa,
  turmaDoProfessor
} from './professores';

const web = {
  codigo: 'NOR201',
  nome: 'Programação Web',
  turmas: [
    { id: 'A', professor: 'ALEXANDRE ALVES DE CARVALHO' },
    { id: 'B', professor: 'JOÃO DA SILVA / ANA SOUZA' },
    { id: 'C' }
  ]
};
const bd = { codigo: 'CON202', nome: 'Banco de Dados', turmas: [{ id: 'A', professor: 'ana souza' }] };

test('separa e formata vários professores na mesma turma', () => {
  expect(nomesDoProfessor('JOÃO DA SILVA / ANA SOUZA')).toEqual(['João da Silva', 'Ana Souza']);
  expect(nomesDoProfessor(null)).toEqual([]);
});

test('lista os professores sem repetir, em ordem alfabética', () => {
  expect(professoresDasMaterias([web, bd])).toEqual([
    'Alexandre Alves de Carvalho',
    'Ana Souza',
    'João da Silva'
  ]);
  expect(professoresDasMaterias([{ turmas: [{ id: 'A' }] }])).toEqual([]);
  expect(professoresDasMaterias(undefined)).toEqual([]);
});

test('casa parte do nome sem acento nem maiúscula', () => {
  expect(professorQueCasa(web.turmas[1], 'joao')).toBe('João da Silva');
  expect(turmaDoProfessor(web.turmas[0], 'Alexandre')).toBe(true);
  expect(turmaDoProfessor(web.turmas[0], 'souza')).toBe(false);
  expect(turmaDoProfessor(web.turmas[2], 'souza')).toBe(false);
  expect(turmaDoProfessor(web.turmas[0], '  ')).toBe(false);
  expect(professorDaMateriaQueCasa(web, 'SOUZA')).toBe('Ana Souza');
  expect(professorDaMateriaQueCasa(bd, 'carvalho')).toBeNull();
});
