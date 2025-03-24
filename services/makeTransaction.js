const { ethers } = require("ethers");

// ABI mínimo para tokens ERC-20
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

// Función para dividir en lotes de tamaño máximo 10
function chunkArray(array, size) {
  return Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
    array.slice(i * size, i * size + size)
  );
}

//------------------------------------------------------------------------------
// Función para enviar una transacción con tarifas dinámicas
async function sendTransaction(
  senderPrivateKey,
  receiverAddress,
  amount,
  provider,
  id,
  nonce,
  tokenContract = null,
  decimals = 18
) {
  const signer = new ethers.Wallet(senderPrivateKey, provider);
  const feeData = await provider.getFeeData();

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

    return {
      id,
      hash: transaction.hash,
      status: "Success",
      error: "",
    };
  } catch (error) {
    return {
      id,
      status: "Error",
      error: error.message,
    };
  }
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
  const nonce = await provider.getTransactionCount(
    senderWallet.address,
    "pending"
  );

  const result = await sendTransaction(
    senderWallet.privateKey,
    receiverWallet.address,
    amount,
    provider,
    receiverId,
    nonce,
    tokenContract,
    decimals
  );
  socket.emit("transactionUpdate", result);
}

//------------------------------------------------------------------------------
// Transacción de uno a muchos con lotes de 10
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
  let nonce = await provider.getTransactionCount(
    senderWallet.address,
    "pending"
  );

  const receivers = wallets.filter(
    (w) => w.id >= parseInt(receiverIdStart) && w.id <= parseInt(receiverIdEnd)
  );

  const receiverChunks = chunkArray(receivers, 9);

  for (const chunk of receiverChunks) {
    const promises = chunk.map((receiverWallet) =>
      sendTransaction(
        senderWallet.privateKey,
        receiverWallet.address,
        amount,
        provider,
        receiverWallet.id,
        nonce++,
        tokenContract,
        decimals
      ).then((result) => socket.emit("transactionUpdate", result))
    );

    await Promise.all(promises);
    await new Promise((resolve) => setTimeout(resolve, 500)); // Pequeño delay
  }
}

//------------------------------------------------------------------------------
// Transacción de muchos a uno con lotes de 10
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

  const senderChunks = chunkArray(senders, 9);

  for (const chunk of senderChunks) {
    const promises = chunk.map(async (senderWallet) => {
      const nonce = await provider.getTransactionCount(
        senderWallet.address,
        "pending"
      );

      return sendTransaction(
        senderWallet.privateKey,
        receiverWallet.address,
        amount,
        provider,
        `${senderWallet.id} to ${receiverId}`,
        nonce,
        tokenContract,
        decimals
      ).then((result) => socket.emit("transactionUpdate", result));
    });

    await Promise.all(promises);
    await new Promise((resolve) => setTimeout(resolve, 500)); // Pequeño delay
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

  if (tokenAddress) {
    try {
      tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      decimals = await tokenContract.decimals();
    } catch (error) {
      console.error(`Error al obtener el contrato del token: ${error.message}`);
      socket.emit("transactionUpdate", {
        error: "Error al obtener el contrato del token",
      });
      return;
    }
  }

  switch (type) {
    case "oneToOne":
      return await oneToOneTransaction(
        wallets,
        senderId,
        receiverId,
        amount,
        provider,
        socket,
        tokenContract,
        decimals
      );

    case "oneToMany":
      return await oneToManyTransaction(
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

    case "manyToOne":
      return await manyToOneTransaction(
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

    default:
      return "Tipo de transacción no soportado";
  }
}

module.exports = performTransaction;
