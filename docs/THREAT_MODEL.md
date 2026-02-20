# Reality Firewall v3: Modelo de Amenazas y Reforzamiento de Seguridad

## 1. Visión General del Sistema

Reality Firewall v3 es un sistema autónomo de orquestación de riesgos diseñado para proteger los protocolos DeFi de la manipulación de oráculos, datos obsoletos y ataques de liquidez. Integra Chainlink CRE para señales verificables, x402 para simulacros con micropagos y ERC-8004 para la identidad del agente.

## 2. Análisis de Amenazas

### 2.1 Manipulación de Oráculos

La manipulación de oráculos representa una amenaza crítica donde un atacante podría alterar el precio de un DEX para generar una divergencia falsa o enmascarar una real. Para mitigar este riesgo, Reality Firewall compara los **Chainlink Data Feeds** (fuente primaria) con múltiples fuentes de DEX (fuentes secundarias) a través de **Chainlink Runtime Environment (CRE)**. El `RiskEngine` utiliza un sistema de puntuación determinista para identificar y señalar desviaciones significativas, asegurando la integridad de los datos de precios.

### 2.2 Feeds de Datos Obsoletos

Los feeds de datos obsoletos, donde las actualizaciones se detienen durante períodos de alta volatilidad, pueden llevar a acciones incorrectas por parte del protocolo. Los flujos de trabajo de CRE están diseñados para verificar la marca de tiempo `updatedAt` de los feeds. El `RiskEngine` incorpora una penalización por obsolescencia en la puntuación de riesgo, lo que puede desencadenar acciones defensivas como `FREEZE_MARKET` si los datos se consideran demasiado antiguos para ser confiables.

### 2.3 Ejecución de Políticas No Autorizadas

Existe la amenaza de que un actor malicioso intente invocar `PolicyGuard.enforcePolicy` para congelar un mercado o modificar el LTV (Loan-to-Value) de manera indebida. Las mitigaciones implementadas son multifacéticas:

- `PolicyGuard` exige un `evidenceHash` válido que debe estar anclado en el `ReceiptRegistry`.
- El `ReceiptRegistry` solo permite que `agentId` autorizados (siguiendo el estándar ERC-8004) anclen recibos, garantizando la procedencia de las acciones.
- `PolicyGuard` incorpora **Límites de Radio de Explosión (Blast Radius Limits)**, lo que significa que el LTV y los límites de capital no pueden ajustarse más allá de los límites de seguridad predefinidos, incluso si se presenta un recibo válido. Esto previene cambios catastróficos.

### 2.4 Compromiso del Gateway

Un compromiso del Gateway Fastify podría permitir a un atacante intentar generar recibos falsos. Para contrarrestar esto, se han implementado las siguientes medidas de seguridad:

- El Gateway utiliza `helmet`, `cors` y `rate-limit` para un reforzamiento básico de la seguridad, protegiendo contra ataques comunes de la web.
- En un entorno de producción, se recomienda encarecidamente el uso de **AWS KMS** o un HSM similar para proteger la `AGENT_PRIVATE_KEY`, asegurando que las claves críticas nunca se expongan directamente.
- Todos los recibos son deterministas; cualquier alteración del JSON resultará en un `evidenceHash` diferente, lo que invalidará la verificación en cadena y frustrará los intentos de manipulación.

## 3. Lista de Verificación de Reforzamiento de Seguridad

La siguiente tabla resume las características clave de seguridad implementadas en Reality Firewall v3:

| Característica de Seguridad       | Descripción                                                                                                                               |
| :-------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------- |
| **Hashing Determinista**          | Utiliza SHA256 del JSON canonizado para recibos verificables, asegurando la inmutabilidad y la integridad de la evidencia.                 |
| **Control de Radio de Explosión** | Límites estrictos definidos en `PolicyGuard.sol` para prevenir cambios excesivos en los parámetros del protocolo, incluso con recibos válidos. |
| **Identidad del Agente**          | Cumplimiento con ERC-8004 para el anclaje de la identidad del agente, proporcionando atribución criptográfica a todas las acciones.        |
| **Gating por Micropagos (x402)**  | Implementación de x402 para requerir micropagos, previniendo ataques de denegación de servicio (DoS) en simulacros de riesgo costosos.   |
| **Tipos Estrictos (TypeScript)**  | Uso de TypeScript en modo estricto en todos los módulos para minimizar errores en tiempo de ejecución y mejorar la robustez del código.     |
| **Sin Hacks de Construcción**     | Rutas de CI/CD limpias y sin `ignoreBuildErrors`, garantizando un proceso de construcción seguro y auditable.                               |

## 4. Auditabilidad

Cada acción de riesgo en Reality Firewall v3 está respaldada por un **Recibo de Defensa**. Estos recibos poseen las siguientes propiedades fundamentales que garantizan la auditabilidad del sistema:

1.  **Verificables**: Cualquier entidad puede volver a ejecutar la lógica del `RiskEngine` con las mismas señales para obtener el mismo hash, confirmando la validez del recibo.
2.  **Inmutables**: Una vez generados, los recibos se anclan en la cadena de bloques a través del `ReceiptRegistry`, lo que garantiza su permanencia e inalterabilidad.
3.  **Atribuibles**: Cada recibo está vinculado criptográficamente a un `Agent` específico que cumple con ERC-8004, proporcionando un rastro claro de responsabilidad.
