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
  fruitPlaced?: boolean;
  // winners: boolean[];
  roundCount: number;
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
  score: number;
  gainedPower: boolean;
  gameroom: string; // reference to Gameroom
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

const MAX_ROUNDS = 3;
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
      allPlayers.set(socket.id, {
        ...currentUser,
        position: null,
        color,
        gameroom: gameroomId,
        score: 0,
        gainedPower: false,
      });
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
      io.emit("gameroom deleted", gameroomId);
      const clientsInRoom = io.sockets.adapter.rooms.get(gameroomId);
      clientsInRoom?.forEach((clientId) => allPlayers.delete(clientId));
      io.socketsLeave(gameroomId);
      delete gamerooms[gameroomId];
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

  socket.on("update round count", (gameroomId: string) => {
    if (gamerooms[gameroomId].host === socket.id) {
      const roundCount = ++gamerooms[gameroomId].roundCount;
      const players: Player[] = [];
      io.sockets.adapter.rooms.get(gameroomId)?.forEach((clientId) => {
        const player = allPlayers.get(clientId);
        if (player) {
          players.push(player);
        }
      });
      if ((roundCount > 2 && hasPlayerWithScoreGreaterThan1(players)) || roundCount > MAX_ROUNDS) {
        const winnerId = getPlayerIdWithHighestScore(players);
        io.to(gameroomId).emit("game over", winnerId);
      } else {
        io.to(gameroomId).emit("go to next round", roundCount, players, gameroomId);
      }
    }
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
    // winners: Array(MAX_ROUNDS).fill(false, 0),
    roundCount: 0,
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

function getRandomNumber(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getPlayerIdWithHighestScore(players: Player[]): string {
  if (players.length === 0) {
    throw new Error("No players provided");
  }

  return players.reduce((prev, current) => (prev.score > current.score ? prev : current)).id;
}

function hasPlayerWithScoreGreaterThan1(players: Player[]): boolean {
  return players.some((player) => player.score > 1);
}
