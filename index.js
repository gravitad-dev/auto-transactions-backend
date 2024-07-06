const express = require("express");
const ethers = require("ethers");
const cors = require("cors");
const fs = require("fs");
const fileUpload = require("express-fileupload");
const generateWallets = require("./services/generateWallets");
const checkBalances = require("./services/checkBalances");
const performTransaction = require("./services/makeTransaction");

const app = express();
const port = process.env.PORT || 3000;
app.use(cors());
app.use(fileUpload());

//------------------------ ROUTES ---------------------------------------
//<<<<<<<<<<<< wallets
app.get("/generateWallets", (req, res) => {
  // generate wallets & download json with adress and key
  const numberOfWallets = parseInt(req.query.number) || 1;
  const wallets = generateWallets(numberOfWallets);

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", "attachment; filename=wallets.json");
  res.send(JSON.stringify(wallets, null, 2));
});

//<<<<<<<<<<<< balances
app.post("/checkBalances", async (req, res) => {
  if (!req.files || !req.files.wallets) {
    return res.status(400).send("No se subió ningún archivo de carteras.");
  }

  const walletsFile = req.files.wallets;
  const wallets = JSON.parse(walletsFile.data.toString());
  const rpcUrl = req.body.rpcUrl.toString();
  const chainId = parseInt(req.body.chainId);
  const tokenName = req.body.tokenName.toString();

  // Verifica si rpcUrl y chainId están presentes
  if (!rpcUrl || !chainId) {
    return res.status(400).send("RPC URL o Chain ID faltantes.");
  }

  try {
    const balances = await checkBalances({
      wallets,
      rpcUrl,
      chainId,
      tokenName,
    });
    res.json(balances);
  } catch (error) {
    res.status(500).send("Error al procesar la solicitud: " + error.message);
  }
});

//<<< transaction
app.post("/transaction", async (req, res) => {
  if (!req.files || !req.files.walletsFile) {
    return res.status(400).send("No se subió ningún archivo de carteras.");
  }

  const walletsFile = req.files.walletsFile;
  const wallets = JSON.parse(walletsFile.data.toString()); // Asegúrate de que 'wallets' esté definida correctamente aquí

  const {
    rpcUrl,
    chainId,
    senderId,
    receiverId,
    amount,
    type,
    senderIdStart,
    senderIdEnd,
    receiverIdStart,
    receiverIdEnd,
  } = req.body;

  try {
    const response = await performTransaction({
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
    });
    res.send(response);
  } catch (error) {
    res.status(500).send("Error al procesar la solicitud: " + error.message);
  }
});

app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});
