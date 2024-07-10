const ethers = require("ethers");

async function checkBalances({ wallets, rpcUrl, chainId, tokenName, socket }) {
  const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);

  const balancePromises = wallets.map(async (wallet) => {
    try {
      const balance = await provider.getBalance(wallet.address);
      return {
        id: wallet.id,
        address: wallet.address,
        balance: ethers.formatEther(balance) + ` ${tokenName}`,
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

  // Wait for all balances to be fetched
  const balances = await Promise.all(balancePromises);

  // Sort balances by id
  balances.sort((a, b) => a.id - b.id);

  // Send sorted balances to frontend
  for (const balance of balances) {
    if (balance.error) {
      console.error(
        `Error al obtener el saldo para la dirección ${balance.address}: ${balance.error}`
      );
    }
    socket.emit("balanceUpdate", balance);
  }
}

module.exports = checkBalances;
