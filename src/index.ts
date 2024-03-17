import express from "express";
import dotenv from "dotenv";
import { Server } from "socket.io";
import { uniqueNamesGenerator, adjectives, animals } from "unique-names-generator";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";
import bodyParser from "body-parser";
import { gamerooms } from "./models/Gameroom";
import routes from "./routes";
import { users, User } from "./models/User";
import { Player, players as allPlayers } from "./models/Player";
import registerGameroomHandler from "./socketHandlers/gameroomHandler";

dotenv.config();

const app = express();
const port = 3001;
app.use(cors());
app.use(bodyParser.json());
app.use("/", routes);

const server = app.listen(port, () => {
  console.log("listening on port:" + port);
});

export const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

export const PACMAN_COLORS = {
  DEFAULT: "0xffff00",
  TEAL: "0x15f5ba",
  ORANGE: "0xfc6736",
};

io.on("connection", async (socket) => {
  const username = uniqueNamesGenerator({
    dictionaries: [adjectives, animals],
    length: 2,
  });

  users.set(socket.id, { id: socket.id, name: username });

  console.log(`User ${username} has connected.`);

  socket.emit("current user data", { id: socket.id, name: username });
  io.emit("connected", { name: username });
  io.emit("update user list", Array.from(users.values()));

  socket.on("new chat message", (message, username) => {
    io.emit("chat messages", message, username);
  });

  socket.on("disconnect", async () => {
    try {
      const disconnectedUser = users.get(socket.id);
      if (disconnectedUser) {
        console.log(`User ${disconnectedUser.name} has disconnected.`);
        users.delete(socket.id);
        io.emit("disconnected", { name: disconnectedUser.name });
        io.emit("update user list", Array.from(users.values()));
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error("Error:", error.message);
      } else {
        console.error("Unknown error:", error);
      }
    }
  });

  registerGameroomHandler(io, socket);

  socket.on("join lobby", () => {
    socket.emit("current user data", { id: socket.id, name: username });
    io.emit("update user list", Array.from(users.values()));
  });

  socket.on("get initial positions", (gameroomId: string, callback) => {
    const bottomLeftPosition = { position: { x: 100, y: 300 }, orientation: "right" };
    const topRightPosition = { position: { x: 500, y: 100 }, orientation: "left" };
    const clientsInRoom = io.sockets.adapter.rooms.get(gameroomId);

    if (clientsInRoom) {
      const sortedClientsAry = Array.from(clientsInRoom).sort();
      const playerOneId = sortedClientsAry[0];
      const playerTwoId = sortedClientsAry[1];
      let playerOne = allPlayers.get(playerOneId);
      let playerTwo = allPlayers.get(playerTwoId);
      if (playerOne) {
        playerOne = Object.assign(playerOne, bottomLeftPosition);
        allPlayers.set(playerOneId, playerOne);
      }
      if (playerTwo) {
        playerTwo = Object.assign(playerTwo, topRightPosition);
        allPlayers.set(playerTwoId, playerTwo);
      }

      const players = { [playerOneId]: playerOne, [playerTwoId]: playerTwo };
      callback(players);
    }
  });

  socket.on("player movement", (gameroomId, socketId, position) => {
    const player = allPlayers.get(socketId);
    if (player && player.position) {
      player.position = position;
      socket.to(gameroomId).emit("player moved", player);
    }
  });

  socket.on("player defeat", (gameroomId: string, winnerId: string, defeatedId: string) => {
    if (socket.id === winnerId) {
      console.log("player", winnerId, "defeated", defeatedId, "in gameroom", gameroomId);
      io.to(gameroomId).emit("player defeated", winnerId, defeatedId);
    }
  });

  socket.on("fruit timer", (duration: number, gameroomId: string) => {
    const x = getRandomNumber(50, 550);
    const y = getRandomNumber(50, 350);
    setTimeout(() => {
      if (gamerooms[gameroomId]?.fruitPlaced) return;

      io.to(gameroomId).emit("fruit location", x, y);
      if (gamerooms[gameroomId]) {
        gamerooms[gameroomId].fruitPlaced = true;
      }
    }, duration);
  });

  socket.on("reset fruit", (gameroomId: string) => {
    gamerooms[gameroomId].fruitPlaced = false;
  });

  socket.on("got cherry", (socketId: string, gameroomId: string) => {
    if (socket.id !== socketId) return;

    const player = allPlayers.get(socketId);
    if (player) {
      player.gainedPower = true;
      io.to(gameroomId).emit("player power up", player.id);

      setTimeout(() => {
        player.gainedPower = false;
        io.to(gameroomId).emit("player return to normal", player.id);
      }, 2000);
    }
  });

  socket.on("win round", (winnerId: string, gameroomId: string) => {
    if (socket.id === winnerId) {
      // gamerooms[gameroomId].winners.push(true);
      const player = allPlayers.get(winnerId);
      player && player.score++;
    }
  });
});

function getRandomNumber(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
