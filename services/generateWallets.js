const ethers = require("ethers");

function generateWallets(numberOfWallets) {
  let wallets = [];
  for (let i = 0; i < numberOfWallets; i++) {
    const wallet = ethers.Wallet.createRandom();
    wallets.push({
      id: i + 1,
      address: wallet.address,
      privateKey: wallet.privateKey,
    });
  }
  return wallets;
}

module.exports = generateWallets;
