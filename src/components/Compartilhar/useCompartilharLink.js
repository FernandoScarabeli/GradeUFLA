import { useCallback } from 'react';

const TITULO = 'Minha grade – GradeUFLA';

async function copiarTexto(texto) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // Sem permissão: tenta o jeito antigo abaixo.
  }
  try {
    const campo = document.createElement('textarea');
    campo.value = texto;
    campo.setAttribute('readonly', '');
    campo.style.position = 'fixed';
    campo.style.opacity = '0';
    document.body.appendChild(campo);
    campo.select();
    const ok = document.execCommand?.('copy');
    campo.remove();
    return Boolean(ok);
  } catch {
    return false;
  }
}

export const podeUsarWebShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/**
 * "Copiar link da grade" e "Compartilhar…" (Web Share API).
 * `gerarLink()` devolve a URL `#g=` do plano ativo, ou null quando não há o que compartilhar.
 */
export default function useCompartilharLink({ gerarLink, periodo, notificar }) {
  const obterLink = useCallback(async () => {
    try {
      const url = await gerarLink?.();
      if (!url) notificar('Adicione matérias antes de compartilhar a grade.', 'error');
      return url || null;
    } catch {
      notificar('Não foi possível gerar o link da grade.', 'error');
      return null;
    }
  }, [gerarLink, notificar]);

  const copiarLink = useCallback(async () => {
    const url = await obterLink();
    if (!url) return;
    if (await copiarTexto(url)) notificar('Link copiado.', 'success');
    else notificar(`Não deu pra copiar automaticamente. Copie este link: ${url}`, 'info');
  }, [notificar, obterLink]);

  const compartilhar = useCallback(async () => {
    const url = await obterLink();
    if (!url) return;
    try {
      await navigator.share({ title: TITULO, text: `Minha grade de ${periodo} no GradeUFLA`, url });
    } catch (erro) {
      if (erro?.name !== 'AbortError') await copiarLink();
    }
  }, [copiarLink, obterLink, periodo]);

  return { copiarLink, compartilhar, podeCompartilhar: podeUsarWebShare() };
}
