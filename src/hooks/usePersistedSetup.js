import { useCallback, useEffect, useRef, useState } from 'react';
import {
  apagarEnvelope,
  envelopeVazio,
  gravarEnvelope,
  lerChave,
  lerEnvelope,
  obterStorage,
  registrarSetup,
  chaveSetup
} from '../state/gradeSalva';

const temUltimo = envelope => Boolean(envelope.ultimo && envelope.setups[envelope.ultimo]);

/**
 * Mantém a combinação ativa (aprovadas, confirmações e planos A/B/C) salva no navegador.
 * O envelope em memória é atualizado a cada mudança; o localStorage, com debounce.
 * Só salva quando `ativo` (histórico ou montagem), pra não gravar uma combinação pela metade
 * enquanto o aluno ainda está escolhendo curso, matriz e semestre.
 */
export default function usePersistedSetup(
  { ativo, etapa, curso, matriz, semestre, aprovadas, minimoConfirmados, planoAtivo, planos },
  { storage: storageOpcao, atraso = 300 } = {}
) {
  const [storage] = useState(() => (storageOpcao === undefined ? obterStorage() : storageOpcao));
  const envelopeRef = useRef(null);
  if (envelopeRef.current === null) envelopeRef.current = lerEnvelope(storage);
  const [temSalvo, setTemSalvo] = useState(() => temUltimo(envelopeRef.current));
  const timerRef = useRef(null);

  const gravarAgora = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    gravarEnvelope(storage, envelopeRef.current);
  }, [storage]);

  useEffect(() => {
    if (!ativo || !curso || !matriz || semestre == null) return;
    envelopeRef.current = registrarSetup(envelopeRef.current, {
      curso, matriz, semestre, etapa, aprovadas, minimoConfirmados, planoAtivo, planos
    });
    setTemSalvo(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(gravarAgora, atraso);
  }, [ativo, etapa, curso, matriz, semestre, aprovadas, minimoConfirmados, planoAtivo, planos, gravarAgora, atraso]);

  // Fechar ou recarregar a aba antes do debounce não pode perder a última mudança.
  useEffect(() => {
    const aoSair = () => {
      if (timerRef.current) gravarAgora();
    };
    window.addEventListener('pagehide', aoSair);
    return () => {
      window.removeEventListener('pagehide', aoSair);
      aoSair();
    };
  }, [gravarAgora]);

  /** Setup salvo (serializado) de uma combinação, ou null. */
  const lerSetup = useCallback(
    (cursoId, matrizId, semestreNumero) =>
      envelopeRef.current.setups[chaveSetup(cursoId, matrizId, semestreNumero)] || null,
    []
  );

  /** Última combinação usada: { curso, matriz, semestre, etapa, setup }, ou null. */
  const ultimoSalvo = useCallback(() => {
    const envelope = envelopeRef.current;
    if (!temUltimo(envelope)) return null;
    const combinacao = lerChave(envelope.ultimo);
    if (!combinacao) return null;
    return { ...combinacao, etapa: envelope.etapa, setup: envelope.setups[envelope.ultimo] };
  }, []);

  const apagarTudo = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    envelopeRef.current = envelopeVazio();
    apagarEnvelope(storage);
    setTemSalvo(false);
  }, [storage]);

  return { temSalvo, lerSetup, ultimoSalvo, apagarTudo };
}
