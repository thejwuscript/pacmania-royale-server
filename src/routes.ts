import { Router } from "express";
import GameroomController from "./controllers/gameroomController";

const router = Router();

router.post("/gameroom", GameroomController.createGameroom);
router.get("/gamerooms", GameroomController.index);
router.get("/healthcheck", (req, res) => {
  res.status(200).send("OK");
});

export default router;
