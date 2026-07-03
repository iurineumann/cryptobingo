import { useParams, useNavigate } from 'react-router';
import { useEffect } from 'react';

const APP_URL = 'https://app.cryptobingo.bet';

export default function ReferralRedirect() {
    const { code } = useParams();
    const navigate = useNavigate();

    useEffect(() => {
        if (!code) {
            navigate(APP_URL, { replace: true });
            return;
        }
        window.location.replace(`${APP_URL}/?ref=${encodeURIComponent(code)}`);
    }, [code, navigate]);

    return (
        <div className="flex items-center justify-center min-h-screen">
            <p className="text-lg text-gray-400">Redirecionando...</p>
        </div>
    );
}
