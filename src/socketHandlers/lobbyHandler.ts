import type { Server, Socket } from "socket.io";
import { users } from "../models/User";

export default function lobbyHandler(io: Server, socket: Socket) {
  socket.on("new chat message", (message, username) => {
    io.emit("chat messages", message, username);
  });

  socket.on("disconnect", async () => {
    try {
      const disconnectedUser = users.get(socket.id);
      if (disconnectedUser) {
        console.log(`User ${disconnectedUser.name} has disconnected.`);
        users.delete(socket.id);
        io.emit("disconnected", { name: disconnectedUser.name });
        io.emit("update user list", Array.from(users.values()));
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error("Error:", error.message);
      } else {
        console.error("Unknown error:", error);
      }
    }
  });

  socket.on("join lobby", () => {
    const user = users.get(socket.id);
    socket.emit("current user data", { id: socket.id, name: user?.name });
    io.emit("update user list", Array.from(users.values()));
  });
}
