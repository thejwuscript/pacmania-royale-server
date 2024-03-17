import express from "express";
import dotenv from "dotenv";
import { Server } from "socket.io";
import cors from "cors";
import bodyParser from "body-parser";
import { uniqueNamesGenerator, adjectives, animals } from "unique-names-generator";
import routes from "./routes";
import { users } from "./models/User";
import registerGameroomHandler from "./socketHandlers/gameroomHandler";
import registerPlayerHandler from "./socketHandlers/playerHandler";
import registerLobbyHandler from "./socketHandlers/lobbyHandler";
import registerFruitHandler from "./socketHandlers/fruitHandler";

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

  registerGameroomHandler(io, socket);
  registerPlayerHandler(io, socket);
  registerLobbyHandler(io, socket);
  registerFruitHandler(io, socket);
});
