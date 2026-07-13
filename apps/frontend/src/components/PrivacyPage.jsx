import { useState, useEffect } from 'react';
import Seo from './Seo';
const COOKIE_TABLE = [
    { name: 'cb_theme', purpose: 'Preferência de tema (claro/escuro)', type: 'Necessário', duration: 'Persistente (1 ano)', category: 'necessary' },
    { name: 'cb_consent', purpose: 'Registro de consentimento LGPD', type: 'Necessário', duration: 'Persistente (1 ano)', category: 'necessary' },
    { name: 'connect.sess', purpose: 'Sessão de autenticação do usuário', type: 'Necessário', duration: 'Sessão', category: 'necessary' },
    { name: '_ga', purpose: 'ID único para Google Analytics', type: 'Analítico', duration: 'Persistente (2 anos)', category: 'analytics' },
    { name: '_ga_*', purpose: 'Sessão do Google Analytics', type: 'Analítico', duration: 'Persistente (2 anos)', category: 'analytics' },
    { name: '_gid', purpose: 'Sessão do Google Analytics (menor duração)', type: 'Analítico', duration: 'Persistente (24 horas)', category: 'analytics' },
    { name: '_cl_*', purpose: 'Sessão do Microsoft Clarity', type: 'Analítico', duration: 'Persistente (1 ano)', category: 'analytics' },
    { name: '_clsk', purpose: 'Sessão do Microsoft Clarity', type: 'Analítico', duration: 'Persistente (1 dia)', category: 'analytics' },
    { name: '_gcl_*', purpose: 'Conversões do Google Ads', type: 'Marketing', duration: 'Persistente (3 meses)', category: 'marketing' },
    { name: '_fbp', purpose: 'Pixel do Facebook/Meta Ads', type: 'Marketing', duration: 'Persistente (3 meses)', category: 'marketing' },
];
const DATA_SUBJECT_RIGHTS = [
    { title: 'Confirmação e Acesso', description: 'Você pode solicitar a confirmação da existência de tratamento de seus dados pessoais e acessá-los a qualquer momento.' },
    { title: 'Correção', description: 'Solicitar a correção de dados incompletos, inexatos ou desatualizados.' },
    { title: 'Exclusão (Anonimização, Bloqueio)', description: 'Solicitar a eliminação dos dados tratados com seu consentimento, exceto nas hipóteses de guarda legal previstas em lei.' },
    { title: 'Portabilidade', description: 'Solicitar a portabilidade dos dados a outro fornecedor de serviço, observados os segredos comercial e industrial.' },
    { title: 'Revogação do Consentimento', description: 'Você pode revogar seu consentimento a qualquer momento, sem prejuízo da legalidade do tratamento realizado antes da revogação.' },
    { title: 'Informação sobre Compartilhamento', description: 'Ser informado sobre entidades públicas e privadas com as quais o controlador realizou uso compartilhado de dados.' },
];
const sectionStyle = {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '2rem 1.5rem',
    color: 'var(--cb-text-primary)',
};
const headingStyle = {
    fontFamily: 'var(--font-family-display)',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    marginBottom: '1.5rem',
};
const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.875rem',
};
const thStyle = {
    textAlign: 'left',
    padding: '0.75rem 0.5rem',
    borderBottom: '2px solid var(--color-surface-600)',
    color: 'var(--cb-text-secondary)',
    fontWeight: 600,
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
};
const tdStyle = {
    padding: '0.75rem 0.5rem',
    borderBottom: '1px solid var(--color-surface-600)',
    verticalAlign: 'top',
};
const badgeStyle = (category) => ({
    display: 'inline-block',
    padding: '0.125rem 0.5rem',
    borderRadius: '9999px',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    background: category === 'necessary' ? 'rgba(16,185,129,0.15)' :
        category === 'analytics' ? 'rgba(96,165,250,0.15)' : 'rgba(251,191,36,0.15)',
    color: category === 'necessary' ? 'var(--color-success-400)' :
        category === 'analytics' ? 'var(--color-info-400)' : 'var(--color-warning-400)',
});
function formatTimestamp(ts) {
    try {
        return new Intl.DateTimeFormat('pt-BR', {
            dateStyle: 'long', timeStyle: 'medium',
        }).format(new Date(ts));
    }
    catch {
        return ts;
    }
}
function reopenConsent() {
    try {
        const cc = window.CookieConsent;
        if (cc && typeof cc.showPreferences === 'function') {
            cc.showPreferences();
        }
    }
    catch { /* CookieConsent not loaded */ }
}
export default function PrivacyPage() {
    const [consent, setConsent] = useState(null);
    useEffect(() => {
        try {
            const raw = localStorage.getItem('cb_consent');
            if (raw)
                setConsent(JSON.parse(raw));
        }
        catch { /* ignore */ }
        const handler = () => {
            try {
                const raw = localStorage.getItem('cb_consent');
                setConsent(raw ? JSON.parse(raw) : null);
            }
            catch {
                setConsent(null);
            }
        };
        window.addEventListener('storage', handler);
        return () => window.removeEventListener('storage', handler);
    }, []);
    return (<div style={sectionStyle}>
            <Seo title="Política de Privacidade" description="Política de privacidade e proteção de dados LGPD do CryptoBingo. Saiba como tratamos seus dados pessoais, cookies e seus direitos como titular." canonical="/privacy"/>

            <h1 style={{ ...headingStyle, fontSize: '2rem' }}>
                Política de Privacidade
            </h1>
            <p style={{ color: 'var(--cb-text-secondary)', marginBottom: '2rem', fontSize: '0.875rem' }}>
                Última atualização: Julho de 2026
            </p>

            <section style={{ marginBottom: '2.5rem' }}>
                <h2 style={{ ...headingStyle, fontSize: '1.35rem' }}>1. Quem somos</h2>
                <p style={{ color: 'var(--cb-text-secondary)', lineHeight: 1.7 }}>
                    CryptoBingo é uma plataforma de BINGO GameFi operando na blockchain WAX/Antelope.
                    Nosso compromisso é com a transparência e a proteção dos dados pessoais dos nossos
                    usuários, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).
                </p>
                <p style={{ color: 'var(--cb-text-secondary)', lineHeight: 1.7, marginTop: '0.75rem' }}>
                    <strong>Controlador:</strong> CryptoBingo GameFi<br />
                    <strong>E-mail do DPO:</strong>{' '}
                    <a href="mailto:dpo@cryptobingo.bet" style={{ color: 'var(--color-brand-400)' }}>dpo@cryptobingo.bet</a>
                </p>
            </section>

            <section style={{ marginBottom: '2.5rem' }}>
                <h2 style={{ ...headingStyle, fontSize: '1.35rem' }}>2. Dados que coletamos</h2>
                <p style={{ color: 'var(--cb-text-secondary)', lineHeight: 1.7 }}>
                    Coletamos apenas os dados estritamente necessários para a operação da plataforma:
                </p>
                <ul style={{ color: 'var(--cb-text-secondary)', lineHeight: 1.7, paddingLeft: '1.25rem' }}>
                    <li><strong>Dados da carteira WAX:</strong> endereço público da wallet (coletado on-chain)</li>
                    <li><strong>Preferências:</strong> tema (claro/escuro), idioma, notificações</li>
                    <li><strong>Dados de jogo:</strong> histórico de partidas, pontuações, prêmios</li>
                    <li><strong>Dados de navegação:</strong> apenas com seu consentimento (analytics)</li>
                </ul>
            </section>

            <section style={{ marginBottom: '2.5rem' }}>
                <h2 style={{ ...headingStyle, fontSize: '1.35rem' }}>3. Cookies</h2>
                <p style={{ color: 'var(--cb-text-secondary)', lineHeight: 1.7, marginBottom: '1rem' }}>
                    Utilizamos cookies para garantir o funcionamento do site e, com seu consentimento,
                    para analisar o tráfego e personalizar sua experiência. Você pode gerenciar suas
                    preferências a qualquer momento clicando em{' '}
                    <button onClick={reopenConsent} style={{ background: 'none', border: 'none', color: 'var(--color-brand-400)', cursor: 'pointer', textDecoration: 'underline', padding: 0, font: 'inherit' }}>
                        Alterar preferências de cookies
                    </button>.
                </p>

                <div style={{ overflowX: 'auto' }}>
                    <table style={tableStyle}>
                        <thead>
                            <tr>
                                <th style={thStyle}>Cookie</th>
                                <th style={thStyle}>Finalidade</th>
                                <th style={thStyle}>Categoria</th>
                                <th style={thStyle}>Duração</th>
                            </tr>
                        </thead>
                        <tbody>
                            {COOKIE_TABLE.map(c => (<tr key={c.name}>
                                    <td style={{ ...tdStyle, fontFamily: 'var(--font-family-mono)', fontSize: '0.8rem' }}>
                                        {c.name}
                                    </td>
                                    <td style={tdStyle}>{c.purpose}</td>
                                    <td style={tdStyle}>
                                        <span style={badgeStyle(c.category)}>{c.type}</span>
                                    </td>
                                    <td style={{ ...tdStyle, color: 'var(--cb-text-secondary)', fontSize: '0.8rem' }}>
                                        {c.duration}
                                    </td>
                                </tr>))}
                        </tbody>
                    </table>
                </div>

                {consent && (<div style={{
                marginTop: '1.5rem',
                padding: '1rem',
                background: 'var(--color-surface-800)',
                borderRadius: '12px',
                border: '1px solid var(--color-surface-600)',
                fontSize: '0.8rem',
            }}>
                        <strong style={{ color: 'var(--cb-text-primary)' }}>Histórico de consentimento:</strong>
                        <ul style={{ color: 'var(--cb-text-secondary)', lineHeight: 1.6, paddingLeft: '1.25rem', marginTop: '0.5rem' }}>
                            <li>ID: <span style={{ fontFamily: 'var(--font-family-mono)' }}>{consent.consentId}</span></li>
                            <li>Data: {formatTimestamp(consent.timestamp)}</li>
                            <li>Versão: {consent.version}</li>
                            <li>Categorias: {consent.categories.length > 0 ? consent.categories.join(', ') : 'Nenhuma'}</li>
                        </ul>
                    </div>)}
            </section>

            <section style={{ marginBottom: '2.5rem' }}>
                <h2 style={{ ...headingStyle, fontSize: '1.35rem' }} id="direitos">
                    4. Transferência Internacional de Dados
                </h2>
                <p style={{ color: 'var(--cb-text-secondary)', lineHeight: 1.7 }}>
                    Caso você consinta com cookies analíticos, dados de navegação anônimos poderão ser
                    transferidos para servidores localizados nos Estados Unidos, operados pela Google LLC
                    (Google Analytics) e Microsoft Corporation (Clarity). Essas empresas participam de
                    mecanismos de conformidade com a LGPD e o GDPR para garantir a proteção adequada
                    dos dados transferidos.
                </p>
            </section>

            <section style={{ marginBottom: '2.5rem' }}>
                <h2 style={{ ...headingStyle, fontSize: '1.35rem' }}>5. Seus direitos como titular (LGPD)</h2>
                <p style={{ color: 'var(--cb-text-secondary)', lineHeight: 1.7, marginBottom: '1rem' }}>
                    A Lei nº 13.709/2018 garante a você os seguintes direitos. Para exercê-los,
                    entre em contato com nosso DPO.
                </p>
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {DATA_SUBJECT_RIGHTS.map(r => (<div key={r.title} style={{
                padding: '1rem',
                background: 'var(--color-surface-800)',
                borderRadius: '12px',
                border: '1px solid var(--color-surface-600)',
            }}>
                            <strong style={{ color: 'var(--color-accent-400)' }}>{r.title}</strong>
                            <p style={{ color: 'var(--cb-text-secondary)', fontSize: '0.875rem', marginTop: '0.3rem', lineHeight: 1.6 }}>
                                {r.description}
                            </p>
                        </div>))}
                </div>
            </section>

            <section style={{ marginBottom: '2.5rem' }}>
                <h2 style={{ ...headingStyle, fontSize: '1.35rem' }}>6. Compartilhamento de dados</h2>
                <p style={{ color: 'var(--cb-text-secondary)', lineHeight: 1.7 }}>
                    Não compartilhamos seus dados pessoais com terceiros para fins de marketing direto.
                    Os únicos compartilhamentos ocorrem:
                </p>
                <ul style={{ color: 'var(--cb-text-secondary)', lineHeight: 1.7, paddingLeft: '1.25rem' }}>
                    <li>Com serviços de infraestrutura cloud (Azure) para hospedagem</li>
                    <li>Com Google Analytics e Microsoft Clarity (mediante seu consentimento)</li>
                    <li>Com a blockchain WAX (dados de transação são públicos por natureza)</li>
                </ul>
            </section>

            <section style={{ marginBottom: '2.5rem' }}>
                <h2 style={{ ...headingStyle, fontSize: '1.35rem' }}>7. Segurança dos dados</h2>
                <p style={{ color: 'var(--cb-text-secondary)', lineHeight: 1.7 }}>
                    Adotamos medidas técnicas e organizacionais para proteger seus dados pessoais
                    contra acesso não autorizado, destruição, perda, alteração ou qualquer forma de
                    tratamento inadequado, incluindo criptografia em trânsito (TLS 1.3), hashing de
                    senhas, autenticação via blockchain WAX e controles de acesso granulares.
                </p>
            </section>

            <section style={{ marginBottom: '2.5rem' }}>
                <h2 style={{ ...headingStyle, fontSize: '1.35rem' }}>8. Contato do Encarregado (DPO)</h2>
                <p style={{ color: 'var(--cb-text-secondary)', lineHeight: 1.7 }}>
                    Para exercer seus direitos, esclarecer dúvidas ou apresentar reclamações sobre
                    o tratamento de seus dados pessoais, entre em contato com nosso Data Protection Officer:
                </p>
                <div style={{
            padding: '1rem',
            background: 'var(--color-surface-800)',
            borderRadius: '12px',
            border: '1px solid var(--color-surface-600)',
            marginTop: '0.75rem',
        }}>
                    <strong>E-mail:</strong>{' '}
                    <a href="mailto:dpo@cryptobingo.bet" style={{ color: 'var(--color-brand-400)' }}>dpo@cryptobingo.bet</a>
                    <br />
                    <strong>Prazo de resposta:</strong> até 5 dias úteis (Art. 19 §1º da LGPD)
                </div>
            </section>

            <section style={{ marginBottom: '2.5rem' }}>
                <h2 style={{ ...headingStyle, fontSize: '1.35rem' }}>9. Atualizações desta política</h2>
                <p style={{ color: 'var(--cb-text-secondary)', lineHeight: 1.7 }}>
                    Esta política pode ser atualizada periodicamente para refletir mudanças nas
                    práticas de tratamento de dados ou na legislação aplicável. Recomendamos a
                    consulta regular desta página. O consentimento armazenado será revalidado
                    caso haja alterações materiais.
                </p>
            </section>
        </div>);
}
//# sourceMappingURL=PrivacyPage.js.map