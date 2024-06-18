document.addEventListener("DOMContentLoaded", () => {
  let mediaRecorder;
  let audioChunks = [];
  let previousStory = "";

  const startButton = document.getElementById("start-recording");
  const stopButton = document.getElementById("stop-recording");
  const storyContainer = document.getElementById("story-container");

  const initialStoryParts = [
    `In a distant future, in a galaxy far away, a 10-year-old girl named Luna was preparing for her first solo space adventure. Luna had always dreamt of exploring the unknown, and today, her dream was coming true. She was equipped with a state-of-the-art space suit and a tiny, but incredibly advanced, spaceship named StarWing. Luna's mission was to explore the mysterious Planet X, a world filled with secrets and adventures waiting to be discovered.`,
    `As Luna landed on Planet X, her ship's sensors picked up strange signals from deep within the planet's core. She knew she had to investigate, but how? Luna could take her hoverboard to quickly navigate the surface, use her digging tool to explore underground caves, or activate her drone to scout the area from above. Each option held the promise of a new adventure, and Luna had to choose wisely.`,
  ];

  async function fetchStoryContinuation(userInput) {
    try {
      const response = await fetch("/continue-story", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userInput, previousStory }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Network response was not ok: ${response.statusText} - ${errorText}`
        );
      }

      const result = await response.json();
      addStoryPart(result.story, false);
      addChoices(result.choices);
      previousStory += " " + result.story; // Append the new story part to the previous story
    } catch (error) {
      console.error("Error continuing the story:", error);
    }
  }

  function addStoryPart(text, isUserInput) {
    const part = document.createElement("div");
    part.className = isUserInput ? "user-input" : "story-part";
    part.innerHTML = text.replace(/\n/g, "<br><br>"); // Replace newlines with paragraph breaks
    storyContainer.appendChild(part);
    storyContainer.scrollTop = storyContainer.scrollHeight;
  }

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
          addStoryPart(result.transcription, true);
          await fetchStoryContinuation(result.transcription);
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

  stopButton.addEventListener("click", () => {
    mediaRecorder.stop();
    stopButton.disabled = true; // Disable the "Finished" button after stopping the recording
  });

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
