/* global React */
// CryptoBingo — símbolos e lockups da logomarca
const A = '../assets/logo/';
const FOX = {
  hero:'fox_22.png', hex:'fox_10.png', net:'fox_28.png',
  coin:'fox_31.png', tile:'fox_03.png', gem:'fox_34.png',
};

// ---------- Wordmark ----------
function Wordmark({ size = 40, theme = 'dark', solid = false, color, gap }) {
  const cls = 'lm-wm' + (theme === 'light' ? ' on-light' : '') + (solid ? ' solid' : '');
  return (
    <span className={cls} style={{ fontSize: size, color: solid ? (color || '#fff') : undefined }}>
      <span className="c1">Crypto</span><span className="c2">Bingo</span>
    </span>
  );
}

// ---------- Símbolo 1 · Orbe (bola de bingo violeta + raposa) ----------
function FoxBall({ size = 160, fox = FOX.hero, tag = 'CB', showTag = true }) {
  return (
    <div className="lm-ball" style={{ width: size, height: size }}>
      <img className="fox" src={A + fox} alt="" />
      {showTag && (
        <span className="lm-balltag" style={{ top: '4%', right: '2%', fontSize: size * 0.12 }}>{tag}</span>
      )}
    </div>
  );
}

// ---------- Símbolo 2 · Hexágono token ----------
function FoxHex({ size = 160, fox = FOX.hex }) {
  return (
    <div className="lm-hex-glow" style={{ width: size, height: size, display: 'flex' }}>
      <div className="lm-hex" style={{ width: size, height: size }}>
        <img className="fox" src={A + fox} alt="" />
      </div>
    </div>
  );
}

// ---------- Símbolo 3 · Esfera + rede (blockchain) ----------
function FoxNet({ size = 160, fox = FOX.net }) {
  const nodes = [
    { top: '-2%', left: '46%' }, { top: '40%', left: '-4%' },
    { top: '78%', left: '20%' }, { top: '74%', left: '78%' }, { top: '34%', left: '98%' },
  ];
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex' }}>
      <div className="lm-orbit">
        <div className="ring"></div>
        {nodes.map((n, i) => <span key={i} className="node" style={n}></span>)}
      </div>
      <div className="lm-ball" style={{ width: size, height: size, position: 'relative', zIndex: 1 }}>
        <img className="fox" src={A + fox} alt="" />
      </div>
    </div>
  );
}

// ---------- Símbolo 4 · Moeda dourada ----------
function FoxCoin({ size = 160, fox = FOX.coin }) {
  return (
    <div className="lm-coin" style={{ width: size, height: size }}>
      <div className="inner"><img className="fox" src={A + fox} alt="" /></div>
    </div>
  );
}

// ---------- Símbolo 5 · Mascote coin ----------
function MascotBadge({ size = 160 }) {
  return (
    <div className="lm-mcoin" style={{ width: size, height: size }}>
      <div className="disc"><img src={A + 'masc_sit.png'} alt="" /></div>
    </div>
  );
}

// ---------- Símbolo 6 · App icon / squircle (CB) ----------
function FoxTile({ size = 160, fox = FOX.tile, cb = true }) {
  return (
    <div className="lm-tile" style={{ width: size, height: size }}>
      <img className="fox" src={A + fox} alt="" />
      {cb && <span className="cb" style={{ fontSize: size * 0.2 }}>CB</span>}
    </div>
  );
}

// ---------- Silhueta monocromática (PNG pré-renderizado, robusto p/ export) ----------
const SIL = { '#7c3aed':'sil_violet.png', '#ffffff':'sil_white.png', '#15152a':'sil_ink.png' };
function Silhouette({ size = 120, color = '#7c3aed' }) {
  return <img src={A + (SIL[color] || 'sil_violet.png')} alt=""
    style={{ width: size, height: size, objectFit: 'contain', display: 'block' }} />;
}

// ---------- Marca monocromática do Hexágono (knockout) ----------
const HEXM = { '#7c3aed':'hexmark_violet.png', '#ffffff':'hexmark_white.png', '#15152a':'hexmark_ink.png' };
function HexMark({ size = 120, color = '#7c3aed' }) {
  return <img src={A + (HEXM[color] || 'hexmark_violet.png')} alt=""
    style={{ width: size, height: size, objectFit: 'contain', display: 'block' }} />;
}

// ---------- Lockups ----------
function LockupH({ Symbol, symProps = {}, sym = 64, wm = 34, theme = 'dark', gap = 18, solid, color }) {
  return (
    <div className="lm-row" style={{ gap }}>
      <Symbol size={sym} {...symProps} />
      <Wordmark size={wm} theme={theme} solid={solid} color={color} />
    </div>
  );
}
function LockupV({ Symbol, symProps = {}, sym = 96, wm = 30, theme = 'dark', gap = 16, solid, color }) {
  return (
    <div className="lm-stack" style={{ gap }}>
      <Symbol size={sym} {...symProps} />
      <Wordmark size={wm} theme={theme} solid={solid} color={color} />
    </div>
  );
}

Object.assign(window, {
  Wordmark, FoxBall, FoxHex, FoxNet, FoxCoin, MascotBadge, FoxTile,
  Silhouette, HexMark, LockupH, LockupV, FOX,
});
