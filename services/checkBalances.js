const ethers = require("ethers");

async function checkBalances({ wallets, rpcUrl, chainId, tokenName }) {
  const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
  let balances = [];

  for (const wallet of wallets) {
    try {
      const balance = await provider.getBalance(wallet.address);
      balances.push({
        id: wallet.id,
        address: wallet.address,
        balance: ethers.formatEther(balance) + ` ${tokenName}`,
      });
    } catch (error) {
      console.error(
        `Error al obtener el saldo para la dirección ${wallet.address}: ${error.message}`
      );
      balances.push({
        id: wallet.id,
        address: wallet.address,
        error: `Error: ${error.message}`,
      });
    }
  }
  return balances;
}

module.exports = checkBalances;
