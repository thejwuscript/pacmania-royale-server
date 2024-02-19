// import { existsSync, unlinkSync } from 'fs';
import express from "express";
import dotenv from "dotenv";
import { Server } from 'socket.io';
// import sqlite3 from "sqlite3";
// import { open } from 'sqlite';
import { uniqueNamesGenerator, adjectives, animals } from 'unique-names-generator';

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

// if (process.env.NODE_ENV === "development" && existsSync("database.db")) {
//   try {
//     unlinkSync("database.db");
//     console.log('Database file deleted successfully');
//   } catch (error) {
//     console.error('Error deleting database file:', error);
//   }

// }

// const db = await open({
//   filename: 'database.db',
//   driver: sqlite3.Database
// });

// await db.exec(`
//   CREATE TABLE IF NOT EXISTS users (
//     id TEXT PRIMARY KEY,
//     name TEXT
//   );
// `)

let connectedUsers = new Map();

io.on('connection', async (socket) => {
  // socket.join("lobby")

  const username = uniqueNamesGenerator({
    dictionaries: [adjectives, animals],
    length: 2
  });

  // await db.exec(`INSERT INTO users (id, name) VALUES ('${socket.id}', '${username}')`);
  connectedUsers.set(socket.id, { name: username })

  console.log(`User ${username} has connected.`)

  socket.emit('my user data', { id: socket.id, name: username })
  socket.broadcast.emit("user connected", { name: username })
  io.emit("connected users", Array.from(connectedUsers.values()))

  socket.on("new chat message", message => {
    io.emit("chat messages", message)
  })

  socket.on("disconnect", async () => {
    try {
      // const row = await db.get(`SELECT * FROM users WHERE id = ?`, [socket.id]);
      const disconnectedUser = connectedUsers.get(socket.id)
      console.log(`User ${disconnectedUser.name} has disconnected.`)
      // await db.exec(`DELETE FROM users WHERE id = '${socket.id}'`)
      connectedUsers.delete(socket.id)
      io.emit('user disconnected', { name: disconnectedUser.name });
      io.emit("connected users", Array.from(connectedUsers.values()))
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error:', error.message);
      } else {
        console.error('Unknown error:', error);
      }
    }

  })
})