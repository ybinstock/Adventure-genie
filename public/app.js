console.log("version 0.2.2");

document.addEventListener("DOMContentLoaded", () => {
  let mediaRecorder;
  let audioChunks = [];
  let previousStory = "";
  let previousInputs = []; // Array to store all previous user inputs
  let inputCount = 0; // Track the number of user inputs

  const startButton = document.getElementById("start-recording");
  const stopButton = document.getElementById("stop-recording");
  const storyContainer = document.getElementById("story-container");

  const initialStoryParts = [
    `In a distant future, in a galaxy far away, a 10-year-old girl named Luna was preparing for her first solo space adventure. Luna had always dreamt of exploring the unknown, and today, her dream was coming true. She was equipped with a state-of-the-art space suit and a tiny, but incredibly advanced, spaceship named StarWing. Luna's mission was to explore the mysterious Planet X, a world filled with secrets and adventures waiting to be discovered.`,
    `As Luna landed on Planet X, her ship's sensors picked up strange signals from deep within the planet's core. She knew she had to investigate, but how? Luna could take her hoverboard to quickly navigate the surface, use her digging tool to explore underground caves, or activate her drone to scout the area from above. Each option held the promise of a new adventure, and Luna had to choose wisely.`,
  ];

  // Function to clean the user input by checking for repetition against all previous inputs
  function cleanUserInput(userInput) {
    let cleanInput = userInput.trim();
    console.log("Initial userInput:", cleanInput);

    previousInputs.forEach((input, index) => {
      const escapedInput = input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // Escape special characters for regex
      const regex = new RegExp(escapedInput, "gi"); // Removed word boundaries
      console.log(`Regex for previous input ${index + 1}:`, regex);

      if (regex.test(cleanInput)) {
        cleanInput = cleanInput.replace(regex, "").trim();
        console.log(
          `Cleaning user input at iteration ${index + 1}:`,
          cleanInput
        );
      }
    });

    console.log("Final cleaned input:", cleanInput);
    return cleanInput;
  }

  // Function to fetch story continuation from the server
  async function fetchStoryContinuation(userInput) {
    try {
      const cleanedInput = cleanUserInput(userInput);
      console.log(
        "User cleanedInput Input for Continuation (client-side):",
        cleanedInput
      );

      const response = await fetch("/continue-story", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userInput: cleanedInput,
          previousStory,
          inputCount,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Network response was not ok: ${response.statusText} - ${errorText}`
        );
      }

      const result = await response.json();
      addStoryPart(result.story, false);
      if (result.choices.length === 0) {
        startButton.disabled = true; // Disable the button when the story concludes
      } else {
        addChoices(result.choices);
      }
      previousStory += " " + result.story.trim(); // Append only the AI-generated part to the previous story
      previousInputs.push(cleanedInput); // Store the cleaned user input
      inputCount++; // Increment the input count
    } catch (error) {
      console.error("Error continuing the story:", error);
    }
  }

  // Function to add a part of the story to the DOM
  function addStoryPart(text, isUserInput) {
    const part = document.createElement("div");
    part.className = isUserInput ? "user-input" : "story-part";
    part.innerHTML = text.replace(/\n/g, "<br><br>"); // Replace newlines with paragraph breaks
    storyContainer.appendChild(part);
    storyContainer.scrollTop = storyContainer.scrollHeight;
  }

  // Function to add choices to the DOM
  function addChoices(choices) {
    const choicesDiv = document.createElement("div");
    choicesDiv.className = "choices";
    choices.forEach((choice) => {
      const choiceP = document.createElement("p");
      choiceP.textContent = choice;
      choicesDiv.appendChild(choiceP);
    });
    storyContainer.appendChild(choicesDiv);
    storyContainer.scrollTop = storyContainer.scrollHeight;
    startButton.disabled = false; // Enable the "What happens next?" button when choices are presented
  }

  // Event listener for the start recording button
  startButton.addEventListener("click", async () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("audio", audioBlob, "audio.webm");

        try {
          const response = await fetch("/transcribe", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
              `Network response was not ok: ${response.statusText} - ${errorText}`
            );
          }

          const result = await response.json();
          const cleanedInput = cleanUserInput(result.transcription);
          console.log(
            "User Transcription (client-side):",
            result.transcription
          );
          console.log("Cleaned User Input (client-side):", cleanedInput);
          addStoryPart(cleanedInput, true); // Add the cleaned user input to the story
          await fetchStoryContinuation(cleanedInput);
        } catch (error) {
          console.error("There was a problem with the fetch operation:", error);
        }
      };

      mediaRecorder.start();
      startButton.disabled = true;
      stopButton.disabled = false; // Enable the "Finished" button when recording starts
    } else {
      console.error("Your browser does not support audio recording.");
    }
  });

  // Event listener for the stop recording button
  stopButton.addEventListener("click", () => {
    mediaRecorder.stop();
    stopButton.disabled = true; // Disable the "Finished" button after stopping the recording
  });

  // Function to start the initial story
  function startStory() {
    addStoryPart(initialStoryParts[0], false);
    previousStory = initialStoryParts[0]; // Initialize previous story
    addChoices([
      "1. Luna could take her hoverboard to quickly navigate the surface.",
      "2. Luna could use her digging tool to explore underground caves.",
      "3. Luna could activate her drone to scout the area from above.",
    ]);
  }

  startStory();
});
