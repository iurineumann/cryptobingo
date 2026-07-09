export VITE_RPC_URL=https://waxtestnet.greymass.com
export VITE_API_GATEWAY_URL=https://test-api.cryptobingo.bet
export VITE_WS_URL=wss://test-api.cryptobingo.bet
export VITE_WS_URL_INTERNAL=https://test-api.cryptobingo.bet
export VITE_CHAIN_ID=f16b1833c747c43682f4386fca9cbb327929334a762755ebec17f6f23c9b8a12
export VITE_CONTRACT_ACCOUNT=bingogamectr
export VITE_SWAP_CONTRACT=bingogameswp
export VITE_ATOMIC_API=https://test.api.atomicassets.io
export VITE_BINGO_TOKEN_CONTRACT=bingogametkn
export VITE_ATOMIC_COLLECTION=cryptobingo1
export VITE_ATOMIC_CONTRACT=atomicassets

pnpm --filter @cryptobingo/frontend build 2>&1 | tail -2 && \
npx -y @azure/static-web-apps-cli deploy \
  apps/frontend/dist \
  --deployment-token "e3d801aee87e9fd515e32165098cff57b8c6df89f08ec1301f67264cd757c24407-1490c693-8d5f-4576-a0a2-c75bd1afae5e01e13170c964b11e" \
  --env production \
  --app-location apps/frontend/dist
