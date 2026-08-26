import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, default: "New Chat" },
    messages: [
      {
        id: { type: String, required: true },
        role: { type: String, enum: ["user", "assistant"], required: true },
        content: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { _id: false },
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
    systemPrompt: { type: String, trim: true, default: "You are a helpful AI assistant." },
    temperature: { type: Number, default: 0.7, min: 0, max: 1 },
    maxTokens: { type: Number, default: 2048, min: 256, max: 8192 },
    conversationCount: { type: Number, default: 0, min: 0 },
    conversations: [conversationSchema],
    files: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        size: { type: Number, default: 0 },
        url: { type: String, default: "" },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

projectSchema.set("toJSON", {
  virtuals: true,
  transform: (_, ret) => {
    ret.id = ret._id ? ret._id.toString() : null;
    delete ret._id;
    ret.userId = ret.owner ? ret.owner.toString() : null;
    delete ret.owner;
  },
});

projectSchema.set("toObject", {
  virtuals: true,
  transform: (_, ret) => {
    ret.id = ret._id ? ret._id.toString() : null;
    delete ret._id;
    ret.userId = ret.owner ? ret.owner.toString() : null;
    delete ret.owner;
  },
});

export const Project = mongoose.model("Project", projectSchema);
