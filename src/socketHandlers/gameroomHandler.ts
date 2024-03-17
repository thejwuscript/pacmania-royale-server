import type { Server, Socket } from "socket.io";
import { gamerooms } from "../models/Gameroom";
import { users } from "../models/User";
import { players as allPlayers, Player } from "../models/Player";
import { PACMAN_COLORS } from "..";

const MAX_ROUNDS = 3;

function getPlayerIdWithHighestScore(players: Player[]): string {
  if (players.length === 0) {
    throw new Error("No players provided");
  }

  return players.reduce((prev, current) => (prev.score > current.score ? prev : current)).id;
}

function hasPlayerWithScoreGreaterThan1(players: Player[]): boolean {
  return players.some((player) => player.score > 1);
}

export default function gameroomHandler(io: Server, socket: Socket) {
  socket.on("join gameroom", (gameroomId: string, callback) => {
    if (!gamerooms[gameroomId]) {
      callback({ message: "The game room does not exist" });
      return;
    }
    // before joining, check whether the room is full already
    const clientsInRoom = io.sockets.adapter.rooms.get(gameroomId);
    const clientCount = clientsInRoom ? clientsInRoom.size : 0;

    if (clientsInRoom && !clientsInRoom.has(socket.id) && clientCount >= gamerooms[gameroomId].maxPlayerCount) {
      callback({ message: "The game room is full." });
      return;
    }
    const currentUser = users.get(socket.id);

    if (currentUser && !allPlayers.get(socket.id)) {
      const assignedColors = new Set();
      clientsInRoom?.forEach((clientId) => assignedColors.add(allPlayers.get(clientId)!.color));
      const color = Object.values(PACMAN_COLORS).find((color) => !assignedColors.has(color)) ?? "";
      allPlayers.set(socket.id, {
        ...currentUser,
        position: null,
        color,
        gameroom: gameroomId,
        score: 0,
        gainedPower: false,
      });
    }

    socket.join(`${gameroomId}`);

    if (clientsInRoom) {
      const players: Player[] = [];

      Array.from(clientsInRoom).forEach((clientId) => {
        const player = allPlayers.get(clientId);
        if (player) {
          players.push(player);
        }
      });

      io.to(gameroomId).emit("players joined", players, gamerooms[gameroomId].host);
      io.emit("gameroom player count", gameroomId, players.length);
    }
  });

  socket.on("leave gameroom", (gameroomId: string) => {
    if (!gamerooms[gameroomId]) return;

    if (gamerooms[gameroomId].host === socket.id) {
      io.to(gameroomId).emit("host left");
      io.emit("gameroom deleted", gameroomId);
      const clientsInRoom = io.sockets.adapter.rooms.get(gameroomId);
      clientsInRoom?.forEach((clientId) => allPlayers.delete(clientId));
      io.socketsLeave(gameroomId);
      delete gamerooms[gameroomId];
      return;
    } else {
      socket.leave(`${gameroomId}`);
      allPlayers.delete(socket.id);
      const clientsInRoom = io.sockets.adapter.rooms.get(gameroomId);
      io.to(gameroomId).emit("player left", users.get(socket.id)?.name);
      const count = clientsInRoom?.size ?? 0;
      if (count === 0) {
        delete gamerooms[gameroomId];
        io.emit("gameroom deleted", gameroomId);
      } else {
        io.emit("gameroom player count", gameroomId, count);
      }
    }
  });

  socket.on("game start", (gameroomId: string) => {
    io.to(gameroomId).emit("start game");
  });

  socket.on("update round count", (gameroomId: string) => {
    if (gamerooms[gameroomId].host === socket.id) {
      const roundCount = ++gamerooms[gameroomId].roundCount;
      const players: Player[] = [];
      const clientIds = io.sockets.adapter.rooms.get(gameroomId);
      if (clientIds?.size === 2) {
        clientIds.forEach((clientId) => {
          const player = allPlayers.get(clientId);
          if (player) {
            players.push(player);
          }
        });
      }
      if ((roundCount > 2 && hasPlayerWithScoreGreaterThan1(players)) || roundCount > MAX_ROUNDS) {
        const winnerId = getPlayerIdWithHighestScore(players);
        io.to(gameroomId).emit("game over", winnerId);
      } else {
        io.to(gameroomId).emit("go to next round", roundCount, players, gameroomId);
      }
    }
  });
}
