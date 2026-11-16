import { useId, useState } from 'react';
import { getCursoInfo, getNomeMateriaOuCodigo, verificarPreRequisitosDetalhada } from '../../data';
import { getDependentesAprovados } from '../../domain/gradeRules';
import BottomSheet, { SheetHead } from './BottomSheet';
import Snackbar, { useSnackbar } from './Snackbar';

const nomes = codigos => codigos.map(getNomeMateriaOuCodigo).join(', ');

export default function MobileHistorico({
  cursoSelecionado,
  matrizSelecionada,
  semestreAtual,
  materiasAprovadas,
  materiasPorSemestre,
  onToggleMateria,
  onConfirmMinimo,
  onVoltar,
  onContinuar
}) {
  const [abertos, setAbertos] = useState(() => new Set([1]));
  const [tremendo, setTremendo] = useState(null);
  // Guarda o conteúdo mesmo fechada, para a gaveta sair com o texto e não vazia.
  const [minimo, setMinimo] = useState({ aberto: false, materia: null, prereqs: [] });
  const fecharMinimo = () => setMinimo(atual => ({ ...atual, aberto: false }));
  const { snack, mostrar, fechar } = useSnackbar();
  const titleId = `m-min-${useId().replace(/:/g, '')}`;

  const anteriores = Array.from({ length: Math.max(0, (semestreAtual || 1) - 1) }, (_, i) => i + 1);
  const todas = anteriores.flatMap(numero => materiasPorSemestre[numero] || []);
  const cursoNome = getCursoInfo(cursoSelecionado)?.nome || cursoSelecionado;

  const alternarSemestre = numero => {
    setAbertos(atual => {
      const proximo = new Set(atual);
      if (proximo.has(numero)) proximo.delete(numero);
      else proximo.add(numero);
      return proximo;
    });
  };

  const alternarMateria = materia => {
    if (materiasAprovadas.includes(materia.codigo)) {
      const saem = getDependentesAprovados(materia.codigo, materiasAprovadas, todas);
      onToggleMateria(materia.codigo);
      const outras = [...saem].filter(codigo => codigo !== materia.codigo);
      if (outras.length > 0) {
        mostrar(`Também desmarcamos ${nomes(outras)}, que depende${outras.length > 1 ? 'm' : ''} desta matéria.`);
      }
      return;
    }

    // Co-requisito não conta aqui: é cursado junto, então uma aprovação já obtida não depende do par.
    const pendencias = verificarPreRequisitosDetalhada(materia, materiasAprovadas, {});
    if (pendencias.faltandoForte?.length > 0) {
      setTremendo(materia.codigo);
      setTimeout(() => setTremendo(null), 450);
      navigator.vibrate?.([60, 40, 60]);
      mostrar(`Marque antes ${nomes(pendencias.faltandoForte)} (pré-requisito forte).`, { erro: true });
      return;
    }
    if (pendencias.faltandoMinimo?.length > 0) {
      fechar();
      setMinimo({ aberto: true, materia, prereqs: pendencias.faltandoMinimo });
      return;
    }
    onToggleMateria(materia.codigo);
  };

  const confirmarMinimo = () => {
    minimo.prereqs.forEach(codigo => onConfirmMinimo?.(codigo));
    onToggleMateria(minimo.materia.codigo);
    fecharMinimo();
  };

  return (
    <div className="m-screen">
      <header className="m-top">
        <button className="m-iconbtn" type="button" onClick={onVoltar} aria-label="Voltar">
          <i className="fi fi-br-angle-left" aria-hidden="true" />
        </button>
        <div className="m-top__titles">
          <h1 className="m-top__title">O que você já cursou?</h1>
          <p className="m-top__sub">{cursoNome} · {matrizSelecionada} · {semestreAtual}º semestre</p>
        </div>
      </header>

      <main className="m-main m-main--stack">
        <p className="m-lead">
          Marcamos tudo dos semestres anteriores. Desmarque as matérias que você ainda <strong>não</strong> fez.
        </p>
        {anteriores.map(numero => {
          const materias = materiasPorSemestre[numero] || [];
          const feitas = materias.filter(materia => materiasAprovadas.includes(materia.codigo)).length;
          const aberto = abertos.has(numero);
          const corpoId = `m-acc-${numero}`;
          return (
            <section key={numero} className="m-acc" data-open={aberto}>
              <button
                className="m-acc__head"
                type="button"
                aria-expanded={aberto}
                aria-controls={corpoId}
                onClick={() => alternarSemestre(numero)}
              >
                <span className="m-acc__title">{numero}º semestre</span>
                <span className="m-acc__count">{feitas} de {materias.length}</span>
                <i className="fi fi-br-angle-small-down m-acc__chev" aria-hidden="true" />
              </button>
              <div className="m-acc__wrap" id={corpoId} inert={!aberto}>
                <div className="m-acc__body">
                  {materias.map(materia => {
                    const marcada = materiasAprovadas.includes(materia.codigo);
                    return (
                      <button
                        key={materia.codigo}
                        className="m-hrow"
                        data-shake={tremendo === materia.codigo}
                        type="button"
                        role="checkbox"
                        aria-checked={marcada}
                        onClick={() => alternarMateria(materia)}
                      >
                        <span className="m-box" aria-hidden="true"><i className="fi fi-br-check" /></span>
                        <span className="m-hrow__txt">
                          <span className="m-hrow__name">{materia.nome}</span>
                          <span className="m-hrow__code">{materia.codigo}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}
      </main>

      <footer className="m-foot">
        <button className="m-btn m-btn--primary" type="button" onClick={onContinuar}>
          Montar minha grade
        </button>
      </footer>

      <div className="m-snack-zone">
        <Snackbar snack={snack} onClose={fechar} />
      </div>

      <BottomSheet open={minimo.aberto} onClose={fecharMinimo} titleId={titleId}>
        {minimo.materia && (
          <>
            <SheetHead titleId={titleId} title="Pré-requisito mínimo" onClose={fecharMinimo} />
            <div className="m-sheet__scroll">
              <p className="m-lead">
                Para marcar <strong>{minimo.materia.nome}</strong> como feita, você precisa ter cursado{' '}
                <strong>{nomes(minimo.prereqs)}</strong> sem reprovar por frequência e com média final de pelo menos 50.
              </p>
            </div>
            <div className="m-sheet__foot">
              <div className="m-actions">
                <button className="m-btn m-btn--ghost" type="button" onClick={fecharMinimo}>Não cursei</button>
                <button className="m-btn m-btn--primary" type="button" onClick={confirmarMinimo}>Sim, cursei</button>
              </div>
            </div>
          </>
        )}
      </BottomSheet>
    </div>
  );
}
