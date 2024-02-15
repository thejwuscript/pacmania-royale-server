import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import { Server } from 'socket.io';

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
  console.log("listening on port:" + port)
})
const io = new Server(server)

app.get("/", (req: Request, res: Response) => {
  res.send("My Server");
});

io.on('connection', (socket) => {
  console.log("a user connected")
})
