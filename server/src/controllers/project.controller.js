import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Project } from "../models/project.model.js";

const getProjects = asyncHandler(async (req, res) => {
  const projects = await Project.find({ owner: req.user._id }).sort({ updatedAt: -1 });
  return res.status(200).json(new ApiResponse(200, { projects }, "Projects retrieved successfully"));
});

const createProject = asyncHandler(async (req, res) => {
  const project = await Project.create({ ...req.body, owner: req.user._id });
  return res.status(201).json(new ApiResponse(201, project, "Project created successfully"));
});

const getProject = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, owner: req.user._id });
  if (!project) throw new ApiError(404, "Project not found");
  return res.status(200).json(new ApiResponse(200, project, "Project retrieved successfully"));
});

const updateProject = asyncHandler(async (req, res) => {
  const project = await Project.findOneAndUpdate(
    { _id: req.params.projectId, owner: req.user._id },
    { $set: req.body },
    { new: true, runValidators: true },
  );
  if (!project) throw new ApiError(404, "Project not found");
  return res.status(200).json(new ApiResponse(200, project, "Project updated successfully"));
});

const deleteProject = asyncHandler(async (req, res) => {
  const project = await Project.findOneAndDelete({ _id: req.params.projectId, owner: req.user._id });
  if (!project) throw new ApiError(404, "Project not found");
  return res.status(200).json(new ApiResponse(200, {}, "Project deleted successfully"));
});

const getConversations = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, owner: req.user._id });
  if (!project) throw new ApiError(404, "Project not found");
  return res.status(200).json(new ApiResponse(200, project.conversations || [], "Conversations retrieved successfully"));
});

const createConversation = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, owner: req.user._id });
  if (!project) throw new ApiError(404, "Project not found");
  const conversation = {
    id: Date.now().toString(),
    title: req.body.title || "New Chat",
    messages: [],
  };
  project.conversations = project.conversations || [];
  project.conversations.push(conversation);
  project.conversationCount = project.conversations.length;
  await project.save();
  return res.status(201).json(new ApiResponse(201, conversation, "Conversation created successfully"));
});

const getConversation = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, owner: req.user._id });
  if (!project) throw new ApiError(404, "Project not found");
  const conversation = (project.conversations || []).find(c => c.id === req.params.conversationId);
  if (!conversation) throw new ApiError(404, "Conversation not found");
  return res.status(200).json(new ApiResponse(200, conversation, "Conversation retrieved successfully"));
});

const deleteConversation = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, owner: req.user._id });
  if (!project) throw new ApiError(404, "Project not found");
  project.conversations = (project.conversations || []).filter(c => c.id !== req.params.conversationId);
  project.conversationCount = project.conversations.length;
  await project.save();
  return res.status(200).json(new ApiResponse(200, {}, "Conversation deleted successfully"));
});

const getConversationMessages = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, owner: req.user._id });
  if (!project) throw new ApiError(404, "Project not found");
  const conversation = (project.conversations || []).find(c => c.id === req.params.conversationId);
  if (!conversation) throw new ApiError(404, "Conversation not found");
  return res.status(200).json(new ApiResponse(200, conversation.messages || [], "Messages retrieved successfully"));
});

const sendMessage = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, owner: req.user._id });
  if (!project) throw new ApiError(404, "Project not found");
  const conversation = (project.conversations || []).find(c => c.id === req.params.conversationId);
  if (!conversation) throw new ApiError(404, "Conversation not found");
  const message = {
    id: Date.now().toString(),
    role: req.body.role || "user",
    content: req.body.content,
    createdAt: new Date(),
  };
  conversation.messages = conversation.messages || [];
  conversation.messages.push(message);
  if (!conversation.title || conversation.title === "New Chat") {
    conversation.title = req.body.content.slice(0, 40);
  }
  await project.save();
  return res.status(201).json(new ApiResponse(201, message, "Message sent successfully"));
});

const uploadFile = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, owner: req.user._id });
  if (!project) throw new ApiError(404, "Project not found");
  const file = {
    id: Date.now().toString(),
    name: req.file?.originalname || req.body.name,
    size: req.file?.size || 0,
    url: req.file?.path || req.body.url || "",
    uploadedAt: new Date(),
  };
  project.files = project.files || [];
  project.files.push(file);
  await project.save();
  return res.status(201).json(new ApiResponse(201, file, "File uploaded successfully"));
});

const getFiles = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, owner: req.user._id });
  if (!project) throw new ApiError(404, "Project not found");
  return res.status(200).json(new ApiResponse(200, project.files || [], "Files retrieved successfully"));
});

const deleteFile = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, owner: req.user._id });
  if (!project) throw new ApiError(404, "Project not found");
  project.files = (project.files || []).filter(f => f.id !== req.params.fileId);
  await project.save();
  return res.status(200).json(new ApiResponse(200, {}, "File deleted successfully"));
});

export {
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
};
