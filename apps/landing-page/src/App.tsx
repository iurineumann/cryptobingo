import { Routes, Route, Navigate } from 'react-router-dom';
import HomePage from '@/pages/HomePage';
import IdeasPage from '@/pages/IdeasPage';
import AdminPage from '@/pages/AdminPage';

export default function App() {
    return (
        <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/ideas" element={<IdeasPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}
