import { Router } from "express";
import { verifyJWT } from "../../../middlewares/auth.middle.js";
import { validate } from "../../../middlewares/validate.js";
import { upload } from "../../../middlewares/multer.middleware.js";
import {
  createProjectSchema, updateProjectSchema, projectIdSchema,
  conversationIdSchema, createConversationSchema, updateConversationSchema,
  sendMessageSchema, fileIdSchema,
} from "../../../validation/project.validation.js";
import {
  getProjects, createProject, getProject, updateProject, deleteProject,
  getConversations, createConversation, getConversation, updateConversation,
  deleteConversation, getConversationMessages, sendMessage, uploadFile,
  getFiles, deleteFile,
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
router.get("/:projectId/conversations/:conversationId", validate(conversationIdSchema), getConversation);
router.patch("/:projectId/conversations/:conversationId", validate(updateConversationSchema), updateConversation);
router.delete("/:projectId/conversations/:conversationId", validate(conversationIdSchema), deleteConversation);
router.get("/:projectId/conversations/:conversationId/messages", validate(conversationIdSchema), getConversationMessages);
router.post("/:projectId/conversations/:conversationId/messages", validate(sendMessageSchema), sendMessage);
router.post("/:projectId/files", upload.single("file"), validate(projectIdSchema), uploadFile);
router.get("/:projectId/files", validate(projectIdSchema), getFiles);
router.delete("/:projectId/files/:fileId", validate(fileIdSchema), deleteFile);
export default router;
