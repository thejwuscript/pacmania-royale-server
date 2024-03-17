import { Router } from "express";
import GameroomController from "./controllers/gameroomController";

const router = Router();

router.post("/gameroom", GameroomController.createGameroom);
router.get("/gamerooms", GameroomController.index);

export default router;
