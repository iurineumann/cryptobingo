import { useState, useRef, useCallback, useEffect } from 'react';
import { useChat } from '../../hooks/useChat';
import { useTranslation } from 'react-i18next';

interface ChatFloatingProps {
    roomId:        string;
    roomName:      string;
    walletAddress: string;
}

const STORAGE_KEY = 'cryptobingo:chat:window';

interface WindowState {
    x: number;
    y: number;
    w: number;
    h: number;
}

function loadState(): WindowState | null {
    try {
        const s = localStorage.getItem(STORAGE_KEY);
        return s ? JSON.parse(s) : null;
    } catch { return null; }
}

function saveState(s: WindowState): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* quota */ }
}

function truncateWallet(w: string) {
    return w.length > 10 ? `${w.slice(0, 4)}...${w.slice(-4)}` : w;
}

const DEFAULT_W = 320;
const DEFAULT_H = 420;

export default function ChatFloating({ roomId, roomName, walletAddress }: ChatFloatingProps) {
    const { messages, loading, hasMore, sendMessage, loadMore, unread, resetUnread } = useChat({
        roomId, walletAddress,
    });

    const [open,   setOpen]   = useState(false);
    const [input,  setInput]  = useState('');
    const [pos,    setPos]    = useState<{ x: number; y: number }>(() => {
        const s = loadState();
        return s ? { x: s.x, y: s.y } : { x: window.innerWidth - DEFAULT_W - 24, y: 80 };
    });
    const [size,   setSize]   = useState<{ w: number; h: number }>(() => {
        const s = loadState();
        return s ? { w: s.w, h: s.h } : { w: DEFAULT_W, h: DEFAULT_H };
    });

    // Refs sync state atual p/ callbacks sem dep
    const posRef  = useRef(pos);  posRef.current  = pos;
    const sizeRef = useRef(size); sizeRef.current = size;

    const { t } = useTranslation();
    const listRef = useRef<HTMLDivElement>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const autoScroll = useRef(true);
    const prevLen = useRef(0);
    const winRef = useRef<HTMLDivElement>(null);

    // ── Drag ──────────────────────────────────────────────────────
    const drag     = useRef({ on: false, sx: 0, sy: 0, px: 0, py: 0 });

    const onDragMove = useCallback((e: MouseEvent) => {
        if (!drag.current.on) return;
        setPos({
            x: Math.max(0, drag.current.px + e.clientX - drag.current.sx),
            y: Math.max(0, drag.current.py + e.clientY - drag.current.sy),
        });
    }, []);

    const onDragEnd = useCallback(() => {
        drag.current.on = false;
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        const p = posRef.current;
        const s = sizeRef.current;
        saveState({ x: p.x, y: p.y, w: s.w, h: s.h });
    }, []);

    const onDragStart = useCallback((e: React.MouseEvent) => {
        const p = posRef.current;
        drag.current = { on: true, sx: e.clientX, sy: e.clientY, px: p.x, py: p.y };
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
    }, []);

    // ── Resize ────────────────────────────────────────────────────
    const resize  = useRef({ on: false, sx: 0, sy: 0, sw: 0, sh: 0 });

    const onResizeMove = useCallback((e: MouseEvent) => {
        if (!resize.current.on) return;
        setSize({
            w: Math.max(220, resize.current.sw + e.clientX - resize.current.sx),
            h: Math.max(260, resize.current.sh + e.clientY - resize.current.sy),
        });
    }, []);

    const onResizeEnd = useCallback(() => {
        resize.current.on = false;
        document.removeEventListener('mousemove', onResizeMove);
        document.removeEventListener('mouseup', onResizeEnd);
        const p = posRef.current;
        const s = sizeRef.current;
        saveState({ x: p.x, y: p.y, w: s.w, h: s.h });
    }, []);

    const onResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const s = sizeRef.current;
        resize.current = { on: true, sx: e.clientX, sy: e.clientY, sw: s.w, sh: s.h };
        document.addEventListener('mousemove', onResizeMove);
        document.addEventListener('mouseup', onResizeEnd);
    }, []);

    // Cleanup document listeners on unmount
    useEffect(() => () => {
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        document.removeEventListener('mousemove', onResizeMove);
        document.removeEventListener('mouseup', onResizeEnd);
    }, []);

    // ── Auto-scroll ───────────────────────────────────────────────
    useEffect(() => {
        if (!autoScroll.current) return;
        if (messages.length <= prevLen.current) { prevLen.current = messages.length; return; }
        prevLen.current = messages.length;
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [messages]);

    const handleScroll = useCallback(() => {
        if (!listRef.current) return;
        const el = listRef.current;
        autoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    }, []);

    // ── Infinite scroll ───────────────────────────────────────────
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel || !hasMore || loading) return;
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting && hasMore) loadMore(); },
            { root: listRef.current, threshold: 0.1 },
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMore, loading, loadMore]);

    // ── Handlers ──────────────────────────────────────────────────
    const toggle = () => {
        if (!open) resetUnread();
        setOpen(o => !o);
    };

    const handleSend = () => {
        if (!input.trim()) return;
        sendMessage(input);
        setInput('');
        autoScroll.current = true;
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    // ================================================================
    // RENDER
    // ================================================================

    return (
        <>
            {/* ── Floating Action Button (sempre canto inferior direito) ─── */}
            <button
                className={`gr-chat-fab ${unread > 0 ? 'gr-chat-fab--unread' : ''}`}
                onClick={toggle}
                aria-label={t('game_room.chat') ?? 'Chat'}
            >
                {open ? '✕' : '💬'}
                {!open && unread > 0 && (
                    <span className="gr-chat-badge">{unread > 99 ? '99+' : unread}</span>
                )}
            </button>

            {/* ── Floating Window ────────────────────────────────── */}
            {open && (
                <div
                    ref={winRef}
                    className="gr-chat-win"
                    style={{
                        left: pos.x,
                        top: pos.y,
                        width: size.w,
                        height: size.h,
                    }}
                >
                    {/* Header (drag handle) */}
                    <div className="gr-chat-win-header" onMouseDown={onDragStart}>
                        <span className="gr-chat-win-title">{roomName}</span>
                        <button
                            className="cb-btn cb-btn-ghost cb-btn-sm"
                            onClick={toggle}
                            aria-label={t('game_room.chat_close') ?? 'Fechar'}
                        >✕</button>
                    </div>

                    {/* Messages */}
                    <div ref={listRef} className="gr-chat-win-msgs" onScroll={handleScroll}>
                        {hasMore && !loading && <div ref={sentinelRef} className="gr-chat-sentinel" />}
                        {loading && hasMore && (
                            <div className="flex justify-center py-2">
                                <span className="cb-spinner w-4 h-4" />
                            </div>
                        )}

                        {messages.length === 0 && !loading && (
                            <p className="gr-chat-empty">
                                {t('game_room.chat_empty') ?? 'Nenhuma mensagem ainda. Seja o primeiro!'}
                            </p>
                        )}

                        {messages.map(msg => (
                            <div
                                key={msg.id}
                                className={
                                    `gr-chat-bubble ${
                                        msg.wallet_address === walletAddress
                                            ? 'gr-chat-bubble--own'
                                            : ''
                                    } ${
                                        msg.is_sponsor_drop ? 'gr-chat-bubble--drop' : ''
                                    }`
                                }
                            >
                                <div className="gr-chat-bubble-author">
                                    {msg.is_sponsor_drop && <span>🎁</span>}
                                    <span>
                                        {msg.wallet_address === walletAddress
                                            ? t('game_room.chat_you') ?? 'Você'
                                            : truncateWallet(msg.wallet_address)}
                                    </span>
                                </div>
                                <p className="gr-chat-bubble-text">
                                    {msg.is_sponsor_drop
                                        ? `🎉 ${t('game_room.chat_drop_prefix') ?? 'Drop!'} ${msg.message}`
                                        : msg.message}
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* Input */}
                    <div className="gr-chat-input-row">
                        <input
                            className="cb-input gr-chat-input"
                            placeholder={t('game_room.chat_placeholder') ?? 'Digite sua mensagem...'}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            maxLength={500}
                        />
                        <button
                            className="cb-btn cb-btn-primary cb-btn-sm"
                            onClick={handleSend}
                            disabled={!input.trim()}
                            aria-label={t('game_room.chat_send') ?? 'Enviar'}
                        >➤</button>
                    </div>

                    {/* Resize handle */}
                    <div className="gr-chat-resize" onMouseDown={onResizeStart} />
                </div>
            )}
        </>
    );
}
