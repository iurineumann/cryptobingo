import { useState } from 'react';
import { useParams } from 'react-router-dom';
import Seo from '@/components/Seo';
import Header from '@/components/Header';
import AdminLogin from '@/components/AdminLogin';
import AdminDashboard from '@/components/AdminDashboard';
import { isAdminLoggedIn } from '@/lib/store';

export default function AdminPage() {
    const { locale } = useParams();
    const lang = locale || 'en';
    const [tick, setTick] = useState(0);

    function handleLogin() {
        setTick((n) => n + 1);
    }

    if (!isAdminLoggedIn()) {
        return (
            <>
<Seo title="Admin" description="Painel administrativo do CryptoBingo." canonical={`/${lang}/admin`} />
                <Header />
                <main className="mx-auto flex min-h-[60vh] max-w-md items-center px-4">
                    <AdminLogin onLogin={handleLogin} />
                </main>
            </>
        );
    }

    return (
        <>
            <Seo title="Admin" description="Painel administrativo do CryptoBingo." canonical="/admin" />
            <Header />
            <AdminDashboard key={tick} />
        </>
    );
}
