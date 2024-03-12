import express from "express";
import dotenv from "dotenv";
import { Server } from "socket.io";
import { uniqueNamesGenerator, adjectives, animals } from "unique-names-generator";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";
import bodyParser from "body-parser";

interface Gameroom {
  id: string;
  maxPlayerCount: number;
  host: string;
}

interface User {
  id: string;
  name: string;
}

interface Player extends User {
  position: {
    x: number;
    y: number;
  } | null;
  color: string;
  gameroom: string;
}

dotenv.config();

const app = express();
const port = 3001;
app.use(cors());
app.use(bodyParser.json());

const server = app.listen(port, () => {
  console.log("listening on port:" + port);
});

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

let connectedUsers = new Map<string, User>();
let nextGameroomId = 1;
let gamerooms: { [key: string]: Gameroom } = {};
let allPlayers = new Map<string, Player>();
const PACMAN_COLORS = {
  DEFAULT: "0xffff00",
  TEAL: "0x15f5ba",
  ORANGE: "0xfc6736",
};

io.on("connection", async (socket) => {
  const username = uniqueNamesGenerator({
    dictionaries: [adjectives, animals],
    length: 2,
  });

  connectedUsers.set(socket.id, { id: socket.id, name: username });

  console.log(`User ${username} has connected.`);

  socket.emit("current user data", { id: socket.id, name: username });
  io.emit("connected", { name: username });
  io.emit("update user list", Array.from(connectedUsers.values()));

  socket.on("new chat message", (message, username) => {
    io.emit("chat messages", message, username);
  });

  socket.on("disconnect", async () => {
    try {
      const disconnectedUser = connectedUsers.get(socket.id);
      if (disconnectedUser) {
        console.log(`User ${disconnectedUser.name} has disconnected.`);
        connectedUsers.delete(socket.id);
        io.emit("disconnected", { name: disconnectedUser.name });
        io.emit("update user list", Array.from(connectedUsers.values()));
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error("Error:", error.message);
      } else {
        console.error("Unknown error:", error);
      }
    }
  });

  socket.on("join lobby", () => {
    socket.emit("current user data", { id: socket.id, name: username });
    io.emit("update user list", Array.from(connectedUsers.values()));
  });

  socket.on("join gameroom", (gameroomId: string, callback) => {
    if (!gamerooms[gameroomId]) {
      callback({ message: "The game room does not exist" });
      return;
    }
    // before joining, check whether the room is full already
    const clientsInRoom = io.sockets.adapter.rooms.get(gameroomId);
    const clientCount = clientsInRoom ? clientsInRoom.size : 0;

    if (clientsInRoom && !clientsInRoom.has(socket.id) && clientCount >= gamerooms[gameroomId].maxPlayerCount) {
      callback({ message: "The game room is full." });
      return;
    }
    const currentUser = connectedUsers.get(socket.id);

    if (currentUser && !allPlayers.get(socket.id)) {
      const assignedColors = new Set();
      clientsInRoom?.forEach((clientId) => assignedColors.add(allPlayers.get(clientId)!.color));
      const color = Object.values(PACMAN_COLORS).find((color) => !assignedColors.has(color)) ?? "";
      allPlayers.set(socket.id, { ...currentUser, position: null, color, gameroom: gameroomId });
    }

    socket.join(`${gameroomId}`);

    if (clientsInRoom) {
      const players: Player[] = [];

      Array.from(clientsInRoom).forEach((clientId) => {
        const player = allPlayers.get(clientId);
        if (player) {
          players.push(player);
        }
      });

      io.to(gameroomId).emit("players joined", players, gamerooms[gameroomId].host);
      io.emit("gameroom player count", gameroomId, players.length);
    }
  });

  socket.on("leave gameroom", (gameroomId: string) => {
    if (!gamerooms[gameroomId]) return;

    if (gamerooms[gameroomId].host === socket.id) {
      io.to(gameroomId).emit("host left");
      io.socketsLeave(gameroomId);
      delete gamerooms[gameroomId];
      allPlayers.delete(socket.id);
      io.emit("gameroom deleted", gameroomId);
      return;
    } else {
      // TODO: Refactor
      socket.leave(`${gameroomId}`);
      allPlayers.delete(socket.id);
      const clientsInRoom = io.sockets.adapter.rooms.get(gameroomId);
      io.to(gameroomId).emit("player left", connectedUsers.get(socket.id)?.name);
      const count = clientsInRoom?.size ?? 0;
      io.emit("gameroom player count", gameroomId, count);
    }
  });

  socket.on("game start", (gameroomId: string) => {
    io.to(gameroomId).emit("start game");
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
    console.log("player", winnerId, "defated", defeatedId, "in gameroom", gameroomId);
    io.to(gameroomId).emit("player defeated", winnerId, defeatedId);
  });
});

app.post("/gameroom", (req, res) => {
  const newRoomId = nextGameroomId.toString();
  nextGameroomId += 1;
  let maxPlayerCount = 1;
  if (req.body.maxPlayerCount) {
    maxPlayerCount = req.body.maxPlayerCount;
  }
  gamerooms[newRoomId] = {
    id: newRoomId,
    maxPlayerCount,
    host: req.body.socketId,
  };
  io.emit("gameroom created", newRoomId, maxPlayerCount);
  res.json({ id: newRoomId, maxPlayerCount });
});

app.get("/gamerooms", (req, res) => {
  const gameroomAry = Object.values(gamerooms).map((gameroom) => {
    return {
      id: gameroom.id,
      maxPlayerCount: gameroom.maxPlayerCount,
      currentPlayerCount: io.sockets.adapter.rooms.get(gameroom.id)?.size ?? 0,
    };
  });
  res.json(gameroomAry);
});
