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

let connectedUsers = new Map();
let nextGameroomId = 1;
let gamerooms: { [key: string]: Gameroom } = {};

io.on("connection", async (socket) => {
  const username = uniqueNamesGenerator({
    dictionaries: [adjectives, animals],
    length: 2,
  });

  connectedUsers.set(socket.id, { name: username });

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
      console.log(`User ${disconnectedUser.name} has disconnected.`);
      connectedUsers.delete(socket.id);
      io.emit("disconnected", { name: disconnectedUser.name });
      io.emit("update user list", Array.from(connectedUsers.values()));
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
    console.log(callback)
    if (!gamerooms[gameroomId]) {
      callback({ message: "The game room does not exist" });
      return;
    }
    // before joining, check whether the room is full already
    let clientsInRoom = io.sockets.adapter.rooms.get(gameroomId);
    if (clientsInRoom?.size ?? 0 >= gamerooms[gameroomId].maxPlayerCount) {
      callback({ message: "The game room is full." });
      return;
    }

    socket.join(`${gameroomId}`);
    clientsInRoom = io.sockets.adapter.rooms.get(gameroomId);
    const usernames: string[] = [];
    clientsInRoom?.forEach((clientId) => usernames.push(connectedUsers.get(clientId)));
    io.to(gameroomId).emit("players joined", usernames);
    io.emit("gameroom player count", gameroomId, usernames.length);
  });

  socket.on("leave gameroom", (gameroomId: string) => {
    if (!gamerooms[gameroomId]) return;

    if (gamerooms[gameroomId].host === socket.id) {
      io.to(gameroomId).emit("host left");
      io.socketsLeave(gameroomId);
      delete gamerooms[gameroomId];
      io.emit("gameroom deleted", gameroomId);
      return;
    } else {
      // TODO: Refactor
      socket.leave(`${gameroomId}`);
      const usernames: string[] = [];
      io.sockets.adapter.rooms.get(gameroomId)?.forEach((clientId) => usernames.push(connectedUsers.get(clientId)));
      io.to(gameroomId).emit("player left", connectedUsers.get(socket.id)?.name);
      io.emit("gameroom player count", gameroomId, usernames.length);
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
