import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import { Server } from 'socket.io';
import sqlite3 from "sqlite3";
import { open } from 'sqlite';
import { uniqueNamesGenerator, adjectives, animals } from 'unique-names-generator';

dotenv.config();

const app: Express = express();

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

const db = await open({
  filename: 'database.db',
  driver: sqlite3.Database
});

await db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT
  );
`)

io.on('connection', async (socket) => {
  // socket.join("lobby")

  const username = uniqueNamesGenerator({
    dictionaries: [adjectives, animals],
    length: 2
  });

  await db.exec(`INSERT INTO users (id, name) VALUES ('${socket.id}', '${username}')`);

  console.log(`User ${username} has connected.`)

  socket.emit('user data', { id: socket.id, name: username })
  socket.broadcast.emit("user connected", { name: username })

  socket.on("disconnect", async () => {
    try {
      const row = await db.get(`SELECT * FROM users WHERE id = ?`, [socket.id]);
      console.log(`User ${row.name} has disconnected.`)
      await db.exec(`DELETE FROM users WHERE id = '${socket.id}'`)
      io.emit('user disconnected', { name: row.name });
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error:', error.message);
      } else {
        console.error('Unknown error:', error);
      }
    }

  })
})