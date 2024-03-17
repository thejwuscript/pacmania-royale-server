import { Request, Response } from "express";
import { io } from "..";
import { gamerooms } from "../models/Gameroom";

let nextGameroomId = 1;

class GameroomController {
  // GET /gamerooms
  static index(req: Request, res: Response) {
    const gameroomAry = Object.values(gamerooms).map((gameroom) => {
      return {
        id: gameroom.id,
        maxPlayerCount: gameroom.maxPlayerCount,
        currentPlayerCount: io.sockets.adapter.rooms.get(gameroom.id)?.size ?? 0,
      };
    });
    res.json(gameroomAry);
  }

  // POST /gameroom
  static async createGameroom(req: Request, res: Response) {
    const newRoomId = nextGameroomId.toString();
    nextGameroomId += 1;
    let maxPlayerCount = 1;
    if (req.body.maxPlayerCount) {
      maxPlayerCount = req.body.maxPlayerCount;
    }
    gamerooms[newRoomId] = {
      id: newRoomId,
      maxPlayerCount,
      host: req.body.socketId,
      roundCount: 0,
    };
    io.emit("gameroom created", newRoomId, maxPlayerCount);
    res.json({ id: newRoomId, maxPlayerCount });
  }
}

export default GameroomController;
