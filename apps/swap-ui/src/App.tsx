// apps/swap-ui/src/App.tsx
// ADR-022 — rotas do bingogameswp DEX público

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { WalletProvider } from './hooks/useWallet';
import Navbar            from './components/Navbar';
import SwapPage          from './pages/SwapPage';
import PoolPage          from './pages/PoolPage';
import AnalyticsPage     from './pages/AnalyticsPage';

export default function App() {
    return (
        <WalletProvider>
            <BrowserRouter>
                <div className="cb-page min-h-screen flex flex-col">
                    <Navbar />
                    <main className="flex-1">
                        <Routes>
                            <Route path="/"          element={<Navigate to="/swap" replace />} />
                            <Route path="/swap"      element={<SwapPage />} />
                            <Route path="/pool"      element={<PoolPage />} />
                            <Route path="/analytics" element={<AnalyticsPage />} />
                            <Route path="*"          element={<Navigate to="/swap" replace />} />
                        </Routes>
                    </main>
                </div>
            </BrowserRouter>
        </WalletProvider>
    );
}
