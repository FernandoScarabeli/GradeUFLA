import { fireEvent, render, screen } from '@testing-library/react';
import Historico from './Historico';

const renderHistorico = (props) => render(
  <Historico
    semestreAtual={2}
    materiasAprovadas={[]}
    onToggleMateria={() => {}}
    onConfirmMinimo={() => {}}
    onVoltar={() => {}}
    onContinuar={() => {}}
    {...props}
  />
);

test('persiste cada confirmação de pré-requisito mínimo feita no histórico', () => {
  const onConfirmMinimo = vi.fn();
  const onToggleMateria = vi.fn();

  const materia = {
    codigo: 'GCC003',
    nome: 'Disciplina avançada',
    semestre: 1,
    preRequisitosDetalhada: {
      forte: [],
      minimo: ['GCC001', 'GCC002'],
      coreq: []
    }
  };

  renderHistorico({
    materiasPorSemestre: { 1: [materia] },
    onToggleMateria,
    onConfirmMinimo
  });

  fireEvent.click(screen.getByLabelText(/disciplina avançada/i));
  expect(onToggleMateria).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: /sim, marcar como feita/i }));

  expect(onConfirmMinimo).toHaveBeenCalledTimes(2);
  expect(onConfirmMinimo).toHaveBeenNthCalledWith(1, 'GCC001');
  expect(onConfirmMinimo).toHaveBeenNthCalledWith(2, 'GCC002');
  expect(onToggleMateria).toHaveBeenCalledWith('GCC003');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('cancelar a confirmação de mínimo não marca a matéria', () => {
  const onConfirmMinimo = vi.fn();
  const onToggleMateria = vi.fn();
  const onShowToast = vi.fn();

  renderHistorico({
    materiasPorSemestre: {
      1: [{
        codigo: 'GCC003',
        nome: 'Disciplina avançada',
        semestre: 1,
        preRequisitosDetalhada: { forte: [], minimo: ['GCC001'], coreq: [] }
      }]
    },
    onToggleMateria,
    onConfirmMinimo,
    onShowToast
  });

  fireEvent.click(screen.getByLabelText(/disciplina avançada/i));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

  expect(onConfirmMinimo).not.toHaveBeenCalled();
  expect(onToggleMateria).not.toHaveBeenCalled();
  expect(onShowToast).toHaveBeenCalledWith(expect.stringMatching(/GCC001/), 'warning');
});

test('permite marcar matérias com co-requisito mútuo sem exigir o par marcado', () => {
  const onToggleMateria = vi.fn();
  const coreqDe = outra => ({ forte: [], minimo: [], coreq: [outra] });

  renderHistorico({
    semestreAtual: 3,
    materiasPorSemestre: {
      2: [
        { codigo: 'GQI170', nome: 'Química Analítica', semestre: 2, preRequisitosDetalhada: coreqDe('GQI171') },
        { codigo: 'GQI171', nome: 'Química Analítica Experimental', semestre: 2, preRequisitosDetalhada: coreqDe('GQI170') }
      ]
    },
    onToggleMateria
  });

  fireEvent.click(screen.getByLabelText(/GQI171/));
  fireEvent.click(screen.getByLabelText(/GQI170/));

  expect(onToggleMateria).toHaveBeenCalledWith('GQI171');
  expect(onToggleMateria).toHaveBeenCalledWith('GQI170');
});
