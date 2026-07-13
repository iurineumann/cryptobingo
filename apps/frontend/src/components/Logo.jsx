// apps/frontend/src/components/Logo.tsx
// Componente de logo reutilizável — usa os assets canônicos de /public/brand/
//
// Variantes:
//   icon        — composed_logo.webp (hexágono + raposa já compostos)
//   horizontal  — icon.webp + wordmark "CryptoBingo" idêntico à landing page
//   wordmark    — só o texto "CryptoBingo" (inline, respeita tema)
//   mascot      — raposa PNG isolada (fox-mascot.png)
export default function Logo({ variant = 'horizontal', height = 36, className = '', onClick, alt = 'CryptoBingo', }) {
    const clickProps = onClick ? {
        onClick,
        onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ')
            onClick(); },
        role: 'button',
        tabIndex: 0,
        style: { cursor: 'pointer' },
    } : {};
    // ── Wordmark puro — idêntico ao cb-logo da LandingPage ─────────────────
    if (variant === 'wordmark') {
        return (<span className={`cb-logo ${className}`} style={{ fontSize: height, ...clickProps.style }} {...(onClick ? clickProps : {})}>
                Crypto<span>Bingo</span>
            </span>);
    }
    // ── Mascote isolado ─────────────────────────────────────────────────────
    if (variant === 'mascot') {
        return (<img src="/brand/fox-mascot.png" alt={alt} height={height} className={className} draggable={false} style={{ display: 'block', ...clickProps.style }} {...(onClick ? clickProps : {})}/>);
    }
    // ── Ícone isolado — webp composto ────────────────────────────────────────
    if (variant === 'icon') {
        return (<img src="/brand/hexmark_violet.png" alt={alt} height={height} width={height} className={className} draggable={false} style={{ display: 'block', ...clickProps.style }} {...(onClick ? clickProps : {})}/>);
    }
    // ── Horizontal: icon.webp + wordmark cb-logo ────────────────────────────
    // Replica exatamente o padrão da LandingPage e do App.tsx:
    //   <span className="cb-logo">Crypto<span>Bingo</span></span>
    return (<span className={`inline-flex items-center gap-2 ${className}`} style={{ lineHeight: 1, ...clickProps.style }} {...(onClick ? clickProps : {})} aria-label={alt}>
            <img src="/brand/hexmark_violet.png" alt="" aria-hidden="true" height={height} width={height} draggable={false} style={{ display: 'block', flexShrink: 0 }}/>
            <span className="cb-logo" style={{ fontSize: height * 0.72, lineHeight: 1 }}>
                Crypto<span>Bingo</span>
            </span>
        </span>);
}
//# sourceMappingURL=Logo.js.map