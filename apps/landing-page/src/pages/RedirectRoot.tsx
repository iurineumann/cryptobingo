import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function RedirectRoot() {
  const navigate = useNavigate();

  useEffect(() => {
    const locale = navigator.language?.startsWith('pt') ? 'pt' : navigator.language?.startsWith('zh') ? 'zh' : 'en';
    navigate(`/${locale}`, { replace: true });
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-surface-950">
      <p className="text-slate-400">Redirecionando...</p>
    </div>
  );
}
