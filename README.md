# Demo: Svelte + Pali Wallet (Ethers.js)

Demo práctica del curso **Sistemas Distribuidos (SID)**. Conecta una dApp construida con **Svelte** a la extensión de navegador **Pali Wallet**, usando **Ethers.js v6**, para:

- 🔐 Iniciar sesión (conectar la wallet)
- 📬 Leer la dirección (address) conectada
- 💰 Leer el saldo nativo de esa dirección

## ¿Por qué no se usa Remix?

Remix IDE se usa para **escribir, compilar y desplegar contratos inteligentes (Solidity)**. Esta demo no despliega ningún contrato: solo consume el **proveedor EVM** que Pali inyecta en el navegador (`window.ethereum`) para leer datos on-chain de solo lectura (dirección y saldo). Por eso el desarrollo se hace como cualquier proyecto frontend (Svelte + Vite), no en Remix.

## Requisitos previos

- Node.js 18+ y npm
- Extensión de **Pali Wallet** instalada en el navegador y con una cuenta creada (ya la tienes)
- Pali configurada en alguna red EVM (ej. Ethereum Sepolia, Rollux, etc.)

> Nota: la dApp detecta la wallet **solo de Pali** mediante EIP-6963 (buscando el proveedor anunciado como "pali"), por lo que no usa MetaMask aunque tengas otras extensiones instaladas.

## Instalación

```bash
git clone <URL_DE_TU_REPOSITORIO>
cd pali-wallet-demo
npm install
```

## Ejecutar en desarrollo

```bash
npm run dev
```

Abre la URL que muestra la terminal (por defecto `http://localhost:5173`), haz clic en **"Conectar con Pali Wallet"**, autoriza la conexión en el popup de la extensión, y verás tu dirección, saldo y red activa.

## Estructura del proyecto

```
pali-wallet-demo/
├── index.html
├── src/
│   ├── App.svelte        # UI: botón de conexión, address, saldo, red
│   ├── main.js            # entry point de Svelte
│   └── lib/
│       └── wallet.js      # lógica de conexión con Ethers.js (BrowserProvider)
├── package.json
└── vite.config.js
```

## Cómo funciona (resumen técnico)

1. Pali Wallet se descubre mediante **EIP-6963**: la extensión anuncia su proveedor EVM y la dApp filtra el que se identifica como "pali" (evitando así cualquier otra wallet como MetaMask). Solo como respaldo para versiones antiguas, se usa `window.ethereum` si el marcador `window.pali` confirma que la extensión es de Pali. Ver [documentación oficial de Pali](https://docs.paliwallet.com/docs/developers/provider-discovery).
2. `ethers.BrowserProvider(window.ethereum)` envuelve ese proveedor inyectado.
3. `provider.send("eth_requestAccounts", [])` dispara el popup de Pali pidiendo autorización de conexión.
4. `provider.getSigner()` + `signer.getAddress()` obtienen la cuenta activa.
5. `provider.getBalance(address)` lee el saldo en wei, y `ethers.formatEther()` lo convierte a unidades legibles.
6. Se escuchan los eventos `accountsChanged` y `chainChanged` para reaccionar si el usuario cambia de cuenta o de red dentro de la extensión.

## Build de producción

```bash
npm run build
npm run preview
```

## Autor

Proyecto individual — Curso Sistemas Distribuidos (SID), actividad de dApps con blockchain.
