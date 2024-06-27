document.addEventListener("DOMContentLoaded", () => {
  let mediaRecorder;
  let audioChunks = [];
  let previousStory = "";
  let previousInputs = [];
  let inputCount = 0;
  const form = document.getElementById("storyForm");
  const mainActionButton = document.getElementById("main-action");
  const storyContainer = document.getElementById("story-container");

  /**
   * Event listener for form submission to generate the initial story.
   */
  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const genre = document.getElementById("genre").value;
    const childGender = document.getElementById("childGender").value;
    const theme = document.getElementById("theme").value;
    const age = document.getElementById("age").value;

    mainActionButton.innerText = "Loading...";
    mainActionButton.disabled = true;
    storyContainer.innerHTML = "";

    try {
      const response = await fetch("/generate-story", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ genre, childGender, theme, age }),
      });

      if (response.ok) {
        const data = await response.json();
        displayStoryPart(data.story, data.image, data.audioUrl, data.choices);
        mainActionButton.style.display = "none";
      } else {
        console.error("Error generating story:", response.statusText);
      }
    } catch (error) {
      console.error("Error generating story:", error);
    } finally {
      mainActionButton.innerText = "What happens next?";
      mainActionButton.disabled = false;
    }
  });

  /**
   * Creates a new action button for the user to interact with the story.
   */
  function createNewActionButton() {
    const newActionButton = document.createElement("button");
    newActionButton.innerText = "What happens next?";
    newActionButton.classList.add("action-button");
    newActionButton.addEventListener("click", async () => {
      if (newActionButton.innerText === "What happens next?") {
        startRecording(newActionButton);
      } else if (
        newActionButton.innerText ===
        "Choose with your voice and click when finished."
      ) {
        stopRecording(newActionButton);
      }
    });
    return newActionButton;
  }

  /**
   * Starts audio recording and changes the button text to "Choose with your voice and click when finished."
   * @param {HTMLElement} button - The button element to update.
   */
  function startRecording(button) {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (event) => {
          audioChunks.push(event.data);
        };
        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
          const formData = new FormData();
          formData.append("audio", audioBlob, "audio.webm");

          fetch("/transcribe", {
            method: "POST",
            body: formData,
          })
            .then((response) => response.json())
            .then((data) => {
              const cleanedInput = cleanUserInput(data.transcription);
              addStoryPart(cleanedInput, true);
              fetchStoryContinuation(cleanedInput, button);
            })
            .catch((error) =>
              console.error(
                "There was a problem with the fetch operation:",
                error
              )
            );
        };

        mediaRecorder.start();
        button.innerText = "Choose with your voice and click when finished.";
      });
    } else {
      console.error("Your browser does not support audio recording.");
    }
  }

  /**
   * Stops audio recording and changes the button text to "Loading...".
   * @param {HTMLElement} button - The button element to update.
   */
  function stopRecording(button) {
    mediaRecorder.stop();
    button.innerText = "Loading...";
    button.disabled = true;
  }

  /**
   * Displays a part of the story with text, image, audio, and choices.
   * @param {string} text - The story text to display.
   * @param {string} image - The URL of the image to display.
   * @param {string} audioUrl - The URL of the audio to display.
   * @param {Array} choices - The choices for the next part of the story.
   */
  function displayStoryPart(text, image, audioUrl, choices) {
    const storyPart = document.createElement("div");
    storyPart.className = "story-part";
    storyPart.innerHTML = `
      <p>${text.replace(/\n/g, "<br><br>")}</p>
      <img src="${image}" alt="Story Image" style="width: 50%;" />
      <audio controls src="${audioUrl}"></audio>
      ${choices.map((choice) => `<p>${choice}</p>`).join("")}
    `;
    storyContainer.appendChild(storyPart);

    const newActionButton = createNewActionButton();
    storyContainer.appendChild(newActionButton);
    storyContainer.scrollTop = storyContainer.scrollHeight;
  }

  /**
   * Adds a user input part to the story.
   * @param {string} text - The user input text to add.
   * @param {boolean} isUserInput - Flag indicating if the text is user input.
   */
  function addStoryPart(text, isUserInput) {
    const part = document.createElement("div");
    part.className = isUserInput ? "user-input" : "story-part";
    part.innerHTML = text.replace(/\n/g, "<br><br>");
    storyContainer.appendChild(part);
    storyContainer.scrollTop = storyContainer.scrollHeight;
  }

  /**
   * Fetches the continuation of the story based on user input.
   * @param {string} userInput - The user input to base the story continuation on.
   * @param {HTMLElement} button - The button element to update.
   */
  async function fetchStoryContinuation(userInput, button) {
    try {
      const response = await fetch("/continue-story", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userInput,
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
      displayStoryPart(
        result.story,
        result.image,
        result.audioUrl,
        result.choices
      );
      previousStory += " " + result.story.trim();
      previousInputs.push(userInput);
      inputCount++;
    } catch (error) {
      console.error("Error continuing the story:", error);
    } finally {
      button.innerText = "What happens next?";
      button.disabled = false;
    }
  }

  /**
   * Cleans user input by removing previously recorded inputs from it.
   * @param {string} userInput - The user input to clean.
   * @returns {string} - The cleaned user input.
   */
  function cleanUserInput(userInput) {
    let cleanInput = userInput.trim();

    previousInputs.forEach((input) => {
      const escapedInput = input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(^|\\s)${escapedInput}(?=$|[.,!?\s])`, "gi");
      cleanInput = cleanInput.replace(regex, "").trim();
    });

    return cleanInput;
  }
});
