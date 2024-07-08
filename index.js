const express = require("express");
const http = require('http');
const { Server } = require("socket.io");
//const ethers = require("ethers");
//const fs = require("fs");
const cors = require("cors");
const fileUpload = require("express-fileupload");
const generateWallets = require("./services/generateWallets");
const checkBalances = require("./services/checkBalances");
const performTransaction = require("./services/makeTransaction");
const logger = require("morgan")


//------------------------ CONFIG SERVER -------------------------------
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions,
  connectionStateRecovery: {
    maxDisconnectionDuration: 2
  }
});

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(fileUpload());
app.use(logger("dev"))


//------------------------ ROUTES ---------------------------------------
//<<<<<<<<<<<< main
app.get("/", (req, res) => {
  const htmlResponse = `
    <html>
      <head>
        <title>Auto Transaction App</title>
      </head>
      <body>
        <h1>Working</h1>
      </body>
    </html>
  `;
  res.send(htmlResponse);
});


io.on('connection', (socket) => {
  console.log('a user connected');

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });

  //listener de balances
  socket.on("startBalanceCheck", async ({ wallets, rpcUrl, chainId, tokenName }) => {
    try {
      await checkBalances({
        wallets,
        rpcUrl,
        chainId,
        tokenName,
        socket
      });
    } catch (error) {
      socket.emit("balanceUpdate", {
        error: `Error: ${error.message}`
      });
    }
  })
});

//<<<<<<<<<<<< wallets
app.get("/generateWallets", (req, res) => {
  // generate wallets & download json with adress and key
  const numberOfWallets = parseInt(req.query.number) || 1;
  const wallets = generateWallets(numberOfWallets);

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", "attachment; filename=wallets.json");
  res.send(JSON.stringify(wallets, null, 2));
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor de socket escuchando en el puerto ${PORT}`);
});
