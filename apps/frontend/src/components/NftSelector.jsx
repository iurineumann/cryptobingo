// apps/frontend/src/components/NftSelector.tsx
// Seletor de NFT para desconto na compra de cartelas.
// Exibido dentro do BuyTicketModal quando o jogador possui NFTs da coleção.
// Ref: SPEC.md §2.1, PROJECT-DETAILS.md §3
import { useNfts } from '../hooks/useNfts';
export default function NftSelector({ selectedId, onSelect, disabled }) {
    const { assets, loading, error } = useNfts();
    if (loading) {
        return (<div className="flex items-center gap-2 text-xs text-[--cb-text-tertiary] py-2">
                <span className="cb-spinner" style={{ width: '1rem', height: '1rem', borderWidth: '2px' }}/>
                <span>Verificando NFTs...</span>
            </div>);
    }
    if (error || assets.length === 0)
        return null;
    return (<div className="rounded-lg border border-[--cb-border-default] bg-[--cb-bg-sunken] p-3 mb-4">
            <p className="text-xs font-semibold text-[--cb-text-secondary] mb-2">
                NFT de Desconto
            </p>

            {/* Opção "Sem NFT" */}
            <label className="flex items-center gap-2 cursor-pointer mb-1.5 group">
                <input type="radio" name="nft" checked={selectedId === null} onChange={() => onSelect(null)} disabled={disabled} className="accent-[--cb-brand]" aria-label="Sem desconto NFT"/>
                <span className="text-xs text-[--cb-text-secondary] group-hover:text-[--cb-text-primary] transition-colors">
                    Sem desconto
                </span>
            </label>

            {/* Um item por NFT */}
            {assets.map((nft) => (<label key={nft.asset_id} className="flex items-center gap-2 cursor-pointer py-1 group">
                    <input type="radio" name="nft" value={nft.asset_id} checked={selectedId === nft.asset_id} onChange={() => onSelect(nft.asset_id)} disabled={disabled} className="accent-[--cb-brand]" aria-label={`NFT ${nft.name} — ${nft.backed_tokens || 'sem token lastreado'}`}/>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[--cb-text-primary] group-hover:text-[--cb-brand] transition-colors truncate">
                            {nft.schema_name} #{nft.asset_id.slice(-6)}
                        </p>
                        {nft.backed_tokens && (<p className="text-[10px] text-[--cb-text-tertiary] font-mono">
                                {nft.backed_tokens}
                            </p>)}
                    </div>
                    {selectedId === nft.asset_id && (<span className="cb-badge cb-badge-success text-[10px] flex-shrink-0">
                            Selecionado
                        </span>)}
                </label>))}
        </div>);
}
//# sourceMappingURL=NftSelector.js.map