const { ethers } = require("ethers");

// ABI mínimo para tokens ERC-20 (incluyendo transfer)
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

//------------------------------------------------------------------------------
// Función para dividir en lotes
function chunkArray(array, size) {
  return Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
    array.slice(i * size, i * size + size)
  );
}

//------------------------------------------------------------------------------
// Función de envío con RETRY y backoff
async function sendTransactionWithRetry({
  senderPrivateKey,
  receiverAddress,
  amount,
  provider,
  id,
  nonce,
  tokenContract,
  decimals,
  maxRetries = 3,
}) {
  const signer = new ethers.Wallet(senderPrivateKey, provider);
  let attempt = 0;

  // Obtenemos feeData fuera del ciclo
  let feeData;
  try {
    feeData = await provider.getFeeData();
  } catch (error) {
    return {
      id,
      status: "Error",
      error: `No se pudo obtener feeData: ${error.message}`,
    };
  }

  while (attempt < maxRetries) {
    try {
      let transaction;
      if (tokenContract) {
        // Transacción de token ERC-20
        const amountFormatted = ethers.parseUnits(amount.toString(), decimals);

        transaction = await tokenContract
          .connect(signer)
          .transfer(receiverAddress, amountFormatted, {
            maxFeePerGas: feeData.maxFeePerGas,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
            nonce: nonce,
          });
      } else {
        // Transacción en ETH
        const tx = {
          to: receiverAddress,
          value: ethers.parseEther(amount.toString()),
          nonce: nonce,
          maxFeePerGas: feeData.maxFeePerGas,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        };
        transaction = await signer.sendTransaction(tx);
      }

      // ÉXITO
      return {
        id,
        hash: transaction.hash,
        status: "Success",
        error: "",
      };
    } catch (error) {
      attempt++;
      console.error(
        `Error (intento ${attempt}) al enviar tx de ${id}: ${error.message}`
      );
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }

  // Si se agotan todos los reintentos, devolvemos error
  return {
    id,
    status: "Error",
    error: `No se pudo enviar la transacción tras ${maxRetries} reintentos.`,
  };
}

//------------------------------------------------------------------------------
// Transacción de uno a uno
async function oneToOneTransaction(
  wallets,
  senderId,
  receiverId,
  amount,
  provider,
  socket,
  tokenContract = null,
  decimals = 18
) {
  const senderWallet = wallets.find((w) => w.id === parseInt(senderId));
  const receiverWallet = wallets.find((w) => w.id === parseInt(receiverId));

  // Obtenemos el nonce inicial para este emisor
  const nonce = await provider.getTransactionCount(
    senderWallet.address,
    "pending"
  );

  // Enviamos la transacción con reintentos
  const result = await sendTransactionWithRetry({
    senderPrivateKey: senderWallet.privateKey,
    receiverAddress: receiverWallet.address,
    amount,
    provider,
    id: receiverId,
    nonce,
    tokenContract,
    decimals,
    maxRetries: 3,
  });

  socket.emit("transactionUpdate", result);
}

//------------------------------------------------------------------------------
// Transacción de uno a muchos con lotes
async function oneToManyTransaction(
  wallets,
  senderId,
  receiverIdStart,
  receiverIdEnd,
  amount,
  provider,
  socket,
  tokenContract = null,
  decimals = 18
) {
  const senderWallet = wallets.find((w) => w.id === parseInt(senderId));

  const receivers = wallets.filter(
    (w) => w.id >= parseInt(receiverIdStart) && w.id <= parseInt(receiverIdEnd)
  );

  let nonce = await provider.getTransactionCount(
    senderWallet.address,
    "pending"
  );

  const chunkSize = 5;
  const receiverChunks = chunkArray(receivers, chunkSize);

  for (const chunk of receiverChunks) {
    // Procesamos cada chunk en paralelo (pero no demasiados en total)
    const promises = chunk.map(async (receiverWallet) => {
      // Cada transacción incrementa el nonce
      // Pero OJO: si deseas que la transacción se emita en paralelo,
      // todos usarían el mismo 'nonce' => colisión.
      // Para emitir en serie, hazlo secuencial:
      const currentNonce = nonce;
      nonce++;

      const result = await sendTransactionWithRetry({
        senderPrivateKey: senderWallet.privateKey,
        receiverAddress: receiverWallet.address,
        amount,
        provider,
        id: receiverWallet.id,
        nonce: currentNonce,
        tokenContract,
        decimals,
      });
      socket.emit("transactionUpdate", result);
      return result;
    });

    await Promise.all(promises);
    // Esperamos un poco entre chunks para evitar saturar el RPC
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

//------------------------------------------------------------------------------
// Transacción de muchos a uno con lotes
async function manyToOneTransaction(
  wallets,
  senderIdStart,
  senderIdEnd,
  receiverId,
  amount,
  provider,
  socket,
  tokenContract = null,
  decimals = 18
) {
  const receiverWallet = wallets.find((w) => w.id === parseInt(receiverId));

  const senders = wallets.filter(
    (w) => w.id >= parseInt(senderIdStart) && w.id <= parseInt(senderIdEnd)
  );

  const chunkSize = 5;
  const senderChunks = chunkArray(senders, chunkSize);

  for (const chunk of senderChunks) {
    const promises = chunk.map(async (senderWallet) => {
      // Cada emisor es distinto, por lo que cada uno obtiene su nonce actual
      const nonce = await provider.getTransactionCount(
        senderWallet.address,
        "pending"
      );

      const result = await sendTransactionWithRetry({
        senderPrivateKey: senderWallet.privateKey,
        receiverAddress: receiverWallet.address,
        amount,
        provider,
        id: `${senderWallet.id} to ${receiverId}`,
        nonce,
        tokenContract,
        decimals,
      });
      socket.emit("transactionUpdate", result);
      return result;
    });

    await Promise.all(promises);
    // Esperamos entre cada chunk
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

//------------------------------------------------------------------------------
// Función principal para manejar transacciones
async function performTransaction({
  type,
  wallets,
  rpcUrl,
  chainId,
  senderId,
  receiverId,
  senderIdStart,
  senderIdEnd,
  receiverIdStart,
  receiverIdEnd,
  amount,
  socket,
  tokenAddress = null,
}) {
  const provider = new ethers.JsonRpcProvider(rpcUrl, parseInt(chainId));

  let tokenContract = null;
  let decimals = 18;

  // Si tenemos un tokenAddress, validamos que sea un ERC-20 y leemos sus decimales
  if (tokenAddress) {
    try {
      tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      decimals = await tokenContract.decimals();
    } catch (error) {
      console.error(`Error al obtener el contrato del token: ${error.message}`);
      socket.emit("transactionUpdate", {
        error: "Error al obtener el contrato del token (no parece ERC-20)",
      });
      return;
    }
  }

  switch (type) {
    case "oneToOne":
      await oneToOneTransaction(
        wallets,
        senderId,
        receiverId,
        amount,
        provider,
        socket,
        tokenContract,
        decimals
      );
      break;

    case "oneToMany":
      await oneToManyTransaction(
        wallets,
        senderId,
        receiverIdStart,
        receiverIdEnd,
        amount,
        provider,
        socket,
        tokenContract,
        decimals
      );
      break;

    case "manyToOne":
      await manyToOneTransaction(
        wallets,
        senderIdStart,
        senderIdEnd,
        receiverId,
        amount,
        provider,
        socket,
        tokenContract,
        decimals
      );
      break;

    default:
      console.error("Tipo de transacción no soportado:", type);
      socket.emit("transactionUpdate", {
        error: `Tipo de transacción no soportado: ${type}`,
      });
      break;
  }
}

module.exports = performTransaction;
