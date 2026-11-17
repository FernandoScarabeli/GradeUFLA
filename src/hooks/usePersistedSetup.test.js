import { act, renderHook } from '@testing-library/react';
import usePersistedSetup from './usePersistedSetup';
import { STORAGE_KEY } from '../state/gradeSalva';

const memoriaStorage = () => {
  const dados = new Map();
  return {
    getItem: vi.fn(chave => (dados.has(chave) ? dados.get(chave) : null)),
    setItem: vi.fn((chave, valor) => dados.set(chave, String(valor))),
    removeItem: vi.fn(chave => dados.delete(chave))
  };
};

const estadoBase = {
  ativo: true,
  etapa: 'montagem',
  curso: 'G014',
  matriz: '2023/01',
  semestre: 2,
  aprovadas: ['BAS101'],
  minimoConfirmados: [],
  planoAtivo: 'A',
  planos: { A: { NOR201: { turmaId: 'A' } }, B: {}, C: {} }
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('grava com debounce e lê de volta a combinação', () => {
  const storage = memoriaStorage();
  const { result, rerender } = renderHook(estado => usePersistedSetup(estado, { storage }), {
    initialProps: estadoBase
  });

  expect(result.current.temSalvo).toBe(true);
  rerender({ ...estadoBase, aprovadas: ['BAS101', 'BAS102'] });
  expect(storage.setItem).not.toHaveBeenCalled();

  act(() => vi.advanceTimersByTime(300));
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  const salvo = JSON.parse(storage.setItem.mock.calls[0][1]);
  expect(salvo.setups['G014|2023/01|2'].aprovadas).toEqual(['BAS101', 'BAS102']);

  expect(result.current.lerSetup('G014', '2023/01', 2).planos.A).toEqual({ NOR201: { turmaId: 'A' } });
  expect(result.current.ultimoSalvo()).toMatchObject({ curso: 'G014', matriz: '2023/01', semestre: 2, etapa: 'montagem' });
});

test('não salva enquanto inativo (setup em edição)', () => {
  const storage = memoriaStorage();
  const { result } = renderHook(() => usePersistedSetup({ ...estadoBase, ativo: false }, { storage }));
  act(() => vi.advanceTimersByTime(1000));
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(result.current.temSalvo).toBe(false);
  expect(result.current.ultimoSalvo()).toBeNull();
});

test('guarda as outras combinações ao trocar de semestre', () => {
  const storage = memoriaStorage();
  const { result, rerender } = renderHook(estado => usePersistedSetup(estado, { storage }), {
    initialProps: estadoBase
  });
  rerender({ ...estadoBase, semestre: 3, planos: { A: {}, B: {}, C: {} } });
  expect(result.current.lerSetup('G014', '2023/01', 2).planos.A).toEqual({ NOR201: { turmaId: 'A' } });
  expect(result.current.ultimoSalvo().semestre).toBe(3);
});

test('pagehide grava na hora o que estava no debounce', () => {
  const storage = memoriaStorage();
  renderHook(() => usePersistedSetup(estadoBase, { storage }));
  expect(storage.setItem).not.toHaveBeenCalled();
  act(() => { window.dispatchEvent(new Event('pagehide')); });
  expect(storage.setItem).toHaveBeenCalledWith(STORAGE_KEY, expect.any(String));
});

test('apagarTudo limpa memória e storage', () => {
  const storage = memoriaStorage();
  const { result } = renderHook(() => usePersistedSetup({ ...estadoBase, ativo: false }, { storage }));
  storage.setItem(STORAGE_KEY, '{}');
  act(() => result.current.apagarTudo());
  expect(storage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
  expect(result.current.temSalvo).toBe(false);
});

test('sem storage o site funciona normalmente', () => {
  const { result } = renderHook(() => usePersistedSetup(estadoBase, { storage: null }));
  act(() => vi.advanceTimersByTime(300));
  expect(result.current.temSalvo).toBe(true);
  expect(result.current.lerSetup('G014', '2023/01', 2)).not.toBeNull();
});
