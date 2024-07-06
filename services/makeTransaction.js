const ethers = require("ethers");

async function sendTransaction(
  senderPrivateKey,
  receiverAddress,
  amount,
  provider
) {
  const signer = new ethers.Wallet(senderPrivateKey, provider);
  const tx = {
    to: receiverAddress,
    value: ethers.parseEther(amount.toString()),
  };

  try {
    const transaction = await signer.sendTransaction(tx);
    await transaction.wait();
    return `Transacción exitosa: ${transaction.hash}`;
  } catch (error) {
    return `Error en la transacción: ${error.message}`;
  }
}

async function oneToOneTransaction(
  wallets,
  senderId,
  receiverId,
  amount,
  provider
) {
  const senderWallet = wallets.find((w) => w.id === parseInt(senderId));
  const receiverWallet = wallets.find((w) => w.id === parseInt(receiverId));
  return await sendTransaction(
    senderWallet.privateKey,
    receiverWallet.address,
    amount,
    provider
  );
}

async function oneToManyTransaction(
  wallets,
  senderId,
  receiverIdStart,
  receiverIdEnd,
  amount,
  provider
) {
  const senderWallet = wallets.find((w) => w.id === parseInt(senderId));
  let results = [];
  for (
    let id = parseInt(receiverIdStart);
    id <= parseInt(receiverIdEnd);
    id++
  ) {
    const receiverWallet = wallets.find((w) => w.id === id);
    if (receiverWallet) {
      const result = await sendTransaction(
        senderWallet.privateKey,
        receiverWallet.address,
        amount,
        provider
      );
      results.push(result);
    }
  }
  return results;
}

async function manyToOneTransaction(
  wallets,
  senderIdStart,
  senderIdEnd,
  receiverId,
  amount,
  provider
) {
  const receiverWallet = wallets.find((w) => w.id === parseInt(receiverId));
  let results = [];
  for (let id = parseInt(senderIdStart); id <= parseInt(senderIdEnd); id++) {
    const senderWallet = wallets.find((w) => w.id === id);
    if (senderWallet) {
      const result = await sendTransaction(
        senderWallet.privateKey,
        receiverWallet.address,
        amount,
        provider
      );
      results.push(result);
    }
  }
  return results;
}

// Realiza las diferentes transacciones
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
}) {
  const provider = new ethers.JsonRpcProvider(rpcUrl, parseInt(chainId));

  switch (type) {
    case "oneToOne":
      return await oneToOneTransaction(
        wallets,
        senderId,
        receiverId,
        amount,
        provider
      );

    case "oneToMany":
      return await oneToManyTransaction(
        wallets,
        senderId,
        receiverIdStart,
        receiverIdEnd,
        amount,
        provider
      );

    case "manyToOne":
      return await manyToOneTransaction(
        wallets,
        senderIdStart,
        senderIdEnd,
        receiverId,
        amount,
        provider
      );

    default:
      return "Tipo de transacción no soportado";
  }
}

module.exports = performTransaction;
