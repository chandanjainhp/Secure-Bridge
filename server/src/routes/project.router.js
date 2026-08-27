import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middle.js";
import { validate } from "../middlewares/validate.js";
import {
  createProjectSchema,
  updateProjectSchema,
  projectIdSchema,
  sendMessageSchema,
  createConversationSchema,
} from "../validation/project.validation.js";
import {
  getProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
  getConversations,
  createConversation,
  getConversation,
  deleteConversation,
  getConversationMessages,
  sendMessage,
  uploadFile,
  getFiles,
  deleteFile,
} from "../controllers/project.controller.js";

const router = Router();
router.use(verifyJWT);

router.get("/", getProjects);
router.post("/", validate(createProjectSchema), createProject);

router.get("/:projectId", validate(projectIdSchema), getProject);
router.patch("/:projectId", validate(updateProjectSchema), updateProject);
router.delete("/:projectId", validate(projectIdSchema), deleteProject);

router.get("/:projectId/conversations", validate(projectIdSchema), getConversations);
router.post("/:projectId/conversations", validate(createConversationSchema), createConversation);
router.get("/:projectId/conversations/:conversationId", validate(projectIdSchema), getConversation);
router.delete("/:projectId/conversations/:conversationId", validate(projectIdSchema), deleteConversation);
router.get("/:projectId/conversations/:conversationId/messages", validate(projectIdSchema), getConversationMessages);
router.post("/:projectId/conversations/:conversationId/messages", validate(sendMessageSchema), sendMessage);

router.post("/:projectId/files", validate(projectIdSchema), uploadFile);
router.get("/:projectId/files", validate(projectIdSchema), getFiles);
router.delete("/:projectId/files/:fileId", validate(projectIdSchema), deleteFile);

export default router;
