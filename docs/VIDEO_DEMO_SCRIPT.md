# 🎬 Reality Firewall v3 — Video Demo Script (5 min)

> Para el jurado de Convergence. Narración sugerida en cada bloque.

---

## 00:00 — Intro (20s)

**Pantalla:** Terminal limpia + repositorio

**Narración:**
> "Reality Firewall v3 es un sistema autónomo de detección y respuesta a ataques de manipulación de oráculos en DeFi.
> Integra cuatro tecnologías reales: Chainlink CRE para señales verificables, x402 de Coinbase para micropagos,
> ERC-8004 para identidad del agente, y Claude AI para análisis de amenazas."

---

## 00:20 — Gateway Health Check (30s)

**Comando:**
```bash
curl http://localhost:3001/api/v1/health | jq
```

**Mostrar en pantalla:**
```json
{
  "status": "ok",
  "stack": {
    "cre": { "dataFeeds": "Sepolia (public)", "feeds": ["WETH","WBTC","LINK","USDC"] },
    "x402": { "network": "eip155:84532", "price": "1000 atomic USDC ($0.001)" },
    "erc8004": { "sepoliaIdentity": "0x8004A818..." },
    "claude": { "configured": true, "model": "claude-opus-4-6" }
  }
}
```

**Narración:**
> "El gateway está live. Vemos los 4 stacks integrados: CRE leyendo Data Feeds reales en Sepolia,
> x402 en Base Sepolia, ERC-8004 con contratos reales desplegados en enero 2026, y Claude AI configurado."

---

## 00:50 — CRE Workflow Simulation (90s)

**Comando:**
```bash
cd workflows/cre-workflow
bun run src/simulate-local.ts
```

**Mostrar outputs clave:**
```
→ EVM read latestRoundData() on 0x694AA1... (Chainlink ETH/USD Sepolia)
→ GET https://api.coingecko.com/api/v3/simple/price...
→ POST https://api.anthropic.com/v1/messages...

[RFW] Signals → divergence=0.1823% staleness=28s liquidity=$8.23M
[RFW] Risk Score=3/100 Level=SAFE Class=NOMINAL
[RFW] evidenceHash=0x3f8a9b2c...

✅ Simulation complete — evidenceHash ready for on-chain anchoring
```

**Narración:**
> "Este es el workflow de Chainlink CRE. Hace tres cosas que el hackathon exige:
> PRIMERO: lectura EVM — llama `latestRoundData()` en el Data Feed ETH/USD de Sepolia.
> SEGUNDO: llamada HTTP — obtiene el precio DEX de CoinGecko.
> TERCERO: otra llamada HTTP — le pide a Claude AI que analice la amenaza.
> El resultado es un `evidenceHash` — SHA-256 del JSON canónico RFC-8785.
> En producción, este workflow correería compilado a WASM en el DON de Chainlink."

---

## 02:20 — Frontend Demo (60s)

**Mostrar:** http://localhost:3000

**Narración:**
> "El frontend muestra el panel completo. A la izquierda: estado de las 4 integraciones.
> En el centro: el Attack Drill Studio.
> A la derecha: Live Threat Feed actualizándose cada 3 segundos con eventos simulados."

**Acción:** Click en "WETH" → Click "Run CHECK"

**Mostrar resultado:**
- Oracle price vs DEX price
- Divergencia %
- Score gauge animado
- Defense Receipt con evidenceHash

**Narración:**
> "El CHECK gratis nos da señales reales del Data Feed de Chainlink y precio DEX.
> El receipt es determinista: el mismo input siempre produce el mismo `evidenceHash`."

---

## 03:20 — Drill x402 + Payment (60s)

**Acción:** Subir slider "Price Shock" a 8% → Click "⚡ RUN DRILL"

**Mostrar:** Modal 402 con PaymentRequirements

**Narración:**
> "El drill requiere pago. Esto es HTTP 402 Payment Required del estándar x402 de Coinbase.
> El gateway devuelve los `PaymentRequirements`: red Base Sepolia, token USDC, 0.001 dólares."

**Acción:** Pegar tx hash demo → Click "PAY & CONTINUE"

**Mostrar:** Resultado con score 65+, Level HIGH, acciones REDUCE_LTV + PAUSE_BORROWS, Claude AI analysis

**Narración:**
> "El gateway verifica el tx hash en Base Sepolia — lee el log de Transfer del receipt ERC-20.
> En demo mode acepta cualquier hash bien formado. En producción verifica la transferencia real.
> Claude AI produce el análisis: 'Divergencia del 8% detectada entre Chainlink y CoinGecko...'
> El receipt queda firmado con Ed25519 por el agente ERC-8004."

---

## 04:20 — Anchor On-Chain + PolicyGuard (40s)

**Acción:** Click "ANCHOR ON SEPOLIA"

**Mostrar:** txHash + link a Etherscan

**Narración:**
> "Anclamos el `evidenceHash` al contrato `ReceiptRegistry.sol` en Sepolia.
> Cualquier protocolo DeFi puede ahora llamar `PolicyGuard.enforcePolicy()` con este hash.
> El PolicyGuard verifica que el receipt exista, que el score sea >= 50, y aplica
> cambios con límites de 'blast radius': máximo 10% de reducción de LTV por transacción."

**Mostrar rápido en Etherscan:** Evento `ReceiptAnchored` con evidenceHash, score, level

---

## 05:00 — Cierre (10s)

**Narración:**
> "Reality Firewall v3: detección verificable + micropagos atómicos + identidad onchain + enforcement limitado.
> Todo el código está en el repo. Gracias."

---

## Comandos de Preparación (antes de grabar)

```bash
# Terminal 1: Gateway
cd apps/gateway && pnpm dev

# Terminal 2: Frontend
cd apps/frontend && pnpm dev

# Terminal 3: Tener listo para CRE sim
cd workflows/cre-workflow

# .env configurado con:
# X402_DEMO_MODE=true
# ANTHROPIC_API_KEY=sk-ant-...  (opcional pero impresionante)
```

## Tips para el Video

- Usa `jq` para pretty-print en terminal
- Pantalla dividida: terminal izquierda, browser derecha
- Zoom en el evidenceHash cuando se genera — es el momento más técnicamente impresionante
- Muestra el mismo hash en el response del gateway Y en Etherscan — eso valida el claim
- Si tienes ANTHROPIC_API_KEY configurado, muestra el análisis de Claude AI en vivo
