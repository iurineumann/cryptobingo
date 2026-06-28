// apps/frontend/src/components/gameroom/GameRoomHeader.tsx
// Navbar da sala de jogo: logo, crumb de status, saldo in-game, seletor de idioma,
// indicador WS e menu dropdown de navegação.
// Extraído de GameRoom.tsx (Fase 0 do refactor — sem mudança de comportamento).

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { BlockchainGameState, BlockchainBalance } from '@cryptobingo/shared-types';
import type { EnrichedRoom } from '../../services/api';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import Logo from '../Logo';
import { STATUS_DOT, WS_STATUS_CLASS } from './useGameRoomState';

export interface GameRoomHeaderProps {
  gameId: string;
  room: EnrichedRoom | null;
  game: BlockchainGameState | null;
  effectiveDisplayStatus: string;
  gameStatusText: string;
  timeRemaining: string;
  isDrawing: boolean;
  isAborted: boolean;
  ingameBalances: BlockchainBalance[];
  wsStatus: string;
  onlineCount: number;
  isAdmin?: boolean;
  theme?: 'dark' | 'light';
  onLeave: () => void;
  onGoToHistory?: () => void;
  onGoToWallet?: () => void;
  onGoToAdmin?: () => void;
  onToggleTheme?: () => void;
  onLogout?: () => void;
  onLanguageChange?: (locale: string) => void;
}

export default function GameRoomHeader(props: GameRoomHeaderProps): React.JSX.Element {
  const {
    gameId, room, game,
    effectiveDisplayStatus, gameStatusText, timeRemaining,
    isDrawing, isAborted, ingameBalances, wsStatus,
    onlineCount, isAdmin, theme,
    onLeave, onGoToHistory, onGoToWallet, onGoToAdmin,
    onToggleTheme, onLogout, onLanguageChange,
  } = props;

  const { t, i18n } = useTranslation();
  const wsStatusClass = WS_STATUS_CLASS;

  return (
    <header className="gr-navbar" data-testid="gr-room-header">

      {/* ── Esquerda: logo + crumb ── */}
      <div className="gr-nav-left">
        <Logo variant="icon" height={28} onClick={onLeave} alt="Voltar ao Lobby" />
        <div>
          <div className="gr-nav-crumb">
            <span className="sep">/</span>
            <span className="room">
              {room?.metadata?.name || (room ? `Sala ${room.room_id}` : `#${gameId}`)}
            </span>
            {game && (
              <span data-testid="gr-game-status" data-status={effectiveDisplayStatus} className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-[--cb-bg-elevated] border border-[--cb-border-default] text-[--cb-text-secondary] inline-flex items-center gap-1">
                {effectiveDisplayStatus && <span className="lobby-status-dot" style={{ background: STATUS_DOT[effectiveDisplayStatus] }} />}
                {gameStatusText}
              </span>
            )}
            {timeRemaining && (
              <span className="text-xs font-mono font-bold text-[--cb-accent] bg-[--cb-bg-elevated] px-2 py-0.5 rounded-md border border-[--cb-border-default]">
                {timeRemaining}
              </span>
            )}
            {isDrawing && <span className="gr-live">{t('game_room.badge_live')}</span>}
            {isAborted && <span className="cb-status-aborted">{t('game_room.badge_aborted')}</span>}
          </div>
          {room?.metadata?.description && (
            <div className="gr-nav-desc" data-testid={`gr-desc-${room.room_id}`}>
              {room.metadata.description}
            </div>
          )}
        </div>
      </div>

      {/* ── Direita: saldo + chat + status WS + idioma + menu ── */}
      <div className="gr-nav-right">

        {/* Saldo in-game */}
        {ingameBalances.length > 0 && (
          <span
            className="lobby-wallet-chip"
            title={t('lobby.balance_aria')}
            style={{ fontSize: '0.72rem' }}
          >
            <span className="symbol" aria-hidden="true">◆</span>
            {ingameBalances.map((b, i) => (
              <span key={i} style={i > 0 ? { borderLeft: '1px solid var(--cb-border-subtle)', paddingLeft: '0.4rem', marginLeft: '0.2rem' } : {}}>
                {b.balance.quantity}
              </span>
            ))}
          </span>
        )}

        {/* Seletor de idioma */}
        <select
          value={i18n.language}
          onChange={e => { i18n.changeLanguage(e.target.value); onLanguageChange?.(e.target.value); }}
          className="h-8 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label={t('common.language') ?? 'Idioma'}
        >
          <option value="pt-BR">PT</option>
          <option value="en-US">EN</option>
          <option value="zh-CN">中</option>
        </select>

        {/* Online count */}
        <span className="gr-online" data-testid="gr-online-count">
          <span className="dot" aria-hidden="true" />
          {t('game_room.social_online', { count: onlineCount })}
        </span>

        {/* Status WS */}
        <span
          className={`cb-status-dot ${wsStatusClass[wsStatus] ?? 'cb-status-dot-offline'}`}
          title={t('game_room.ws_title', { status: wsStatus })}
          aria-label={t('game_room.ws_aria', { status: wsStatus })}
        />

        {/* Menu dropdown ⋮ */}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Menu" />}>
            ⋮
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem data-testid="gr-nav-lobby" onClick={onLeave}>
              🏠 {t('game_room.back_to_lobby')}
            </DropdownMenuItem>
            {onGoToHistory && (
              <DropdownMenuItem data-testid="gr-nav-history" onClick={onGoToHistory}>
                📋 {t('nav.my_history') ?? 'Histórico'}
              </DropdownMenuItem>
            )}
            {onGoToWallet && (
              <DropdownMenuItem data-testid="gr-nav-wallet" onClick={onGoToWallet}>
                💳 {t('nav.wallet') ?? 'Carteira'}
              </DropdownMenuItem>
            )}
            {isAdmin && onGoToAdmin && (
              <DropdownMenuItem data-testid="gr-nav-admin" onClick={onGoToAdmin}>
                ⚙ Admin
              </DropdownMenuItem>
            )}
            {onToggleTheme && (
              <DropdownMenuItem onClick={onToggleTheme}>
                {theme === 'dark' ? '☾' : '☀'} {theme === 'dark' ? t('nav.theme_light') : t('nav.theme_dark')}
              </DropdownMenuItem>
            )}
            {onLogout && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onLogout}>
                  ⏻ {t('nav.logout') ?? 'Desconectar'}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

      </div>
    </header>
  );
}
