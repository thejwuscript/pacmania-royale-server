import express from "express";
import dotenv from "dotenv";
import { Server } from 'socket.io';
import { uniqueNamesGenerator, adjectives, animals } from 'unique-names-generator';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const port = 3001

const server = app.listen(port, () => {
  console.log("listening on port:" + port)
})

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ['GET', 'POST'],
  }
})

let connectedUsers = new Map();
let gamerooms = new Map();

io.on('connection', async (socket) => {
  const username = uniqueNamesGenerator({
    dictionaries: [adjectives, animals],
    length: 2
  });

  connectedUsers.set(socket.id, { name: username })

  console.log(`User ${username} has connected.`)

  socket.emit('current user data', { id: socket.id, name: username })
  io.emit("connected", { name: username })
  io.emit("update user list", Array.from(connectedUsers.values()))

  socket.on("new chat message", (message, username) => {
    io.emit("chat messages", message, username)
  })

  socket.on("disconnect", async () => {
    try {
      const disconnectedUser = connectedUsers.get(socket.id)
      console.log(`User ${disconnectedUser.name} has disconnected.`)
      connectedUsers.delete(socket.id)
      io.emit('disconnected', { name: disconnectedUser.name });
      io.emit("update user list", Array.from(connectedUsers.values()))
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error:', error.message);
      } else {
        console.error('Unknown error:', error);
      }
    }
  })

  socket.on("join gameroom", (gameroomId) => {
    socket.join(`${gameroomId}`)

    const clientsInRoom = io.sockets.adapter.rooms.get(gameroomId);
    console.log(clientsInRoom)
  })
})

app.post("/gameroom", (req, res) => {
  const newRoomId = uuidv4();
  res.json({id: newRoomId})
})
