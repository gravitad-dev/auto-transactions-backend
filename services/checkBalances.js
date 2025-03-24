const { ethers } = require("ethers");

// ABI mínimo para interactuar con tokens ERC-20
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

async function checkBalances({
  wallets,
  rpcUrl,
  chainId,
  tokenAddress,
  tokenName,
  socket,
}) {
  const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);

  // Si tokenAddress está definido, creamos el contrato del token
  const tokenContract = tokenAddress
    ? new ethers.Contract(tokenAddress, ERC20_ABI, provider)
    : null;

  function chunkArray(array, size) {
    return Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
      array.slice(i * size, i * size + size)
    );
  }

  const walletChunks = chunkArray(wallets, 9);

  for (const chunk of walletChunks) {
    const balancePromises = chunk.map(async (wallet) => {
      try {
        let balance, formattedBalance;

        if (tokenContract) {
          // Obtener saldo del token
          balance = await tokenContract.balanceOf(wallet.address);
          const decimals = await tokenContract.decimals();
          formattedBalance =
            ethers.formatUnits(balance, decimals) + ` ${tokenName}`;
        } else {
          // Obtener saldo en ETH si no se especifica un token
          balance = await provider.getBalance(wallet.address);
          formattedBalance = ethers.formatEther(balance) + ` ETH`;
        }

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

    for (const balance of balances) {
      if (balance.error) {
        console.error(
          `Error al obtener el saldo para la dirección ${balance.address}: ${balance.error}`
        );
      }
      socket.emit("balanceUpdate", balance);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

module.exports = checkBalances;
