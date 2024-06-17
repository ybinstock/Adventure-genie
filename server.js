require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const multer = require("multer");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + ".webm");
  },
});

const upload = multer({ storage: storage });

const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

app.post("/transcribe", upload.single("audio"), async (req, res) => {
  try {
    console.log("File received:", req.file);
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(req.file.path),
      model: "whisper-1",
    });

    fs.unlinkSync(req.file.path);
    res.json({ transcription: transcription.text });
  } catch (error) {
    console.error("Error transcribing audio:", error.message);
    res.status(500).json({ error: "Error transcribing audio" });
  }
});

app.post("/continue-story", async (req, res) => {
  const { userInput } = req.body;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a creative AI that helps continue a sci-fi adventure story for a 10-year-old girl.",
        },
        {
          role: "user",
          content: `Continue the story. The user input was: "${userInput}"`,
        },
        {
          role: "assistant",
          content:
            "Please provide a continuation of the story. End the story with a sentence prompting the reader to make a decision.",
        },
      ],
      max_tokens: 300,
    });

    let storyText = response.choices[0].message.content;

    const choicesResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a creative AI that helps continue a sci-fi adventure story for a 10-year-old girl.",
        },
        {
          role: "user",
          content: `Generate three relevant choices for the next part of the story based on the following continuation: "${storyText}"`,
        },
      ],
      max_tokens: 100,
    });

    const choices = choicesResponse.choices[0].message.content
      .split("\n")
      .filter((choice) => choice.trim() !== "")
      .slice(0, 3) // Take only the first three choices
      .map((choice) => choice.replace(/^\d+\.\s*/, "")); // Remove leading numbers

    // Ensure a paragraph break before the choices
    storyText = storyText.trim() + "\n\n";

    res.json({ story: storyText, choices });
  } catch (error) {
    console.error("Error generating story:", error.message);
    res.status(500).json({ error: "Error generating story" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
