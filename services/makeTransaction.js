const ethers = require("ethers");

async function sendTransaction(
  senderPrivateKey,
  receiverAddress,
  amount,
  provider,
  id,
  nonce
) {
  const signer = new ethers.Wallet(senderPrivateKey, provider);
  const tx = {
    to: receiverAddress,
    value: ethers.parseEther(amount.toString()),
    nonce: nonce,
  };

  try {
    const transaction = await signer.sendTransaction(tx);
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
async function oneToOneTransaction(
  wallets,
  senderId,
  receiverId,
  amount,
  provider,
  socket
) {
  const senderWallet = wallets.find((w) => w.id === parseInt(senderId));
  const receiverWallet = wallets.find((w) => w.id === parseInt(receiverId));
  const nonce = await provider.getTransactionCount(
    senderWallet.address,
    "latest"
  );
  const result = await sendTransaction(
    senderWallet.privateKey,
    receiverWallet.address,
    amount,
    provider,
    receiverId,
    nonce
  );
  //console.log(result);
  socket.emit("transactionUpdate", result);
}

//------------------------------------------------------------------------------
async function oneToManyTransaction(
  wallets,
  senderId,
  receiverIdStart,
  receiverIdEnd,
  amount,
  provider,
  socket
) {
  const senderWallet = wallets.find((w) => w.id === parseInt(senderId));
  let nonce = await provider.getTransactionCount(
    senderWallet.address,
    "latest"
  );

  const promises = [];
  for (
    let id = parseInt(receiverIdStart);
    id <= parseInt(receiverIdEnd);
    id++
  ) {
    const receiverWallet = wallets.find((w) => w.id === id);
    if (receiverWallet) {
      promises.push(
        sendTransaction(
          senderWallet.privateKey,
          receiverWallet.address,
          amount,
          provider,
          id,
          nonce++
        ).then((result) => socket.emit("transactionUpdate", result))
      );
    }
  }

  await Promise.all(promises);
}

//------------------------------------------------------------------------------
async function manyToOneTransaction(
  wallets,
  senderIdStart,
  senderIdEnd,
  receiverId,
  amount,
  provider,
  socket
) {
  const receiverWallet = wallets.find((w) => w.id === parseInt(receiverId));

  const promises = [];
  for (let id = parseInt(senderIdStart); id <= parseInt(senderIdEnd); id++) {
    const senderWallet = wallets.find((w) => w.id === id);
    if (senderWallet) {
      const noncePromise = provider
        .getTransactionCount(senderWallet.address, "latest")
        .then((nonce) => {
          return sendTransaction(
            senderWallet.privateKey,
            receiverWallet.address,
            amount,
            provider,
            `${id} to ${receiverId}`,
            nonce
          ).then((result) => socket.emit("transactionUpdate", result));
        });
      promises.push(noncePromise);
    }
  }

  await Promise.all(promises);
}

//------------------------------------------------------------------------------
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
}) {
  const provider = new ethers.JsonRpcProvider(rpcUrl, parseInt(chainId));

  switch (type) {
    case "oneToOne":
      return await oneToOneTransaction(
        wallets,
        senderId,
        receiverId,
        amount,
        provider,
        socket
      );

    case "oneToMany":
      return await oneToManyTransaction(
        wallets,
        senderId,
        receiverIdStart,
        receiverIdEnd,
        amount,
        provider,
        socket
      );

    case "manyToOne":
      return await manyToOneTransaction(
        wallets,
        senderIdStart,
        senderIdEnd,
        receiverId,
        amount,
        provider,
        socket
      );

    default:
      return "Tipo de transacción no soportado";
  }
}

module.exports = performTransaction;
