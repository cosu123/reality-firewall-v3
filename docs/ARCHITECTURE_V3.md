# Reality Firewall v3: Arquitectura de Orquestación de Riesgo Senior

## 1. Introducción

Reality Firewall v3 representa la evolución de los sistemas de monitoreo reactivos hacia una infraestructura de **Defensa-como-Servicio (DaaS)** autónoma y determinista. Esta versión implementa estándares institucionales para garantizar la integridad, procedencia y auditabilidad de cada decisión de riesgo tomada por el sistema.

## 2. Pilares de la Arquitectura

### 2.1 Integridad Criptográfica (EIP-712)

A diferencia de las versiones anteriores que dependían únicamente de hashes SHA-256, la V3 introduce firmas **EIP-712**. Cada "Defense Receipt" generado por el Gateway es firmado criptográficamente por un Agente autorizado (ERC-8004). Esto permite:
- **No Repudio**: El agente no puede negar haber generado una alerta de riesgo.
- **Verificación On-chain**: Los contratos inteligentes pueden validar la autenticidad de la firma antes de ejecutar acciones defensivas.
- **Estructura Legible**: Los datos firmados siguen un esquema tipado que es legible tanto por humanos como por máquinas.

### 2.2 Orquestación de Señales Determinista (Chainlink CRE)

El sistema utiliza **Chainlink Runtime Environment (CRE)** para orquestar señales de múltiples fuentes:
- **Fuentes Primarias**: Chainlink Data Feeds en Sepolia para precios de referencia de alta fidelidad.
- **Fuentes Secundarias**: APIs de DEX (Coingecko/Uniswap) para detectar desviaciones de mercado en tiempo real.
- **Lógica de Consenso**: El `RiskEngine` procesa estas señales de forma determinista, asegurando que los mismos datos de entrada siempre produzcan el mismo `evidenceHash`.

### 2.3 Defensa en Profundidad y Radio de Explosión

La seguridad no depende de un solo componente. Se implementa una estrategia de capas:
1.  **Gateway Hardened**: Uso de `helmet`, `cors` y `rate-limit` con configuraciones de producción.
2.  **Validación de Recibos**: El `ReceiptRegistry.sol` actúa como la fuente de verdad para la evidencia de riesgo.
3.  **PolicyGuard con Límites**: Incluso con un recibo válido, el `PolicyGuard.sol` impone límites estrictos (**Blast Radius**) sobre cuánto se puede ajustar un parámetro (LTV, Caps) en una sola transacción, previniendo manipulaciones extremas.

## 3. Flujo de Operación Institucional

| Paso | Componente | Acción | Resultado |
| :--- | :--- | :--- | :--- |
| 1 | **Frontend** | Solicitud de "Premium Drill" | Activación de flujo x402 |
| 2 | **Gateway** | Orquestación CRE | Captura de señales y cálculo de score |
| 3 | **RiskEngine** | Generación de Recibo | JSON Canonizado (RFC 8785) + Firma EIP-712 |
| 4 | **Blockchain** | `anchorReceiptWithSignature` | Evidencia inmutable y verificable on-chain |
| 5 | **Protocolo** | `enforcePolicy` | Ajuste de parámetros dentro de límites seguros |

## 4. Conclusión

Reality Firewall v3 no es solo una herramienta de monitoreo; es una capa de confianza criptográfica que permite a los protocolos DeFi escalar de forma segura, automatizando la respuesta ante crisis con el rigor técnico de una institución financiera de primer nivel.
