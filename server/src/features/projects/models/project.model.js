import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    role: {
      type: String,
      enum: ["user", "assistant", "system"],
      required: true,
    },
    content: { type: String, required: true, maxlength: 32768 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const conversationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    projectId: { type: String, required: true },
    title: { type: String, default: "New Conversation", maxlength: 200 },
    messages: { type: [messageSchema], default: [] },
  },
  { _id: false, timestamps: true },
);

const projectSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500, default: "" },
    model: { type: String, trim: true, default: "local" },
    systemPrompt: {
      type: String,
      trim: true,
      maxlength: 4000,
      default: "You are a helpful AI assistant.",
    },
    temperature: { type: Number, default: 0.7, min: 0, max: 2 },
    maxTokens: { type: Number, default: 2048, min: 1, max: 8192 },
    conversationCount: { type: Number, default: 0, min: 0 },
    conversations: { type: [conversationSchema], default: [] },
    files: {
      type: [
        {
          id: String,
          name: String,
          size: { type: Number, default: 0 },
          url: { type: String, default: "" },
          uploadedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

projectSchema.index({ owner: 1, updatedAt: -1 });
projectSchema.set("toJSON", {
  virtuals: true,
  transform: (_, ret) => {
    ret.id = ret._id?.toString() || null;
    delete ret._id;
    ret.userId = ret.owner?.toString() || null;
    delete ret.owner;
  },
});
projectSchema.set("toObject", {
  virtuals: true,
  transform: (_, ret) => {
    ret.id = ret._id?.toString() || null;
    delete ret._id;
    ret.userId = ret.owner?.toString() || null;
    delete ret.owner;
  },
});
export const Project =
  mongoose.models.Project || mongoose.model("Project", projectSchema);
