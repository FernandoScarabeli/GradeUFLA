import { getNomeMateriaOuCodigo } from '../../data';
import { oQueDestrava } from '../../domain/sugestoes';
import './Sugestoes.css';

const LIMITE = 6;
const semestreNumerico = semestre => (semestre !== '' && Number.isFinite(Number(semestre)) ? Number(semestre) : null);

/**
 * "Fazer esta matéria libera…": quem pede a matéria como pré-requisito e ainda não foi feito.
 * Some quando ninguém depende dela.
 */
export default function DestravaInfo({ codigo, allMateriasList, materiasAprovadas, prerequisitosConfirmados, variante = 'desktop' }) {
  const { diretas, totalNaCadeia } = oQueDestrava(codigo, allMateriasList, { materiasAprovadas, prerequisitosConfirmados });
  if (diretas.length === 0) return null;

  const visiveis = diretas.slice(0, LIMITE);
  const escondidas = diretas.length - visiveis.length;
  const indiretas = totalNaCadeia - diretas.length;

  return (
    <section className={`destrava destrava--${variante}`} aria-label="O que esta matéria destrava">
      <h4 className="destrava__titulo">
        <i className="fi fi-br-unlock" aria-hidden="true" />
        Fazer esta matéria libera
      </h4>
      <ul className="destrava__lista">
        {visiveis.map(({ materia, liberaDeVez, faltaAinda }) => (
          <li key={materia.codigo} className="destrava__item" data-de-vez={liberaDeVez}>
            <span className="destrava__nome">{materia.nome}</span>
            <span className="destrava__meta">
              {semestreNumerico(materia.semestre)
                ? `${semestreNumerico(materia.semestre)}º sem · `
                : materia.tipo === 'eletiva' ? 'eletiva · ' : ''}
              {liberaDeVez ? 'libera de vez' : `falta também ${faltaAinda.map(getNomeMateriaOuCodigo).join(', ')}`}
            </span>
          </li>
        ))}
      </ul>
      {(escondidas > 0 || indiretas > 0) && (
        <p className="destrava__rodape">
          {escondidas > 0 && `E mais ${escondidas}. `}
          {indiretas > 0 && `Contando o que vem depois, ${totalNaCadeia} matérias da matriz dependem dela.`}
        </p>
      )}
    </section>
  );
}
