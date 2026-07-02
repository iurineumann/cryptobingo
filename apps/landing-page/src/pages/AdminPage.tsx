import { useState } from 'react';
import Header from '@/components/Header';
import AdminLogin from '@/components/AdminLogin';
import AdminDashboard from '@/components/AdminDashboard';
import { isAdminLoggedIn } from '@/lib/store';

export default function AdminPage() {
    const [tick, setTick] = useState(0);

    function handleLogin() {
        setTick((n) => n + 1);
    }

    if (!isAdminLoggedIn()) {
        return (
            <>
                <Header />
                <main className="mx-auto flex min-h-[60vh] max-w-md items-center px-4">
                    <AdminLogin onLogin={handleLogin} />
                </main>
            </>
        );
    }

    return (
        <>
            <Header />
            <AdminDashboard key={tick} />
        </>
    );
}
