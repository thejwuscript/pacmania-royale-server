import express from "express";
import dotenv from "dotenv";
import { Server } from "socket.io";
import { uniqueNamesGenerator, adjectives, animals } from "unique-names-generator";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";
import bodyParser from "body-parser";

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
let gamerooms = new Map();

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

  socket.on("join gameroom", (gameroomId: string, maxPlayerCount: number) => {
    socket.join(`${gameroomId}`); //TODO: need to leave

    const clientsInRoom = io.sockets.adapter.rooms.get(gameroomId);
    console.log(clientsInRoom); // a Set of socket id's
    // from socket ids to a list of names
    const usernames: string[] = [];
    clientsInRoom?.forEach((clientId) => usernames.push(connectedUsers.get(clientId)));
    // emit from gameroom
    io.to(gameroomId).emit("players joined", usernames);
    io.emit("gameroom player count", gameroomId, usernames.length);
  });

  socket.on("leave gameroom", (gameroomId: string) => {
    socket.leave(`${gameroomId}`);
    // emit to gameroom
    // TODO: possible refactoring here
    const usernames: string[] = [];
    io.sockets.adapter.rooms.get(gameroomId)?.forEach((clientId) => usernames.push(connectedUsers.get(clientId)));
    io.to(gameroomId).emit("players left", usernames);
    // emit to lobby
    io.emit("gameroom player count", gameroomId, usernames.length)
  });
});

app.post("/gameroom", (req, res) => {
  const newRoomId = nextGameroomId++;
  let maxPlayerCount = 1;
  if (req.body.maxPlayerCount) {
    maxPlayerCount = req.body.maxPlayerCount;
  }
  gamerooms.set(newRoomId, {
    id: newRoomId,
    maxPlayerCount,
  });
  io.emit("gameroom created", newRoomId, maxPlayerCount);
  res.json({ id: newRoomId, maxPlayerCount });
});
