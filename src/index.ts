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

  socket.emit("user connected", { name: username })

  socket.on("disconnect", async () => {
    const row = await db.get(`SELECT name FROM users WHERE id = ?`, [socket.id]);
    console.log(`User ${row.name} has disconnected.`)
    // delete user in db
    io.emit('user disconnected', { name: row.name });
  })
})