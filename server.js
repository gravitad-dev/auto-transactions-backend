const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const fileUpload = require("express-fileupload");
const generateWallets = require("./services/generateWallets");
const checkBalances = require("./services/checkBalances");
const performTransaction = require("./services/makeTransaction");
const logger = require("morgan");
//const ethers = require("ethers");
//const fs = require("fs");

//------------------------ CONFIG SERVER -------------------------------
const corsOptions = {
  origin: "https://auto-wallets-frontend.gravitad.xyz",
//  origin: "https://auto-wallets-frontend.vercel.app",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

const app = express();

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(fileUpload());
app.use(logger("dev"));

const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions,
  connectionStateRecovery: {
    maxDisconnectionDuration: {},
  },
});

//------------------------ ROUTES ---------------------------------------
//<<<<<<<<<<<< main
app.get("/", (req, res) => {
  const htmlResponse = `
    <html>
      <head>
        <title>Auto Transaction App</title>
      </head>
      <body>
        <h3>Online 🌱</h3>
      </body>
    </html>
  `;
  res.send(htmlResponse);
});

//web socket
io.on("connection", (socket) => {
  console.log("a user connected");

  socket.on("disconnect", () => {
    console.log("user disconnected");
  });

  // consultation of balances in wallets
  socket.on(
    "startBalanceCheck",
    async ({ wallets, rpcUrl, chainId, tokenName }) => {
      try {
        await checkBalances({
          wallets,
          rpcUrl,
          chainId,
          tokenName,
          socket,
        });
      } catch (error) {
        socket.emit("balanceUpdate", {
          error: `Error: ${error.message}`,
        });
      }
    }
  );

  //transactions
  socket.on("startTransaction", async (data) => {
    try {
      await performTransaction({
        type: data.type,
        wallets: data.wallets,
        rpcUrl: data.rpcUrl,
        chainId: data.chainId,
        senderId: data.senderId,
        receiverId: data.receiverId,
        senderIdStart: data.senderIdStart,
        senderIdEnd: data.senderIdEnd,
        receiverIdStart: data.receiverIdStart,
        receiverIdEnd: data.receiverIdEnd,
        amount: data.amount,
        socket,
      });
    } catch (error) {
      socket.emit("transactionUpdate", {
        error: `Error: ${error.message}`,
      });
    }
  });
});

// create wallets file
app.get("/generateWallets", (req, res) => {
  // generate wallets & download json with adress and key
  const numberOfWallets = parseInt(req.query.number) || 1;
  const wallets = generateWallets(numberOfWallets);

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", "attachment; filename=wallets.json");
  res.send(JSON.stringify(wallets, null, 2));
});

const PORT = process.env.PORT || 3010;
server.listen(PORT, () => {
  console.log(`Servidor de socket escuchando en el puerto ${PORT}`);
});
