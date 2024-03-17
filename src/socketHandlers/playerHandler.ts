import type { Server, Socket } from "socket.io";
import { players as allPlayers } from "../models/Player";

export default function playerHandler(io: Server, socket: Socket) {
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

  socket.on("win round", (winnerId: string) => {
    if (socket.id === winnerId) {
      const player = allPlayers.get(winnerId);
      player && player.score++;
    }
  });
}
