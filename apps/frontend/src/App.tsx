import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchUserProfile, updateUserLocale } from './services/api';
import { sessionKit } from './services/wharfkit';
import { Session } from '@wharfkit/session';
import type { MongoUserProfile } from '@cryptobingo/shared-types';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey'; // Adicione esta linha
import Lobby from './components/Lobby';


export default function App() {
  const { t, i18n } = useTranslation();
  
  // Estados da Aplicação
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<MongoUserProfile | null>(null);
  const [loading, setLoading] = useState(false);

  // Restaura a sessão automaticamente se o usuário já havia logado antes
  useEffect(() => {
    sessionKit.restore().then((restoredSession) => {
      if (restoredSession) {
        setSession(restoredSession);
        loadUserData(String(restoredSession.actor));
      }
    });
  }, []);

  const loadUserData = async (walletAddress: string) => {
    setLoading(true);
    try {
      const data = await fetchUserProfile(walletAddress);
      setProfile(data);
      if (data.preferences.locale !== i18n.language) {
        i18n.changeLanguage(data.preferences.locale);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const login = async () => {
    const { session } = await sessionKit.login();
    setSession(session);
    await loadUserData(String(session.actor));
  };

  const loginDev = async () => {
    setLoading(true);
    try {
      // Forçamos a criação da sessão pulando a varredura da blockchain
      const devSession = new Session({
        actor: 'jogador1.wax',
        permission: 'active',
        chain: {
          id: '8a34ec7df1b8cd06ff4a8abbaa7cc50300823350cadc59ab296cb00d104d2b8f',
          url: 'http://127.0.0.1:8888'
        },
        walletPlugin: new WalletPluginPrivateKey('5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3')
      });
      
      setSession(devSession);
      await loadUserData('jogador1.wax');
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await sessionKit.logout();
    setSession(null);
    setProfile(null);
  };

  const handleLanguageChange = async (newLocale: string) => {
    i18n.changeLanguage(newLocale);
    if (session) {
      await updateUserLocale(String(session.actor), newLocale);
    }
  };

  // TELA 1: Usuário Deslogado
  // TELA 1: Usuário Deslogado
  if (!session) {
    return (
      <div style={{ padding: '40px', fontFamily: 'sans-serif', textAlign: 'center' }}>
        <h1>{t('welcome')}</h1>
        <p>Conecte sua carteira para começar a jogar.</p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'center', marginTop: '30px' }}>
          <button 
            onClick={login}
            style={{ padding: '15px 30px', fontSize: '18px', cursor: 'pointer', background: '#0500ff', color: '#fff', border: 'none', borderRadius: '50px', width: '300px' }}
          >
            Conectar Carteira Web3
          </button>
          
          <button 
            onClick={loginDev}
            style={{ padding: '15px 30px', fontSize: '18px', cursor: 'pointer', background: '#e5e7eb', color: '#000', border: 'none', borderRadius: '50px', width: '300px' }}
          >
            🧪 Login Rápido (Local Dev)
          </button>
        </div>
      </div>
    );
  }

  // TELA 2: Carregando Perfil do Banco
  if (loading || !profile) {
    return <h2 style={{ padding: '20px', fontFamily: 'sans-serif' }}>{t('loading')}</h2>;
  }

  // TELA 3: Dashboard Principal Logado
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>{t('welcome')}</h1>
        <button onClick={logout} style={{ padding: '8px 16px', cursor: 'pointer' }}>Desconectar</button>
      </div>
      
      <div style={{ background: '#f0f0f0', padding: '15px', borderRadius: '8px' }}>
        <p><strong>{t('wallet_connected')}</strong> {profile.wallet_address}</p>
        <p><strong>Tier:</strong> {profile.progression.tier}</p>
      </div>

      <div style={{ marginTop: '20px' }}>
        <label><strong>{t('language')}: </strong></label>
        <select 
          value={i18n.language} 
          onChange={(e) => handleLanguageChange(e.target.value)}
        >
          <option value="pt-BR">Português (BR)</option>
          <option value="en-US">English (US)</option>
          <option value="zh-CN">中文 (Mandarim)</option>
        </select>
      </div>

      <h2 style={{ marginTop: '40px' }}>🎲 {t('lobby')}</h2>
      {/* O Lobby real consumindo o contrato inteligente */}
      <Lobby session={session} />
    </div>
  );
}