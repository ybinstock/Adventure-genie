require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const multer = require("multer"); // Add multer

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

// Configure multer
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

async function generateStorySegment(genre, childGender, theme, age) {
  const prompt = `Write the first segment of a children's story for a ${age}-year-old ${childGender} about ${theme}. The genre is ${genre}.`;
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
  });
  return response.choices[0].message.content.trim();
}

async function generateImage(description, index) {
  const prompt = `An illustration in a consistent art style, with no text, no captions, no words, high quality. ${description}`;
  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt: prompt,
    n: 1,
    size: "1024x1024",
  });
  const imageUrl = response.data[0].url;
  const imageResponse = await axios({
    url: imageUrl,
    method: "GET",
    responseType: "arraybuffer",
  });
  const imagePath = path.resolve(
    `./generated/story_image_part_${index + 1}.jpg`
  );
  fs.writeFileSync(imagePath, Buffer.from(imageResponse.data));
  return `story_image_part_${index + 1}.jpg`;
}

async function generateVoiceover(text) {
  const response = await openai.audio.speech.create({
    model: "tts-1",
    voice: "nova",
    input: text,
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  const audioPath = path.resolve("./generated/story_voice.mp3");
  fs.writeFileSync(audioPath, buffer);
  return "story_voice.mp3";
}

app.post("/generate-story", async (req, res) => {
  try {
    const { genre, childGender, theme, age } = req.body;
    const storySegment = await generateStorySegment(
      genre,
      childGender,
      theme,
      age
    );

    const imagePath = await generateImage(
      `A scene from the story: ${storySegment}.`,
      0
    );
    const audioPath = await generateVoiceover(storySegment);

    res.json({ story: storySegment, image: imagePath, audioUrl: audioPath });
  } catch (error) {
    console.error("Error generating story:", error);
    res.status(500).send("Error generating story");
  }
});

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
