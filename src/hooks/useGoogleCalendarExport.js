import { useCallback, useEffect, useRef, useState } from 'react';
import { ACADEMIC_TERM, GOOGLE_CLIENT_ID } from '../config/academicTerm';
import { getNomeMateriaOuCodigo } from '../data';
import { getPendenciasCorequisitosCalendario } from '../domain/gradeRules';
import {
  carregarGoogleIdentity,
  exportarParaGoogle,
  lembrarPeriodo,
  montarEventos,
  pedirToken,
  sugerirPeriodo,
  validarPeriodo
} from '../integrations/googleCalendar';

export const GOOGLE_EXPORT_DISPONIVEL = Boolean(GOOGLE_CLIENT_ID);

/**
 * Exportação pro Google Agenda em duas etapas: `abrir()` valida a grade e mostra
 * a escolha do período; `exportar(periodo)` faz o login (popup) e cria as aulas.
 * `notificar(mensagem, nivel)` segue o padrão dos toasts.
 */
export default function useGoogleCalendarExport({
  materiasNoCalendario,
  materiasAprovadas,
  materiasMinimoConfirmadas,
  notificar
}) {
  const [periodo, setPeriodo] = useState(null);
  const [exportando, setExportando] = useState(false);
  const exportandoRef = useRef(false);

  // Carrega o script do Google antes do clique; senão o navegador bloqueia o popup.
  useEffect(() => {
    if (GOOGLE_EXPORT_DISPONIVEL) carregarGoogleIdentity().catch(() => {});
  }, []);

  const abrir = useCallback(() => {
    if (!GOOGLE_EXPORT_DISPONIVEL) {
      notificar('Exportação pro Google Agenda indisponível no momento.', 'error');
      return;
    }
    const pendencias = getPendenciasCorequisitosCalendario(
      materiasNoCalendario,
      materiasAprovadas,
      materiasMinimoConfirmadas
    );
    if (pendencias.length > 0) {
      const nomes = [...new Set(pendencias.map(({ coreqCodigo }) => getNomeMateriaOuCodigo(coreqCodigo)))];
      notificar(`Adicione os correquisitos pendentes antes de exportar: ${nomes.join(', ')}.`, 'error');
      return;
    }
    const temAula = Object.values(materiasNoCalendario || {})
      .some(materia => Array.isArray(materia?.horarios) && materia.horarios.length > 0);
    if (!temAula) {
      notificar('Adicione matérias com horário antes de exportar.', 'error');
      return;
    }
    setPeriodo(sugerirPeriodo());
  }, [materiasAprovadas, materiasMinimoConfirmadas, materiasNoCalendario, notificar]);

  const fechar = useCallback(() => {
    if (!exportandoRef.current) setPeriodo(null);
  }, []);

  /** Devolve a mensagem de erro do formulário, ou null. */
  const exportar = useCallback(async escolhido => {
    if (exportandoRef.current) return null;
    const erroPeriodo = validarPeriodo(escolhido);
    if (erroPeriodo) return erroPeriodo;

    const eventos = montarEventos(materiasNoCalendario, escolhido);
    if (eventos.length === 0) return 'Nenhuma aula cai nesse período.';

    exportandoRef.current = true;
    setExportando(true);
    try {
      const google = await carregarGoogleIdentity();
      const token = await pedirToken(google, GOOGLE_CLIENT_ID);
      await exportarParaGoogle(token, eventos, { titulo: `Grade UFLA ${ACADEMIC_TERM}` });
      lembrarPeriodo(escolhido);
      exportandoRef.current = false;
      setPeriodo(null);
      notificar(`Pronto! Sua grade está no Google Agenda, no calendário "Grade UFLA ${ACADEMIC_TERM}".`, 'success');
      return null;
    } catch (erro) {
      if (erro?.cancelado) return erro.message;
      if (erro?.status) return 'O Google Agenda recusou a exportação. Tente de novo em instantes.';
      return erro?.message || 'Não foi possível exportar pro Google Agenda.';
    } finally {
      exportandoRef.current = false;
      setExportando(false);
    }
  }, [materiasNoCalendario, notificar]);

  return {
    disponivel: GOOGLE_EXPORT_DISPONIVEL,
    aberto: periodo != null,
    periodoInicial: periodo,
    exportando,
    abrir,
    fechar,
    exportar
  };
}
