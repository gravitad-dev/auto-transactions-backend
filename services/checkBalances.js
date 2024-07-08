const ethers = require("ethers");

async function checkBalances({ wallets, rpcUrl, chainId, tokenName, socket }) {
  const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);

  for (const wallet of wallets) {
    try {
      const balance = await provider.getBalance(wallet.address);
      socket.emit("balanceUpdate", {
        id: wallet.id,
        address: wallet.address,
        balance: ethers.formatEther(balance) + ` ${tokenName}`,
      });
    } catch (error) {
      console.error(`Error al obtener el saldo para la dirección ${wallet.address}: ${error.message}`);
      socket.emit("balanceUpdate", {
        id: wallet.id,
        address: wallet.address,
        error: `Error: ${error.message}`,
      });
    }
  }
}

module.exports = checkBalances;