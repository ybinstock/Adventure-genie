require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

// Endpoint to generate initial story
app.post("/generate-story", async (req, res) => {
  const { genre, name } = req.body;

  const prompt = `Create a bedtime story in the ${genre} genre, featuring a child named ${name}.`;

  try {
    const response = await openai.completions.create({
      model: "text-davinci-003",
      prompt: prompt,
      max_tokens: 500,
    });

    const story = response.choices[0].text.trim();

    // Generate image using DALL-E
    const imageResponse = await openai.images.generate({
      prompt: `A scene from a ${genre} story featuring a child named ${name}`,
      n: 1,
      size: "512x512",
    });
    const imageUrl = imageResponse.data[0].url;

    // Generate audio narration
    const audioResponse = await axios.post(
      "https://api.some-audio-service.com/generate",
      { text: story }
    );
    const audioUrl = audioResponse.data.url;

    res.json({ story, imageUrl, audioUrl });
  } catch (error) {
    console.error("Error generating story:", error.message);
    res.status(500).json({ error: "Error generating story" });
  }
});

// Existing Adventure Genie code for continuing the story
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = "uploads/";
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + ".webm");
  },
});

const upload = multer({ storage: storage });

const countTokens = (text) => {
  return text.split(" ").length;
};

// Endpoint to handle audio transcription
app.post("/transcribe", upload.single("audio"), async (req, res) => {
  try {
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

// Endpoint to continue the story based on user input
app.post("/continue-story", async (req, res) => {
  const { userInput, previousStory, inputCount } = req.body;
  console.log(`Input Count: ${inputCount}`);
  console.log(`User Input (server-side): ${userInput}`);
  try {
    const storyPrompt = `${previousStory}\n\nThe user input is: "${userInput}".\n\nPlease continue the story based on the user's input ${
      inputCount < 2
        ? "End the current segment with a sentence prompting the reader to make a decision."
        : "Conclude the story in a dramatic conclusion."
    }`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a creative AI that helps continue a sci-fi adventure story for a 10-year-old girl.",
        },
        { role: "user", content: storyPrompt },
      ],
      max_tokens: 300,
    });

    let storyText = response.choices[0].message.content;

    let choices = [];
    if (inputCount < 2) {
      const choicesPrompt = `Based on the following continuation, generate three relevant choices for the next part of the story. Each choice must be 20 tokens or fewer:\n\n${storyText}`;

      const choicesResponse = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "You are a creative AI that helps continue a sci-fi adventure story for a 10-year-old girl.",
          },
          { role: "user", content: choicesPrompt },
        ],
        max_tokens: 100,
      });

      choices = choicesResponse.choices[0].message.content
        .split("\n")
        .filter((choice) => choice.trim() !== "")
        .map((choice) => choice.replace(/^\d+\.\s*/, "").trim()) // Remove leading numbers and trim spaces
        .filter((choice) => countTokens(choice) <= 20) // Ensure each choice is 20 tokens or fewer
        .slice(0, 3) // Take only the first three choices
        .map((choice, index) => `${index + 1}. ${choice}`); // Add leading numbers
    }

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
