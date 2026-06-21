// apps/frontend/src/components/chat/SystemChatMessage.tsx
// Renderiza mensagens de sistema estruturadas (payload JSON do worker).
// Fallback para texto puro se o payload não for JSON válido.

import { Lock, Shuffle, Trophy, Target, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type SystemCode = 'GAME_LOCKED' | 'DRAW_STARTED' | 'GAME_SUMMARY';

interface SystemPayload {
    code:     SystemCode;
    tickets?: number;
    players?: number;
    winners?: number;
}

const ICON_MAP: Record<SystemCode, LucideIcon> = {
    GAME_LOCKED:  Lock,
    DRAW_STARTED: Shuffle,
    GAME_SUMMARY: Trophy,
};

function parsePayload(raw: string): SystemPayload | null {
    try {
        const obj = JSON.parse(raw);
        if (typeof obj?.code === 'string') return obj as SystemPayload;
    } catch {
        // não é JSON — renderizar como texto puro
    }
    return null;
}

interface Props {
    message: string;
}

export function SystemChatMessage({ message }: Props) {
    const { t } = useTranslation();
    const payload = parsePayload(message);

    if (!payload) {
        return (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                {message}
            </span>
        );
    }

    const Icon = ICON_MAP[payload.code] ?? Target;

    let text: string;
    switch (payload.code) {
        case 'GAME_LOCKED':
            text = (payload.tickets ?? 0) > 0
                ? t('game_room.sys_game_locked', { players: payload.players, tickets: payload.tickets })
                : t('game_room.sys_game_locked_empty');
            break;
        case 'DRAW_STARTED':
            text = t('game_room.sys_draw_started');
            break;
        case 'GAME_SUMMARY': {
            const w = payload.winners ?? 0;
            if (w === 0) {
                text = t('game_room.sys_game_summary_none');
            } else if (w === 1) {
                text = t('game_room.sys_game_summary_winners', { winners: w });
            } else {
                text = t('game_room.sys_game_summary_winners_plural', { winners: w });
            }
            break;
        }
        default:
            text = message;
    }

    return (
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Icon size={12} />
            {text}
        </span>
    );
}
