import { useEffect, useState } from 'react';
import { Name, Session } from '@wharfkit/session';

interface LobbyProps {
  session: Session;
}

export default function Lobby({ session }: LobbyProps) {
  const [balance, setBalance] = useState<string>('0.0000 BINGO');
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    loadBlockchainData();
    // Atualiza os dados a cada 10 segundos para manter o lobby sincronizado
    const interval = setInterval(loadBlockchainData, 10000);
    return () => clearInterval(interval);
  }, [session]);

  const loadBlockchainData = async () => {
    try {
      // 1. Pesquisa o saldo do utilizador na tabela do contrato
      const balanceRes = await session.client.v1.chain.get_table_rows({
        code: 'bingo.game',
        scope: 'bingo.game',
        table: 'balances',
        lower_bound: Name.from(session.actor).value,
        upper_bound: Name.from(session.actor).value,
      });
      
      if (balanceRes.rows.length > 0) {
        setBalance(balanceRes.rows[0].balance);
      }

      // 2. Pesquisa as salas de jogo ativas
      const gamesRes = await session.client.v1.chain.get_table_rows({
        code: 'bingo.game',
        scope: 'bingo.game',
        table: 'games',
        limit: 10,
      });
      setGames(gamesRes.rows);
    } catch (error) {
      console.error("Erro ao carregar dados da blockchain:", error);
    }
  };

  const buyTicket = async (gameId: string) => {
    setLoading(true);
    try {
      const result = await session.transact({
        actions: [{
          account: 'bingo.game',
          name: 'buyticket',
          authorization: [session.permissionLevel],
          data: {
            game_id: gameId,
            buyer: session.actor,
          }
        }]
      }, { broadcast: true });
      
      alert(`🎉 Cartela comprada com sucesso! TX: ${result.response?.transaction_id}`);
      await loadBlockchainData(); // Força a atualização do saldo e do lobby
    } catch (error) {
      console.error("❌ Erro ao comprar cartela:", error);
      alert("Falha ao comprar a cartela. Verifique se possui saldo suficiente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: '30px', padding: '20px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #cbd5e1', paddingBottom: '15px', marginBottom: '15px' }}>
        <h2 style={{ margin: 0 }}>🎮 Lobby de Jogos</h2>
        <div style={{ background: '#1e293b', color: '#fff', padding: '8px 16px', borderRadius: '50px', fontWeight: 'bold' }}>
          Saldo: {balance}
        </div>
      </div>
      
      {games.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#64748b' }}>Nenhuma sala ativa encontrada no contrato no momento.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
          {games.map((game) => (
            <div key={game.game_id} style={{ background: '#ffffff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
              <h3 style={{ margin: '0 0 10px 0', color: '#0f172a' }}>Sala #{game.game_id}</h3>
              <p style={{ margin: '5px 0' }}><strong>Estado:</strong> <span style={{ textTransform: 'uppercase', color: game.status === 'funding' ? '#059669' : '#ea580c' }}>{game.status}</span></p>
              <p style={{ margin: '5px 0' }}><strong>Preço:</strong> {game.ticket_price}</p>
              <p style={{ margin: '5px 0' }}><strong>Prémio Acumulado:</strong> {game.prize_pool}</p>
              
              {game.status === 'funding' && (
                <button 
                  onClick={() => buyTicket(game.game_id)}
                  disabled={loading}
                  style={{ 
                    marginTop: '15px', width: '100%', padding: '12px', 
                    background: loading ? '#94a3b8' : '#2563eb', 
                    color: 'white', border: 'none', borderRadius: '6px', 
                    cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '16px' 
                  }}
                >
                  {loading ? 'A processar...' : 'Comprar Cartela'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}