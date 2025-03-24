const { ethers } = require("ethers");

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

/**
 * Obtiene el balance (ETH o token) de una dirección, con reintentos en caso de error de red o rate-limit.
 * @param {Object} params - Parámetros necesarios.
 * @param {Object} params.wallet - Objeto con al menos { id, address }.
 * @param {Object} params.provider - Instancia de JsonRpcProvider.
 * @param {Object|null} params.tokenContract - Instancia del contrato ERC-20 (si aplica).
 * @param {number} params.decimals - Decimales del token (si aplica).
 * @param {string} params.tokenName - Nombre del token (por ejemplo "KNRT").
 * @param {number} [params.maxRetries=3] - Máximo de reintentos.
 */
async function getBalanceWithRetry({
  wallet,
  provider,
  tokenContract,
  decimals,
  tokenName,
  maxRetries = 3,
}) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      let balance;
      // Si es un contrato ERC-20 válido
      if (tokenContract) {
        balance = await tokenContract.balanceOf(wallet.address);
        return ethers.formatUnits(balance, decimals) + ` ${tokenName}`;
      } else {
        // Si no hay tokenAddress, obtenemos saldo en ETH
        balance = await provider.getBalance(wallet.address);
        return ethers.formatEther(balance) + " ETH";
      }
    } catch (error) {
      attempt++;
      // Mostramos el error y esperamos un momento antes de reintentar
      console.error(
        `Error intentando obtener el saldo de ${wallet.address}, intento ${attempt}: ${error.message}`
      );
      // Espera incremental según el número de intento (por ejemplo 1 seg, 2 seg, 3 seg...)
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }

  throw new Error(
    `No se pudo obtener el saldo de ${wallet.address} tras ${maxRetries} reintentos.`
  );
}

/**
 * Función principal para consultar balances de múltiples direcciones
 * en chunks y emitir los resultados mediante socket.
 * @param {Object} params - Parámetros requeridos.
 * @param {Array} params.wallets - Lista de objetos { id, address }.
 * @param {string} params.rpcUrl - URL del nodo RPC.
 * @param {number} params.chainId - Chain ID de la red.
 * @param {string|null} params.tokenAddress - Dirección del token ERC-20, o null si es ETH.
 * @param {string} params.tokenName - Nombre del token (por ejemplo "KNRT").
 * @param {Object} params.socket - Objeto socket para emitir resultados (socket.io).
 */
async function checkBalances({
  wallets,
  rpcUrl,
  chainId,
  tokenAddress,
  tokenName,
  socket,
}) {
  // Crea el proveedor
  const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);

  let tokenContract = null;
  let decimals;

  // Si hay tokenAddress, instanciamos contrato y comprobamos que sea ERC-20 (llamando decimals una sola vez)
  if (tokenAddress) {
    tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    try {
      decimals = await tokenContract.decimals();
    } catch (error) {
      console.error(
        `El contrato ${tokenAddress} no parece ser un ERC-20 válido: ${error.message}`
      );

      socket.emit("balanceUpdate", {
        error: `El contrato ${tokenAddress} no es un ERC-20 válido.`,
      });

      return;
    }
  }

  // Función para dividir la lista de wallets en chunks
  function chunkArray(array, size) {
    return Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
      array.slice(i * size, i * size + size)
    );
  }

  // Ajusta el tamaño de chunk según tus necesidades y limitaciones del nodo
  const chunkSize = 5;
  const walletChunks = chunkArray(wallets, chunkSize);

  for (const chunk of walletChunks) {
    // Mapeamos cada dirección a una promesa que obtiene el balance con reintentos
    const balancePromises = chunk.map(async (wallet) => {
      try {
        const formattedBalance = await getBalanceWithRetry({
          wallet,
          provider,
          tokenContract,
          decimals,
          tokenName,
          maxRetries: 3, // Ajusta si quieres más/menos reintentos
        });
        return {
          id: wallet.id,
          address: wallet.address,
          balance: formattedBalance,
          error: null,
        };
      } catch (error) {
        return {
          id: wallet.id,
          address: wallet.address,
          balance: null,
          error: `Error: ${error.message}`,
        };
      }
    });

    const balances = await Promise.all(balancePromises);
    balances.sort((a, b) => a.id - b.id);

    // Emitimos cada resultado (sea éxito o error)
    for (const balance of balances) {
      if (balance.error) {
        console.error(
          `Error al obtener el saldo para la dirección ${balance.address}: ${balance.error}`
        );
      }
      socket.emit("balanceUpdate", balance);
    }

    // Espera entre chunks para no saturar el nodo
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

module.exports = checkBalances;
