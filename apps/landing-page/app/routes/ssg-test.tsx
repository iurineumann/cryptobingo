import { Helmet } from 'react-helmet-async';

export default function SsgTest() {
  return (
    <>
      <Helmet>
        <title>SSG Test | CryptoBingo</title>
        <meta name="description" content="Página de teste SSG" />
      </Helmet>
      <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        <h1>SSG Test Page</h1>
        <p>Esta página foi pré-renderizada como HTML estático.</p>
        <p>Timestamp da build: {new Date().toISOString()}</p>
        <a href="/">Voltar</a>
      </div>
    </>
  );
}
