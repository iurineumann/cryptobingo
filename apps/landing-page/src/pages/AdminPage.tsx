import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Seo from '@/components/Seo';
import Header from '@/components/Header';
import AdminLogin from '@/components/AdminLogin';
import AdminDashboard from '@/components/AdminDashboard';
import { isAdminLoggedIn } from '@/lib/store';

export default function AdminPage() {
  const { locale } = useParams();
  const lang = locale || 'en';
  // Hydration-safe: SSR renders the login form (loggedIn=false on both
  // server and first client render). We only read localStorage AFTER mount
  // via useEffect, so server and client markup match (no #418 mismatch).
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(isAdminLoggedIn());
  }, []);

  function handleLogin() {
    setLoggedIn(true);
  }

  if (!loggedIn) {
    return (
      <>
        <Seo title="Admin" description="Painel administrativo do CryptoBingo." canonical={`/${lang}/admin`} />
        <Header />
        <main id="main-content" className="mx-auto flex min-h-[60vh] max-w-md items-center px-4">
          <AdminLogin onLogin={handleLogin} />
        </main>
      </>
    );
  }

  return (
    <>
      <Seo title="Admin" description="Painel administrativo do CryptoBingo." canonical="/admin" />
      <Header />
      <AdminDashboard />
    </>
  );
}
