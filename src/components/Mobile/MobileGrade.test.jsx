import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import MobileGrade from './MobileGrade';

const semCoreq = { forte: [], minimo: [], coreq: [] };
const banco = {
  codigo: 'BD1',
  nome: 'Banco de Dados',
  semestre: 3,
  creditos: 4,
  tipo: 'obrigatoria',
  preRequisitosDetalhada: semCoreq,
  turmas: [{ id: 'A', horarios: [{ dia: 1, inicio: 8, fim: 10 }], anp: false }]
};
const engenharia = {
  codigo: 'ES1',
  nome: 'Engenharia de Software',
  semestre: 3,
  creditos: 4,
  tipo: 'obrigatoria',
  preRequisitosDetalhada: { forte: [], minimo: [], coreq: ['BD1'] },
  turmas: [
    { id: 'A', horarios: [{ dia: 2, inicio: 8, fim: 10 }], anp: false },
    { id: 'B', horarios: [{ dia: 1, inicio: 9, fim: 11 }], anp: false }
  ]
};
const avancada = {
  codigo: 'AV1',
  nome: 'Matéria Avançada',
  semestre: 3,
  creditos: 4,
  tipo: 'obrigatoria',
  preRequisitosDetalhada: { forte: [], minimo: ['PRE'], coreq: [] },
  turmas: [{ id: 'A', horarios: [{ dia: 5, inicio: 8, fim: 10 }], anp: false }]
};

function Harness({ inicial = {}, spies }) {
  const [calendario, setCalendario] = useState(inicial);
  const [confirmados, setConfirmados] = useState([]);
  return (
    <MobileGrade
      cursoSelecionado="G014"
      semestreAtual={3}
      materiasPorSemestre={{ 3: [banco, engenharia, avancada] }}
      eletivas={[]}
      materiasAprovadas={[]}
      materiasNoCalendario={calendario}
      minimoConfirmados={confirmados}
      onAddMateria={materia => {
        spies.add(materia);
        setCalendario(atual => ({ ...atual, [materia.codigo]: materia }));
        return true;
      }}
      onRemoveMateria={(codigo, opcoes) => {
        spies.remove(codigo, opcoes);
        setCalendario(atual => {
          const novo = { ...atual };
          delete novo[codigo];
          Object.keys(novo).forEach(c => {
            if (novo[c].preRequisitosDetalhada?.coreq?.includes(codigo)) delete novo[c];
          });
          return novo;
        });
      }}
      onRestaurar={snapshot => setCalendario(snapshot)}
      onConfirmMinimo={codigo => setConfirmados(atual => [...atual, codigo])}
      onVoltar={() => {}}
    />
  );
}

const novosSpies = () => ({ add: vi.fn(), remove: vi.fn() });
const creditos = () => screen.getByRole('img', { name: /de 32 créditos/ });

test('adiciona pela gaveta, avisa do co-requisito e desfaz', async () => {
  const spies = novosSpies();
  render(<Harness spies={spies} />);

  fireEvent.click(screen.getByRole('button', { name: 'Adicionar matéria' }));
  const gaveta = await screen.findByRole('dialog', { name: 'Adicionar matéria' });
  expect(within(gaveta).getByText('Curse junto com BD1')).toBeInTheDocument();
  fireEvent.click(within(gaveta).getByRole('button', { name: /Engenharia de Software/ }));

  const turmas = await screen.findByRole('dialog', { name: 'Engenharia de Software' });
  fireEvent.click(within(turmas).getByRole('radio', { name: /Turma A/ }));
  fireEvent.click(within(turmas).getByRole('button', { name: 'Adicionar turma A' }));

  expect(spies.add).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'ES1', turmaId: 'A' }));
  expect(creditos()).toHaveAccessibleName('4 de 32 créditos');
  expect(screen.getByRole('tab', { name: /terça/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('button', { name: /precisa ser cursada junto com/ })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
  expect(creditos()).toHaveAccessibleName('0 de 32 créditos');
  expect(screen.queryByRole('button', { name: /precisa ser cursada junto com/ })).not.toBeInTheDocument();
});

test('turma que choca fica desabilitada com o motivo', async () => {
  render(<Harness spies={novosSpies()} inicial={{ BD1: { ...banco, turmaId: 'A', horarios: banco.turmas[0].horarios } }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar matéria' }));
  const gaveta = await screen.findByRole('dialog', { name: 'Adicionar matéria' });
  fireEvent.click(within(gaveta).getByRole('button', { name: /Engenharia de Software/ }));

  const turmas = await screen.findByRole('dialog', { name: 'Engenharia de Software' });
  const turmaB = within(turmas).getByRole('radio', { name: /Turma B/ });
  expect(turmaB).toBeDisabled();
  expect(turmaB).toHaveTextContent('Choca com Banco de Dados');
  expect(within(turmas).getByRole('radio', { name: /Turma A/ })).toBeEnabled();
});

test('pré-requisito mínimo é confirmado na própria lista antes de escolher a turma', async () => {
  render(<Harness spies={novosSpies()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar matéria' }));
  const gaveta = await screen.findByRole('dialog', { name: 'Adicionar matéria' });

  fireEvent.click(within(gaveta).getByRole('button', { name: /Matéria Avançada/ }));
  expect(within(gaveta).getByText(/média final de pelo menos 50/)).toBeInTheDocument();
  fireEvent.click(within(gaveta).getByRole('button', { name: 'Sim, cursei' }));

  const turmas = await screen.findByRole('dialog', { name: 'Matéria Avançada' });
  fireEvent.click(within(turmas).getByRole('radio', { name: /Turma A/ }));
  expect(within(turmas).getByRole('button', { name: 'Adicionar turma A' })).toBeEnabled();
});

test('remover matéria que é co-requisito pede confirmação e leva a dependente junto', async () => {
  const spies = novosSpies();
  const inicial = {
    BD1: { ...banco, turmaId: 'A', horarios: banco.turmas[0].horarios },
    ES1: { ...engenharia, turmaId: 'A', horarios: engenharia.turmas[0].horarios }
  };
  render(<Harness spies={spies} inicial={inicial} />);

  fireEvent.click(screen.getByRole('tab', { name: /segunda/ }));
  fireEvent.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: /Banco de Dados/ }));
  const detalhe = await screen.findByRole('dialog', { name: 'Banco de Dados' });
  fireEvent.click(within(detalhe).getByRole('button', { name: 'Remover' }));
  expect(within(detalhe).getByText(/também sairá da grade/)).toBeInTheDocument();
  fireEvent.click(within(detalhe).getByRole('button', { name: 'Remover as duas' }));

  expect(spies.remove).toHaveBeenCalledWith('BD1', { silencioso: true });
  expect(creditos()).toHaveAccessibleName('0 de 32 créditos');
  expect(screen.getByRole('status')).toHaveTextContent('2 matérias removidas');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
