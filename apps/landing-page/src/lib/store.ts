const ADMIN_TOKEN_KEY = 'cb_admin_token';

export function getAdminToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string): void {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export function isAdminLoggedIn(): boolean {
    const token = getAdminToken();
    return token !== null && token.length > 0;
}
