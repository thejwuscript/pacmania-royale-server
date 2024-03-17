import type { Server, Socket } from "socket.io";
import { gamerooms } from "../models/Gameroom";
import { players as allPlayers } from "../models/Player";

function getRandomNumber(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default function fruitHandler(io: Server, socket: Socket) {
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
}
