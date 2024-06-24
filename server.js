require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const multer = require("multer");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "uploads");
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

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public"))); // Ensure correct static file path

// Ensure the generated directory exists
const generatedDir = path.join(__dirname, "public", "generated");
if (!fs.existsSync(generatedDir)) {
  fs.mkdirSync(generatedDir, { recursive: true });
}

// Function to generate images
async function generateImage(description, index) {
  console.log(`Generating image ${index + 1}...`);
  const prompt = `An illustration in a consistent art style, with no text, no captions, no words, high quality. ${description}`;
  try {
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
      `./public/generated/story_image_part_${index + 1}.jpg`
    );
    fs.writeFileSync(imagePath, Buffer.from(imageResponse.data));
    console.log(`Image ${index + 1} generated.`);
    return `generated/story_image_part_${index + 1}.jpg`;
  } catch (error) {
    console.error(`Error generating image ${index + 1}:`, error);
    throw error;
  }
}

// Function to generate voiceovers
async function generateVoiceover(text, index) {
  console.log("Generating voiceover...");
  try {
    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: text,
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    const audioPath = path.resolve(
      `./public/generated/story_voice_part_${index + 1}.mp3`
    );
    fs.writeFileSync(audioPath, buffer);
    console.log("Voiceover generated.");
    return `generated/story_voice_part_${index + 1}.mp3`;
  } catch (error) {
    console.error("Error generating voiceover:", error);
    throw error;
  }
}

// Endpoint to generate initial story
app.post("/generate-story", async (req, res) => {
  const { genre, childGender, theme, age, artStyle } = req.body;

  const prompt = `Create a bedtime story in the ${genre} genre, featuring a ${childGender} aged ${age} with a theme of ${theme}. Illustrate it in ${artStyle} style.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a creative storyteller." },
        { role: "user", content: prompt },
      ],
      max_tokens: 500,
    });

    const story = response.choices[0].message.content.trim();

    // Generate image for the story
    const image = await generateImage(story, 0);

    // Generate audio narration
    const audioUrl = await generateVoiceover(story, 0);

    // Return the story, image, and audio URL
    res.json({ story, image, audioUrl });
  } catch (error) {
    console.error("Error generating story:", error.message);
    res.status(500).json({ error: "Error generating story" });
  }
});

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

    // Generate image for the new story segment
    const image = await generateImage(storyText, inputCount);

    // Generate audio narration for the new story segment
    const audioUrl = await generateVoiceover(storyText, inputCount);

    storyText = storyText.trim() + "\n\n";
    res.json({ story: storyText, choices, image, audioUrl });
  } catch (error) {
    console.error("Error generating story:", error.message);
    res.status(500).json({ error: "Error generating story" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
