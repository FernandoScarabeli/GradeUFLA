import { useEffect, useState } from 'react';
import {
  ensureCsvLoaded,
  getCsvLoadState,
  getCursosImplementados,
  getMatrizesByCurso,
  getTotalSemestres,
  retryCsvLoad,
  useCsvLoadState
} from '../../data';
import { casaBusca } from './mobileGrade';

const TITULOS = {
  1: 'Qual é o seu curso?',
  2: 'Qual é a sua matriz curricular?',
  3: 'Qual semestre você vai cursar?'
};

function Check() {
  return <span className="m-check" aria-hidden="true"><i className="fi fi-br-check" /></span>;
}

export default function MobileSetup({
  initialStep = 1,
  cursoSelecionado,
  setCursoSelecionado,
  matrizSelecionada,
  setMatrizSelecionada,
  semestreSelecionado,
  setSemestreSelecionado,
  onComplete,
  onVoltar
}) {
  const [passo, setPasso] = useState(initialStep);
  const [busca, setBusca] = useState('');
  const csvLoadState = useCsvLoadState();
  const pronto = csvLoadState.status === 'success';

  useEffect(() => {
    if (getCsvLoadState().status === 'idle') {
      ensureCsvLoaded().catch(() => {
        // O estado central guarda o erro para exibição e nova tentativa.
      });
    }
  }, []);

  const cursos = pronto
    ? getCursosImplementados()
      .slice()
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
    : [];
  const cursosFiltrados = cursos.filter(curso => casaBusca({ nome: curso.nome, codigo: curso.id }, busca));
  const matrizes = pronto && cursoSelecionado ? getMatrizesByCurso(cursoSelecionado) : [];
  const totalSemestres = cursoSelecionado ? getTotalSemestres(cursoSelecionado, matrizSelecionada) : 8;

  const escolherCurso = id => {
    if (id !== cursoSelecionado) {
      setMatrizSelecionada(null);
      setSemestreSelecionado(null);
    }
    setCursoSelecionado(id);
  };

  const escolherMatriz = id => {
    if (id !== matrizSelecionada) setSemestreSelecionado(null);
    setMatrizSelecionada(id);
  };

  const avancar = () => {
    if (passo === 1) {
      // A matriz mais recente é a resposta certa para quase todo mundo.
      if (!matrizSelecionada) {
        const recentes = getMatrizesByCurso(cursoSelecionado);
        if (recentes.length > 0) setMatrizSelecionada(recentes[0].id);
      }
      setPasso(2);
      return;
    }
    if (passo === 2) {
      setPasso(3);
      return;
    }
    onComplete({ curso: cursoSelecionado, matriz: matrizSelecionada, semestre: semestreSelecionado });
  };

  const voltar = () => {
    if (passo > 1) setPasso(passo - 1);
    else onVoltar();
  };

  const podeAvancar = (passo === 1 && cursoSelecionado)
    || (passo === 2 && matrizSelecionada)
    || (passo === 3 && semestreSelecionado);

  let corpo;
  if (!pronto) {
    corpo = csvLoadState.status === 'error' ? (
      <div className="m-state" role="alert">
        <p className="m-h1">Não foi possível carregar os cursos</p>
        <p className="m-lead">Verifique sua conexão e tente de novo.</p>
        <button className="m-btn m-btn--ghost" type="button" onClick={() => retryCsvLoad().catch(() => {})}>
          Tentar novamente
        </button>
      </div>
    ) : (
      <div className="m-state" role="status">
        <p className="m-lead">Carregando cursos e matérias…</p>
      </div>
    );
  } else if (passo === 1) {
    corpo = (
      <>
        <label className="m-search">
          <i className="fi fi-br-search" aria-hidden="true" />
          <input
            type="search"
            placeholder="Buscar por nome ou código"
            aria-label="Buscar curso"
            value={busca}
            onChange={event => setBusca(event.target.value)}
            autoComplete="off"
          />
        </label>
        <div className="m-options" role="radiogroup" aria-label="Curso">
          {cursosFiltrados.map(curso => (
            <button
              key={curso.id}
              className="m-option"
              type="button"
              role="radio"
              aria-checked={cursoSelecionado === curso.id}
              onClick={() => escolherCurso(curso.id)}
            >
              <span className="m-option__code">{curso.id}</span>
              <span className="m-option__label">{curso.nome}</span>
              <Check />
            </button>
          ))}
          {cursosFiltrados.length === 0 && <p className="m-lead">Nenhum curso encontrado para “{busca}”.</p>}
        </div>
      </>
    );
  } else if (passo === 2) {
    corpo = (
      <>
        <p className="m-lead">É o ano em que a sua grade curricular começou a valer. Na dúvida, confira no SIG.</p>
        <div className="m-options" role="radiogroup" aria-label="Matriz curricular">
          {matrizes.map((matriz, index) => (
            <button
              key={matriz.id}
              className="m-option"
              type="button"
              role="radio"
              aria-checked={matrizSelecionada === matriz.id}
              onClick={() => escolherMatriz(matriz.id)}
            >
              <span className="m-option__label">Matriz {matriz.nome}</span>
              {index === 0 && <span className="m-option__tag">mais recente</span>}
              <Check />
            </button>
          ))}
        </div>
      </>
    );
  } else {
    corpo = (
      <>
        <p className="m-lead">Usamos isso para sugerir as matérias certas e marcar o que você já fez.</p>
        <div className="m-semgrid" role="radiogroup" aria-label="Semestre">
          {Array.from({ length: totalSemestres }, (_, index) => index + 1).map(numero => (
            <button
              key={numero}
              className="m-option"
              type="button"
              role="radio"
              aria-checked={semestreSelecionado === numero}
              aria-label={`${numero}º semestre`}
              onClick={() => setSemestreSelecionado(numero)}
            >
              <span>{numero}º<small>semestre</small></span>
            </button>
          ))}
        </div>
      </>
    );
  }

  return (
    <div className="m-screen">
      <header className="m-top">
        <button className="m-iconbtn" type="button" onClick={voltar} aria-label="Voltar">
          <i className="fi fi-br-angle-left" aria-hidden="true" />
        </button>
        <div className="m-top__titles">
          <p className="m-top__title">Montar grade</p>
          <p className="m-top__sub">Passo {passo} de 3</p>
        </div>
      </header>
      <div className="m-steps" aria-hidden="true">
        {[1, 2, 3].map(numero => <span key={numero} data-on={numero <= passo} />)}
      </div>
      <main className="m-main">
        <h1 className="m-h1">{TITULOS[passo]}</h1>
        {corpo}
      </main>
      <footer className="m-foot">
        <button className="m-btn m-btn--primary" type="button" onClick={avancar} disabled={!pronto || !podeAvancar}>
          {passo === 3 ? 'Continuar' : 'Próximo'}
        </button>
      </footer>
    </div>
  );
}
