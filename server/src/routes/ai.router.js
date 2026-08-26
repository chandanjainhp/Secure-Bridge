import { Router } from "express";
import ChatController from "../controllers/chat.controller.js";

const router = Router();

router.get("/test", ChatController.test);

router.post("/chat", (req, res) => {
  req.body.stream = false;
  ChatController.completions(req, res);
});

router.post("/stream", (req, res) => {
  req.body.stream = true;
  ChatController.completions(req, res);
});

export default router;
