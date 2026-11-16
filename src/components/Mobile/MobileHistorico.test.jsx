import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getDependentesAprovados } from '../../domain/gradeRules';
import MobileHistorico from './MobileHistorico';

const base = { forte: [], minimo: [], coreq: [] };
const algoritmos = { codigo: 'ALG', nome: 'Algoritmos', semestre: 1, preRequisitosDetalhada: base };
const calculo = { codigo: 'CAL', nome: 'Cálculo', semestre: 1, preRequisitosDetalhada: base };
const poo = { codigo: 'POO', nome: 'Orientação a Objetos', semestre: 2, preRequisitosDetalhada: { ...base, forte: ['ALG'] } };
const estatistica = { codigo: 'EST', nome: 'Estatística', semestre: 2, preRequisitosDetalhada: { ...base, minimo: ['CAL'] } };
const porSemestre = { 1: [algoritmos, calculo], 2: [poo, estatistica] };
const todas = [algoritmos, calculo, poo, estatistica];

function Harness({ inicial, onConfirmMinimo = () => {} }) {
  const [aprovadas, setAprovadas] = useState(inicial);
  return (
    <MobileHistorico
      cursoSelecionado="G014"
      matrizSelecionada="2023/01"
      semestreAtual={3}
      materiasAprovadas={aprovadas}
      materiasPorSemestre={porSemestre}
      onToggleMateria={codigo => setAprovadas(atual => (
        atual.includes(codigo)
          ? atual.filter(c => !getDependentesAprovados(codigo, atual, todas).has(c))
          : [...atual, codigo]
      ))}
      onConfirmMinimo={onConfirmMinimo}
      onVoltar={() => {}}
      onContinuar={() => {}}
    />
  );
}

test('desmarcar uma matéria desmarca as que dependem dela e avisa', () => {
  render(<Harness inicial={['ALG', 'CAL', 'POO', 'EST']} />);
  fireEvent.click(screen.getByRole('button', { name: /2º semestre/ }));

  fireEvent.click(screen.getByRole('checkbox', { name: /Algoritmos/ }));
  expect(screen.getByRole('checkbox', { name: /Algoritmos/ })).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByRole('checkbox', { name: /Orientação a Objetos/ })).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByRole('status')).toHaveTextContent('Também desmarcamos POO, que depende desta matéria');
  expect(screen.getByRole('button', { name: /1º semestre/ })).toHaveTextContent('1 de 2');
});

test('marcar sem o pré-requisito forte não marca e explica', () => {
  render(<Harness inicial={[]} />);
  fireEvent.click(screen.getByRole('button', { name: /2º semestre/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Orientação a Objetos/ }));
  expect(screen.getByRole('checkbox', { name: /Orientação a Objetos/ })).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByRole('status')).toHaveTextContent('Marque antes ALG (pré-requisito forte)');
});

test('pré-requisito mínimo é confirmado numa gaveta, não em window.confirm', async () => {
  const onConfirmMinimo = vi.fn();
  render(<Harness inicial={[]} onConfirmMinimo={onConfirmMinimo} />);
  fireEvent.click(screen.getByRole('button', { name: /2º semestre/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Estatística/ }));

  const gaveta = await screen.findByRole('dialog', { name: 'Pré-requisito mínimo' });
  fireEvent.click(gaveta.querySelector('.m-btn--primary'));
  expect(onConfirmMinimo).toHaveBeenCalledWith('CAL');
  expect(screen.getByRole('checkbox', { name: /Estatística/ })).toHaveAttribute('aria-checked', 'true');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
