<script>
  import { onMount, onDestroy } from "svelte";
  import {
    Copy,
    Check,
    RefreshCw,
    LogOut,
    ArrowUpRight,
    PlugZap,
    Send,
    Signature,
    ExternalLink,
  } from "@lucide/svelte";
  import {
    hasInjectedProvider,
    connectWallet,
    getBalance,
    getNetwork,
    getBlockInfo,
    getExplorerUrl,
    estimateTransfer,
    sendNative,
    signMessage,
    subscribeToWalletEvents,
    getNetworksSortedByBalance,
    switchNetwork,
    getPaliProvider,
    EVM_NETWORKS,
  } from "./lib/wallet.js";
  import { isAddress, parseEther, BrowserProvider } from "ethers";

  let address = "";
  let balance = "";
  let networkName = "";
  let chainId = "";
  let blockNumber = null;
  let gasGwei = null;
  let isConnected = false;
  let isLoading = false;
  let errorMsg = "";
  let copied = false;

  let txTo = "";
  let txAmount = "";
  let txHash = "";
  let txError = "";
  let isSending = false;

  let signature = "";
  let sigError = "";
  let isSigning = false;

  let paliAvailable = null;

  let providerRef = null;
  let signerRef = null;
  let unsubscribe = () => {};

  let explorerUrl = "";

  // Ranking EVM de mayor a menor saldo
  let rankedNetworks = [];
  let isRanking = false;
  let rankingError = "";

  // Cambio de red desde UI
  let selectedChainId = "";
  let isSwitching = false;
  let switchError = "";

  onMount(async () => {
    paliAvailable = await hasInjectedProvider();
  });

  $: machineState = isLoading ? "sync" : isConnected ? "live" : "off";

  $: statusWord = isLoading
    ? "CONECTANDO"
    : isConnected
      ? "CONECTADO"
      : paliAvailable === null
        ? "DETECTANDO"
        : paliAvailable === false
          ? "AUSENTE"
          : "INACTIVO";

  async function refreshBalance() {
    if (!providerRef || !address) return;
    balance = await getBalance(providerRef, address);
  }

  async function refreshMeta() {
    if (!providerRef || !chainId) return;
    const info = await getBlockInfo(providerRef);
    blockNumber = info.number;
    gasGwei = info.gasPriceGwei;
    explorerUrl = getExplorerUrl(chainId, "address", address) ?? "";
  }

  async function loadRanking() {
    if (!address) return;
    isRanking = true;
    rankingError = "";
    try {
      rankedNetworks = await getNetworksSortedByBalance(address);
    } catch (err) {
      rankingError = err.message || "ERROR AL CARGAR RANKING";
    } finally {
      isRanking = false;
    }
  }

  async function handleSwitchNetwork(targetChainId) {
    const cid = targetChainId ?? selectedChainId;
    if (!cid) return;
    switchError = "";
    isSwitching = true;
    try {
      await switchNetwork(cid);
      // La wallet emite chainChanged; actualizamos provider/signer/estado sin recargar
      // Reconstruir BrowserProvider para reflejar nueva cadena
      try {
        const injected = await getPaliProvider();
        providerRef = new BrowserProvider(injected);
        signerRef = await providerRef.getSigner();
      } catch {}
      const net = await getNetwork(providerRef);
      chainId = net.chainId;
      networkName = net.name;
      await Promise.all([refreshBalance(), refreshMeta()]);
    } catch (err) {
      // 4001 = usuario rechazó
      if (err?.code === 4001) switchError = "CAMBIO RECHAZADO POR EL USUARIO";
      else switchError = (err.message || "ERROR AL CAMBIAR DE RED").toUpperCase();
    } finally {
      isSwitching = false;
    }
  }

  async function handleConnect() {
    errorMsg = "";
    isLoading = true;
    try {
      const { provider, signer, address: addr } = await connectWallet();
      providerRef = provider;
      signerRef = signer;
      address = addr;
      isConnected = true;

      const net = await getNetwork(provider);
      chainId = net.chainId;
      networkName = net.name;

      await Promise.all([refreshBalance(), refreshMeta()]);
      // Categorizar todas las EVM networks de mayor a menor saldo
      await loadRanking();

      unsubscribe = subscribeToWalletEvents({
        onAccountsChanged: async (accounts) => {
          if (accounts.length === 0) {
            handleDisconnect();
          } else {
            address = accounts[0];
            await Promise.all([refreshBalance(), refreshMeta(), loadRanking()]);
          }
        },
        onChainChanged: async (hexChainId) => {
          // Actualizar estado sin recargar la página
          try {
            // hexChainId viene como "0x..." desde EIP-1193
            const dec = hexChainId ? BigInt(hexChainId).toString() : chainId;
            chainId = dec;
            // Reconstruir provider para evitar cache de red en ethers
            try {
              const injected = await getPaliProvider();
              providerRef = new BrowserProvider(injected);
              signerRef = await providerRef.getSigner();
            } catch {}
            const net = await getNetwork(providerRef);
            chainId = net.chainId;
            networkName = net.name;
            await Promise.all([refreshBalance(), refreshMeta()]);
          } catch {
            window.location.reload();
          }
        },
      });
    } catch (err) {
      errorMsg = err.message || "No se pudo conectar con la wallet.";
    } finally {
      isLoading = false;
    }
  }

  function handleDisconnect() {
    isConnected = false;
    address = "";
    balance = "";
    providerRef = null;
    signerRef = null;
    blockNumber = null;
    gasGwei = null;
    explorerUrl = "";
    txTo = "";
    txAmount = "";
    txHash = "";
    txError = "";
    signature = "";
    sigError = "";
    rankedNetworks = [];
    rankingError = "";
    isRanking = false;
    copied = false;
    unsubscribe();
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {}
  }

  function copyAddress() {
    return copyText(address);
  }

  async function refreshAll() {
    await Promise.all([refreshBalance(), refreshMeta(), loadRanking()]);
  }

  async function handleSend() {
    txHash = "";
    txError = "";

    if (!providerRef || !signerRef || !chainId) {
      txError = "SIN PROVEEDOR ACTIVO";
      return;
    }
    if (!isAddress(txTo)) {
      txError = "DIRECCIÓN DE DESTINO INVÁLIDA";
      return;
    }
    let amountWei;
    try {
      amountWei = parseEther(txAmount);
      if (amountWei <= 0n) throw new Error();
    } catch {
      txError = "MONTO INVÁLIDO — USA FORMATO DECIMAL (0.0)";
      return;
    }

    isSending = true;
    try {
      const balWei = await providerRef.getBalance(address);
      const gas = await estimateTransfer(signerRef, txTo, amountWei);
      const feeData = await providerRef.getFeeData();
      const price = feeData.gasPrice ?? 0n;
      const total = amountWei + gas * price;
      if (total > balWei) {
        txError = "SALDO INSUFICIENTE PARA MONTO + GAS";
        return;
      }
      txHash = await sendNative(signerRef, txTo, amountWei);
      await refreshBalance();
    } catch (err) {
      txError = err.message || "FALLO EN LA TRANSFERENCIA";
    } finally {
      isSending = false;
    }
  }

  async function handleSign() {
    sigError = "";
    signature = "";
    if (!signerRef) return;

    isSigning = true;
    try {
      const payload = `SID-22 AUTENTICACIÓN\n${address}\n${Date.now()}`;
      signature = await signMessage(signerRef, payload);
    } catch (err) {
      sigError = err.message || "FIRMA RECHAZADA";
    } finally {
      isSigning = false;
    }
  }

  onDestroy(() => unsubscribe());
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<main class="spec">
  <header class="bar bar--top">
    <span class="bar__id"><i></i>SID_22 · SISTEMAS DISTRIBUIDOS LAB</span>
    <span class="mono dim">PALI CONNECT — VERSIÓN 0.1</span>
  </header>

  <section class="stage">
    <div class="plane">
      <div class="plane__grid"></div>

      <p class="mono plane__coord plane__coord--tl">51.5072°N / 0.1276°W</p>
      <p class="mono plane__coord plane__coord--tr">NODO 04</p>

      <div class="machine" data-state={machineState}>
        <svg viewBox="0 0 240 240" aria-hidden="true">
          <circle class="r r--outer" cx="120" cy="120" r="112" />
          <circle class="r r--mid" cx="120" cy="120" r="82" />
          <circle class="r r--inner" cx="120" cy="120" r="52" />
          <circle class="a a--1" cx="120" cy="120" r="98" />
          <circle class="a a--2" cx="120" cy="120" r="65" />
          <circle class="a a--3" cx="120" cy="120" r="26" />
          <circle class="core" cx="120" cy="120" r="5" />
        </svg>
        <div class="machine__readout">
          <span class="machine__title">{statusWord}</span>
          <span class="mono machine__sub">
            {#if isConnected}
              {networkName.toUpperCase()} / {chainId}
            {:else}
              EN BUSCA DE UN PROVEEDOR
            {/if}
          </span>
        </div>
      </div>

      <p class="mono plane__coord plane__coord--bl">EIP-6963 · EIP-1193</p>
      <p class="mono plane__coord plane__coord--br">ETHERS v6</p>
    </div>

    <section class="ctrl">
      <div class="row">
        <span class="row__k monodim">ESTADO</span>
        <span class="row__v">
          <i class="led" data-state={machineState}></i>
          <span class="mono">{statusWord}</span>
          <span class="mono dim">{isConnected ? "AUTORIZADO" : "DESBLOQUEADO"}</span>
        </span>
      </div>

      {#if paliAvailable === false}
        <div class="row row--alert">
          <span class="mono row__k">ERROR_01</span>
          <span class="row__v mono alert__msg">
            PALI WALLET AUSENTE — INSTALA LA EXTENSIÓN Y RECARGA ESTE ORIGEN
          </span>
        </div>
      {:else if !isConnected}
        <div class="row row--grow">
          <span class="row__k monodim">SESIÓN</span>
          <div class="row__v row__stack">
            <h1 class="wut">
              SIN<br />
              SESIÓN
            </h1>
            <p class="mono dim desc">
              CONECTA UNA PALI WALLET PARA EXPONER UNA CUENTA, UN SIGNER Y UNA
              CADENA ACTIVA A ESTE ORIGEN.
            </p>
            {#if errorMsg}
              <p class="mono err">X {errorMsg.toUpperCase()}</p>
            {/if}
            <button
              class="cta"
              on:click={handleConnect}
              disabled={isLoading || paliAvailable === null}
            >
              <span class="cta__label">{isLoading ? "CONECTANDO" : "CONECTAR"}</span>
              <span class="cta__icon"><PlugZap size={18} /></span>
            </button>
          </div>
        </div>
      {:else}
        <div class="row">
          <span class="row__k monodim">CUENTA</span>
          <span class="row__v row__acct">
            <span class="mono addr">{address}</span>
            {#if explorerUrl}
              <a
                class="copy"
                href={explorerUrl}
                target="_blank"
                rel="noreferrer"
                title="VER EN EXPLORADOR"
              >
                <ExternalLink size={15} />
              </a>
            {/if}
            <button class="copy" on:click={copyAddress} title="COPIAR">
              {#if copied}
                <Check size={15} />
              {:else}
                <Copy size={15} />
              {/if}
            </button>
          </span>
        </div>

        <div class="row">
          <span class="row__k monodim">SALDO</span>
          <span class="row__v row__wt">
            <span class="wt">{balance}</span>
            <ArrowUpRight class="wt__arrow" size={22} />
          </span>
        </div>

        <div class="row">
          <span class="row__k monodim">RED</span>
          <div class="row__v row__stack">
            <span class="mono net">
              {networkName.toUpperCase()}
              <span class="dim">/ {chainId}</span>
            </span>
            <span class="mono meta">
              BLOQUE {blockNumber ?? "--"} · GAS {gasGwei ?? "--"} GWEI
            </span>
            <div class="switch-row">
              <select
                class="fld mono fld--select"
                bind:value={selectedChainId}
                disabled={isSwitching}
              >
                <option value="">SELECCIONA RED PARA CAMBIAR</option>
                {#each EVM_NETWORKS as net}
                  <option value={net.chainId}>{net.name.toUpperCase()} / {net.chainId}</option>
                {/each}
              </select>
              <button
                class="ops ops--solid ops--mini"
                on:click={() => handleSwitchNetwork()}
                disabled={isSwitching || !selectedChainId}
                title="Cambiar de red sin abrir Pali manualmente"
              >
                {isSwitching ? "CAMBIANDO…" : "CAMBIAR"}
              </button>
            </div>
            {#if switchError}
              <p class="mono err">X {switchError}</p>
            {:else if isSwitching}
              <span class="mono meta">SOLICITANDO CAMBIO A LA WALLET…</span>
            {/if}
          </div>
        </div>

        <div class="row">
          <span class="row__k monodim">RANKING EVM</span>
          <div class="row__v row__stack">
            <div class="ranking-head">
              <span class="mono meta">ORDENADO DE MAYOR A MENOR SALDO</span>
              <button class="ops ops--mini" on:click={loadRanking} disabled={isRanking}>
                <RefreshCw size={12} />
                {isRanking ? "CARGANDO" : "ACTUALIZAR"}
              </button>
            </div>
            {#if isRanking}
              <span class="mono meta">CONSULTANDO RPCs…</span>
            {:else if rankingError}
              <p class="mono err">X {rankingError}</p>
            {:else if rankedNetworks.length === 0}
              <span class="mono meta">SIN DATOS — PULSA ACTUALIZAR</span>
            {:else}
              <ol class="ranking">
                {#each rankedNetworks as net, i}
                  <li
                    class="ranking__item"
                    class:ranking__item--top={i === 0 && net.balanceWei !== 0n}
                    class:ranking__item--zero={net.balanceWei === 0n}
                    class:ranking__item--active={net.chainId === chainId}
                  >
                    <span class="ranking__pos mono">{String(i + 1).padStart(2, "0")}</span>
                    <span class="ranking__net">
                      <span class="mono ranking__name">{net.name.toUpperCase()}</span>
                      <span class="mono dim ranking__chain">/ {net.chainId} · {net.symbol}</span>
                      {#if net.chainId === chainId}
                        <span class="mono" style="font-size:0.55rem;color:#34d399"> · ACTIVA</span>
                      {/if}
                      {#if net.error}
                        <span class="mono err" style="font-size: 0.55rem" title={net.error}> · {net.errorShort ?? "RPC no disponible"}</span>
                      {/if}
                    </span>
                    <span class="ranking__bal mono">{net.balance} {net.symbol}</span>
                    {#if net.chainId !== chainId}
                      <button
                        class="mini"
                        on:click={() => handleSwitchNetwork(net.chainId)}
                        disabled={isSwitching}
                        title="Cambiar a {net.name} sin ir a Pali"
                      >
                        <ArrowUpRight size={12} />
                      </button>
                    {:else}
                      <span class="mini" style="opacity:0.35;pointer-events:none" title="Red activa">
                        <Check size={12} />
                      </span>
                    {/if}
                    {#if net.explorer}
                      <a
                        class="mini"
                        href="{net.explorer}/address/{address}"
                        target="_blank"
                        rel="noreferrer"
                        title="VER EN EXPLORADOR"
                      >
                        <ExternalLink size={12} />
                      </a>
                    {/if}
                  </li>
                {/each}
              </ol>
            {/if}
          </div>
        </div>

        <div class="row">
          <span class="row__k monodim">TRANSFERENCIA</span>
          <div class="row__v row__stack">
            <input
              class="fld mono"
              bind:value={txTo}
              placeholder="DESTINO 0x…"
              spellcheck="false"
            />
            <div class="flds">
              <input
                class="fld mono"
                bind:value={txAmount}
                placeholder="MONTO (ETH/SYS) 0.0"
                spellcheck="false"
              />
              <button
                class="ops ops--solid"
                on:click={handleSend}
                disabled={isSending}
              >
                {#if isSending}
                  ENVIANDO
                {:else}
                  <Send size={15} /> ENVIAR
                {/if}
              </button>
            </div>
            {#if txHash}
              <div class="tx-line">
                <span class="mono addr dim">
                  TX {txHash.slice(0, 12)}…{txHash.slice(-8)}
                </span>
                <div class="tx-line__ops">
                  {#if getExplorerUrl(chainId, "tx", txHash)}
                    <a
                      class="mini"
                      href={getExplorerUrl(chainId, "tx", txHash)}
                      target="_blank"
                      rel="noreferrer"
                      title="VER TX EN EXPLORADOR"
                    >
                      <ExternalLink size={13} />
                    </a>
                  {/if}
                  <button class="mini" on:click={() => copyText(txHash)} title="COPIAR TX">
                    {#if copied}
                      <Check size={13} />
                    {:else}
                      <Copy size={13} />
                    {/if}
                  </button>
                </div>
              </div>
            {/if}
            {#if txError}
              <p class="mono err">X {txError}</p>
            {/if}
          </div>
        </div>

        <div class="row">
          <span class="row__k monodim">FIRMA</span>
          <div class="row__v row__stack">
            <button class="ops" on:click={handleSign} disabled={isSigning}>
              <Signature size={15} />
              {isSigning ? "FIRMANDO" : "FIRMAR PAYLOAD"}
            </button>
            {#if signature}
              <div class="tx-line">
                <span class="mono addr dim">
                  SIG {signature.slice(0, 16)}…{signature.slice(-8)}
                </span>
                <button class="mini" on:click={() => copyText(signature)} title="COPIAR FIRMA">
                  {#if copied}
                    <Check size={13} />
                  {:else}
                    <Copy size={13} />
                  {/if}
                </button>
              </div>
            {/if}
            {#if sigError}
              <p class="mono err">X {sigError}</p>
            {/if}
          </div>
        </div>

        <div class="row row--grow">
          <span class="row__k monodim">OPERACIONES</span>
          <div class="row__v row__stack">
            {#if errorMsg}
              <p class="mono err">X {errorMsg.toUpperCase()}</p>
            {/if}
            <button class="ops" on:click={refreshAll}>
              <RefreshCw size={15} /> RE-SYNC
            </button>
            <button class="ops ops--out" on:click={handleDisconnect}>
              <LogOut size={15} /> DESCONECTAR
            </button>
          </div>
        </div>
      {/if}
    </section>
  </section>

  <footer class="bar bar--bottom">
    <span class="mono dim">MR·22 / NEGRO / 0.78EM / HAIRLINE 1PX</span>
    <span class="mono dim">AVISO: NADA EN PANTALLA</span>
  </footer>
</main>

<style>
  * {
    margin: 0;
    box-sizing: border-box;
  }

  .spec {
    height: 100vh;
    display: grid;
    grid-template-rows: auto 1fr auto;
    background: #070709;
    color: #ececee;
    font-family: "JetBrains Mono", monospace;
    padding: 0 clamp(1rem, 3vw, 3rem);
    overflow: hidden;
  }
  @supports (height: 100dvh) {
    .spec {
      height: 100dvh;
    }
  }

  .bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.9rem 0;
    font-size: 0.68rem;
    letter-spacing: 0.08em;
  }
  .bar--top {
    border-bottom: 1px solid rgba(255, 255, 255, 0.16);
  }
  .bar--bottom {
    border-top: 1px solid rgba(255, 255, 255, 0.16);
  }
  .bar__id {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    font-weight: 500;
  }
  .bar__id i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ff3d00;
    box-shadow: 0 0 12px rgba(255, 61, 0, 0.8);
  }
  .mono {
    font-family: "JetBrains Mono", monospace;
  }
  .monodim {
    font-family: "JetBrains Mono", monospace;
    color: #6d6d78;
  }
  .dim {
    color: #5f5f6b;
    font-weight: 400;
  }

  .stage {
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    min-height: 0;
  }
  .plane {
    position: relative;
    border-right: 1px solid rgba(255, 255, 255, 0.16);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(1rem, 2.5vh, 1.8rem);
    padding: clamp(2.5rem, 5vh, 4rem) 2rem clamp(2.5rem, 5vh, 4rem);
    min-height: 0;
    overflow: hidden;
  }
  .plane__grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
    background-size: 3.6rem 3.6rem;
    pointer-events: none;
  }
  .plane__coord {
    position: absolute;
    font-size: 0.6rem;
    letter-spacing: 0.12em;
    color: #4d4d59;
    z-index: 1;
  }
  .plane__coord--tl {
    top: 1.4rem;
    left: 1.6rem;
  }
  .plane__coord--tr {
    top: 1.4rem;
    right: 1.6rem;
  }
  .plane__coord--bl {
    bottom: 1.4rem;
    left: 1.6rem;
  }
  .plane__coord--br {
    bottom: 1.4rem;
    right: 1.6rem;
  }

  .machine {
    position: relative;
    width: min(38vh, 34vw, 440px);
    aspect-ratio: 1;
    flex-shrink: 0;
  }
  .machine svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .machine circle {
    fill: none;
  }
  .r {
    stroke: rgba(255, 255, 255, 0.22);
    stroke-width: 1;
  }
  .r--outer {
    stroke-dasharray: 2 5;
  }
  .r--mid {
    stroke-width: 1.5;
    stroke: rgba(255, 255, 255, 0.1);
  }
  .r--inner {
    stroke: rgba(255, 255, 255, 0.16);
  }

  .a {
    stroke: #ff3d00;
    stroke-width: 2;
    stroke-linecap: round;
    transform-origin: 120px 120px;
  }
  .a--1 {
    stroke-dasharray: 88 528;
    animation: orbit 9s linear infinite;
  }
  .a--2 {
    stroke-dasharray: 26 380;
    animation: orbit-rev 14s linear infinite;
  }
  .a--3 {
    stroke-dasharray: 62 102;
    animation: orbit 6s linear infinite;
  }
  @keyframes orbit {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes orbit-rev {
    to {
      transform: rotate(-360deg);
    }
  }

  .core {
    fill: #ff3d00;
    opacity: 0.25;
    transition: all 0.6s ease;
  }

  .machine[data-state="sync"] .a {
    animation-duration: 1.2s, 2.4s, 0.9s;
  }
  .machine[data-state="sync"] .core {
    animation: core-pulse 0.6s ease-in-out infinite alternate;
  }
  @keyframes core-pulse {
    to {
      opacity: 1;
      r: 8px;
    }
  }
  .machine[data-state="live"] .a {
    animation-play-state: paused;
    stroke: #ececee;
  }
  .machine[data-state="live"] {
    animation: core-bloom 1s ease-out both;
  }
  .machine[data-state="live"] .r {
    stroke: rgba(255, 61, 0, 0.5);
  }
  .machine[data-state="live"] .core {
    fill: #ececee;
    opacity: 1;
    r: 6px;
  }
  @keyframes core-bloom {
    from {
      opacity: 0.35;
      transform: scale(0.9);
    }
  }

  .machine__readout {
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .machine__title {
    font-family: "Space Grotesk", sans-serif;
    font-weight: 600;
    font-size: clamp(1.9rem, 5vw, 3rem);
    letter-spacing: 0.02em;
    line-height: 1;
  }
  .machine[data-state="live"] .machine__title {
    color: #ff3d00;
  }
  .machine__sub {
    font-size: 0.62rem;
    letter-spacing: 0.16em;
    color: #5f5f6b;
  }

  .ctrl {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
  }
  .row {
    display: grid;
    grid-template-columns: 9rem 1fr;
    gap: 1rem;
    padding: clamp(1.1rem, 3vh, 1.8rem) clamp(1.4rem, 3vw, 2.4rem);
    border-bottom: 1px solid rgba(255, 255, 255, 0.16);
  }
  .row__k {
    font-size: 0.64rem;
    letter-spacing: 0.2em;
    padding-top: 0.35rem;
  }
  .row__v {
    display: flex;
    align-items: baseline;
    gap: 1.2rem;
    min-width: 0;
  }
  .led {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #4d4d59;
    align-self: center;
    flex-shrink: 0;
  }
  .led[data-state="live"] {
    background: #34d399;
    box-shadow: 0 0 14px rgba(52, 211, 153, 0.9);
  }
  .led[data-state="sync"] {
    background: #ff3d00;
    animation: ledblink 0.7s steps(2) infinite;
  }
  @keyframes ledblink {
    50% {
      opacity: 0.2;
    }
  }

  .row__stack {
    flex-direction: column;
    align-items: flex-start;
    gap: 1.2rem;
  }
  .wut {
    font-family: "Space Grotesk", sans-serif;
    font-weight: 600;
    font-size: clamp(2.6rem, 7vw, 4.4rem);
    line-height: 0.92;
    letter-spacing: -0.02em;
  }
  .desc {
    font-size: 0.66rem;
    line-height: 1.9;
    letter-spacing: 0.08em;
    max-width: 40ch;
  }
  .err {
    font-size: 0.64rem;
    letter-spacing: 0.08em;
    color: #ff3d00;
  }

  .cta {
    display: inline-flex;
    align-items: center;
    background: #ececee;
    color: #0a0a0c;
    border: none;
    cursor: pointer;
    font-family: "JetBrains Mono", monospace;
    font-weight: 700;
    font-size: 0.8rem;
    letter-spacing: 0.12em;
    padding: 0;
    overflow: hidden;
    transition: all 0.25s ease;
  }
  .cta__label {
    padding: 1rem 1.6rem;
  }
  .cta__icon {
    display: grid;
    place-items: center;
    width: 3.2rem;
    align-self: stretch;
    background: #ff3d00;
    color: #0a0a0c;
    transition: transform 0.25s ease;
  }
  .cta:hover:not(:disabled) .cta__icon {
    transform: translateX(4px);
  }
  .cta:hover:not(:disabled) {
    background: #ffffff;
  }
  .cta:disabled {
    opacity: 0.5;
    cursor: progress;
  }

  .addr {
    font-size: 0.78rem;
    word-break: break-all;
    line-height: 1.5;
  }
  .copy {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    background: transparent;
    color: #ececee;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.2s ease;
  }
  .copy:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: #fff;
  }

  .wt {
    font-family: "Space Grotesk", sans-serif;
    font-weight: 600;
    font-size: clamp(2.2rem, 6vw, 3.6rem);
    line-height: 1;
    letter-spacing: -0.02em;
    word-break: break-all;
  }
  :global(.wt__arrow) {
    align-self: baseline;
    color: #6d6d78;
  }
  .net {
    font-size: 0.72rem;
    letter-spacing: 0.14em;
  }

  .ops {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.24);
    color: #ececee;
    font-family: "JetBrains Mono", monospace;
    font-weight: 500;
    font-size: 0.7rem;
    letter-spacing: 0.16em;
    padding: 0.85rem 1.2rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .ops:hover {
    border-color: #fff;
    background: rgba(255, 255, 255, 0.06);
  }
  .ops--out {
    color: #ff3d00;
    border-color: rgba(255, 61, 0, 0.4);
  }
  .ops--out:hover {
    background: rgba(255, 61, 0, 0.1);
    border-color: #ff3d00;
  }
  .ops--solid {
    background: #ececee;
    color: #0a0a0c;
    border-color: #ececee;
    white-space: nowrap;
  }
  .ops--solid:hover {
    background: #fff;
    border-color: #fff;
  }

  a.copy {
    text-decoration: none;
    color: #ececee;
  }
  a.copy:hover {
    color: #fff;
  }

  .fld {
    width: 100%;
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.22);
    color: #ececee;
    font-size: 0.74rem;
    letter-spacing: 0.08em;
    padding: 0.55rem 0.1rem;
    outline: none;
    transition: border-color 0.2s ease;
  }
  .fld::placeholder {
    color: #4d4d59;
  }
  .fld:focus {
    border-bottom-color: #ff3d00;
  }

  .fld--select {
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 0;
    padding: 0.6rem 0.6rem;
    background: #0f0f11;
    cursor: pointer;
  }
  .fld--select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .fld--select option {
    background: #0f0f11;
    color: #ececee;
  }

  .switch-row {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    width: 100%;
  }
  .switch-row .fld--select {
    flex: 1;
  }

  .flds {
    display: flex;
    gap: 0.9rem;
    align-items: flex-end;
    width: 100%;
  }
  .flds .fld {
    flex: 1;
  }

  .meta {
    font-size: 0.68rem;
    letter-spacing: 0.14em;
    color: #6d6d78;
  }

  .tx-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    width: 100%;
    padding-bottom: 0.1rem;
  }
  .tx-line__ops {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-shrink: 0;
  }
  .mini {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: transparent;
    color: #aeb4c7;
    text-decoration: none;
    cursor: pointer;
    transition: all 0.18s ease;
  }
  .mini:hover {
    color: #fff;
    border-color: #fff;
    background: rgba(255, 255, 255, 0.06);
  }

  .row--alert {
    align-items: center;
  }
  .row--alert .row__v {
    align-items: center;
  }
  .alert__msg {
    font-size: 0.66rem;
    letter-spacing: 0.1em;
    color: #ff3d00;
    line-height: 1.8;
  }

  .row--grow {
    flex: 1;
  }
  .row--grow .row__v {
    justify-content: space-between;
    flex: 1;
    gap: 1rem;
    min-height: 0;
  }

  .ops--mini {
    padding: 0.45rem 0.7rem;
    font-size: 0.62rem;
    gap: 0.4rem;
  }

  .ranking-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    width: 100%;
  }

  .ranking {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  .ranking__item {
    display: grid;
    grid-template-columns: 2.2rem 1fr auto auto auto;
    align-items: center;
    gap: 0.6rem;
    padding: 0.65rem 0.7rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.02);
    transition: background 0.2s ease;
  }
  .ranking__item--active {
    background: rgba(52, 211, 153, 0.06);
    border-left: 2px solid #34d399;
  }
  .ranking__item:last-child {
    border-bottom: none;
  }
  .ranking__item--top {
    background: rgba(255, 61, 0, 0.08);
    border-left: 2px solid #ff3d00;
  }
  .ranking__item--zero {
    opacity: 0.55;
  }

  .ranking__pos {
    font-size: 0.74rem;
    letter-spacing: 0.1em;
    color: #ff3d00;
    font-weight: 700;
  }
  .ranking__item--zero .ranking__pos {
    color: #5f5f6b;
  }

  .ranking__net {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.35rem;
    min-width: 0;
  }
  .ranking__name {
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    font-weight: 600;
  }
  .ranking__chain {
    font-size: 0.6rem;
  }
  .ranking__bal {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    white-space: nowrap;
  }

  @media (max-width: 900px) {
    .stage {
      grid-template-columns: 1fr;
      overflow-y: auto;
    }
    .plane {
      border-right: none;
      border-bottom: 1px solid rgba(255, 255, 255, 0.16);
      min-height: 50vh;
    }
    .machine {
      width: min(40vh, 52vw, 300px);
    }
    .row {
      grid-template-columns: 1fr;
      gap: 0.5rem;
    }
    .wt {
      font-size: 2.4rem;
    }
  }
</style>