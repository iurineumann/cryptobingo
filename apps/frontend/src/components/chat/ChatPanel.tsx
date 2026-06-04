import { useState, useEffect, useRef } from 'react';
import { Session } from '@wharfkit/session';
import { useChat } from '../../hooks/useChat';
import type { ChatMessage } from '../../hooks/useChat';

interface ChatPanelProps {
    roomId:        string;
    roomName:      string;
    session:       Session;
    walletAddress: string;
    onClose:       () => void;
}

export default function ChatPanel({ roomId, roomName, walletAddress, onClose }: ChatPanelProps) {
    const { messages, loading, sendMessage } = useChat({ roomId, walletAddress });
    const [input, setInput] = useState('');
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = () => {
        if (!input.trim()) return;
        sendMessage(input);
        setInput('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    if (loading) {
        return (
            <aside className="gr-chat" style={{ borderLeft: '1px solid var(--cb-border-default)', width: '300px', display: 'flex', flexDirection: 'column', background: 'var(--cb-bg-base)' }}>
                <div className="flex items-center justify-center flex-1">
                    <span className="cb-spinner w-6 h-6" />
                </div>
            </aside>
        );
    }

    const truncateWallet = (w: string) =>
        w.length > 10 ? `${w.slice(0, 4)}...${w.slice(-4)}` : w;

    return (
        <aside className="gr-chat" style={{
            borderLeft: '1px solid var(--cb-border-default)',
            width: '300px',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--cb-bg-base)',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.75rem', borderBottom: '1px solid var(--cb-border-default)',
            }}>
                <span className="font-bold text-sm text-[--cb-text-primary]">
                    💬 {roomName}
                </span>
                <button
                    className="cb-btn cb-btn-ghost cb-btn-sm"
                    onClick={onClose}
                    aria-label="Fechar chat"
                >✕</button>
            </div>

            {/* Messages */}
            <div ref={listRef} style={{
                flex: 1, overflowY: 'auto', padding: '0.5rem',
                display: 'flex', flexDirection: 'column', gap: '0.25rem',
            }}>
                {messages.length === 0 && (
                    <p className="text-xs text-[--cb-text-tertiary] text-center py-8">
                        Nenhuma mensagem ainda. Seja o primeiro!
                    </p>
                )}
                {messages.map(msg => (
                    <div key={msg.id} style={{
                        padding: '0.35rem 0.5rem',
                        borderRadius: '0.5rem',
                        background: msg.is_sponsor_drop
                            ? 'var(--cb-brand)'
                            : msg.wallet_address === walletAddress
                                ? 'var(--cb-bg-elevated)'
                                : 'transparent',
                        maxWidth: '90%',
                        alignSelf: msg.wallet_address === walletAddress ? 'flex-end' : 'flex-start',
                    }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.25rem',
                            fontSize: '0.6rem', fontWeight: 600,
                            color: msg.is_sponsor_drop ? '#fff' : 'var(--cb-text-tertiary)',
                            marginBottom: '0.15rem',
                        }}>
                            {msg.is_sponsor_drop && <span>🎁</span>}
                            <span>{msg.wallet_address === walletAddress ? 'Você' : truncateWallet(msg.wallet_address)}</span>
                        </div>
                        <p style={{
                            fontSize: '0.75rem', color: msg.is_sponsor_drop ? '#fff' : 'var(--cb-text-primary)',
                            wordBreak: 'break-word',
                        }}>
                            {msg.is_sponsor_drop ? `🎉 Drop! ${msg.message}` : msg.message}
                        </p>
                    </div>
                ))}
            </div>

            {/* Input */}
            <div style={{
                display: 'flex', gap: '0.5rem', padding: '0.5rem',
                borderTop: '1px solid var(--cb-border-default)',
            }}>
                <input
                    className="cb-input"
                    style={{ flex: 1, fontSize: '0.75rem', padding: '0.4rem 0.6rem' }}
                    placeholder="Digite sua mensagem..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    maxLength={500}
                />
                <button
                    className="cb-btn cb-btn-primary cb-btn-sm"
                    onClick={handleSend}
                    disabled={!input.trim()}
                >
                    ➤
                </button>
            </div>
        </aside>
    );
}
