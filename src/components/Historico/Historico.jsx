import { forwardRef, useState } from 'react';
import { verificarPreRequisitosDetalhada, getNomeMateriaOuCodigo } from '../../data';
import PrerequisiteModal from '../Modal/PrerequisiteModal';
import './Historico.css';

const MODAL_FECHADO = { open: false, prereqs: [], tipo: null, materia: null };

const Historico = forwardRef(({
  semestreAtual,
  materiasAprovadas,
  materiasPorSemestre,
  onToggleMateria,
  onConfirmMinimo,
  onVoltar,
  onContinuar,
  onShowToast
}, ref) => {
  const [shakingMateria, setShakingMateria] = useState(null);
  const [minimoModal, setMinimoModal] = useState(MODAL_FECHADO);

  const handleToggle = (materia) => {
    const isChecked = materiasAprovadas.includes(materia.codigo);

    // Desmarcar nunca é bloqueado
    if (isChecked) {
      onToggleMateria(materia.codigo);
      return;
    }

    // Co-requisitos não são verificados aqui: eles são cursados junto, então uma
    // aprovação já obtida não depende do par estar marcado (ex.: GQI170/GQI171).
    const det = verificarPreRequisitosDetalhada(materia, materiasAprovadas, {});

    if (det.faltandoForte?.length > 0) {
      setShakingMateria(materia.codigo);
      setTimeout(() => setShakingMateria(null), 500);
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

      const nomes = det.faltandoForte.map(getNomeMateriaOuCodigo).join(', ');
      onShowToast?.(`É necessário fazer ${nomes} antes (pré-requisito forte)`, 'error');
      return;
    }

    if (det.faltandoMinimo?.length > 0) {
      setMinimoModal({ open: true, prereqs: det.faltandoMinimo, tipo: 'minimo', materia });
      return;
    }

    onToggleMateria(materia.codigo);
  };

  const fecharModal = () => setMinimoModal(MODAL_FECHADO);

  const cancelarMinimo = () => {
    const nomes = minimoModal.prereqs.map(getNomeMateriaOuCodigo).join(', ');
    onShowToast?.(`Necessário ter cursado: ${nomes} (mínimo).`, 'warning');
    fecharModal();
  };

  const confirmarMinimo = () => {
    minimoModal.prereqs.forEach(codigo => onConfirmMinimo?.(codigo));
    onToggleMateria(minimoModal.materia.codigo);
    fecharModal();
  };

  // Evita array com tamanho inválido
  const numSemestresAnteriores = Math.max(0, (semestreAtual || 1) - 1);

  return (
    <section className="historico" ref={ref}>
      <div className="historico__container">
        <h2 className="historico__title">Matérias</h2>
        <p className="historico__subtitle">
          Desmarque as matérias que você ainda NÃO cursou
        </p>

        <div className="historico__grid">
          {[...Array(numSemestresAnteriores)].map((_, semIdx) => {
            const sem = semIdx + 1;
            const materias = materiasPorSemestre[sem] || [];

            return (
              <div key={sem} className="historico__semestre">
                <h3 className="historico__semestre-titulo">{sem}º Semestre</h3>
                <div className="historico__materias">
                  {materias.map(materia => {
                    const isShaking = shakingMateria === materia.codigo;
                    const isChecked = materiasAprovadas.includes(materia.codigo);

                    return (
                      <label
                        key={materia.codigo}
                        className={`historico__materia ${isShaking ? 'historico__materia--shake' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggle(materia)}
                        />
                        <span className="historico__checkbox"></span>
                        <span className="historico__materia-nome">{materia.nome}</span>
                        <span className="historico__materia-codigo">{materia.codigo}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {semestreAtual === 1 && (
          <p className="historico__info">
            Como você está no 1º semestre, não há matérias anteriores para marcar.
          </p>
        )}

        <div className="historico__actions">
          <button className="btn-secondary" onClick={onVoltar}>
            Voltar
          </button>
          <button className="btn-primary" onClick={onContinuar}>
            Continuar para Montagem
          </button>
        </div>
      </div>

      <PrerequisiteModal
        modal={minimoModal}
        onClose={cancelarMinimo}
        onConfirm={confirmarMinimo}
        confirmLabel="Sim, marcar como feita"
      />
    </section>
  );
});

Historico.displayName = 'Historico';

export default Historico;
