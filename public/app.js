document.addEventListener("DOMContentLoaded", () => {
  let mediaRecorder;
  let audioChunks = [];
  let previousStory = "";
  let previousInputs = [];
  let inputCount = 0;
  const form = document.getElementById("storyForm");
  const mainActionButton = document.getElementById("main-action");
  const storyContainer = document.getElementById("story-container");

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const genre = document.getElementById("genre").value;
    const childGender = document.getElementById("childGender").value;
    const theme = document.getElementById("theme").value;
    const age = document.getElementById("age").value;

    mainActionButton.disabled = true;
    mainActionButton.innerText = "Loading...";

    storyContainer.innerHTML = "";
    document.getElementById("audioOutput").innerHTML = "";

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
        displayStoryPart(data.story, data.image, data.audioUrl);
        mainActionButton.innerText = "What happens next?";
        mainActionButton.disabled = false;
      } else {
        console.error("Error generating story:", response.statusText);
      }
    } catch (error) {
      console.error("Error generating story:", error);
    }
  });

  mainActionButton.addEventListener("click", async () => {
    if (mainActionButton.innerText === "What happens next?") {
      startRecording();
    } else if (mainActionButton.innerText === "Finished") {
      stopRecording();
    }
  });

  function startRecording() {
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
              fetchStoryContinuation(cleanedInput);
            })
            .catch((error) =>
              console.error(
                "There was a problem with the fetch operation:",
                error
              )
            );
        };

        mediaRecorder.start();
        mainActionButton.innerText = "Finished";
      });
    } else {
      console.error("Your browser does not support audio recording.");
    }
  }

  function stopRecording() {
    mediaRecorder.stop();
    mainActionButton.innerText = "Loading...";
    mainActionButton.disabled = true;
  }

  function displayStoryPart(text, image, audioUrl) {
    const storyPart = document.createElement("div");
    storyPart.className = "story-part";
    storyPart.innerHTML = `
      <p>${text.replace(/\n/g, "<br><br>")}</p>
      <img src="${image}" alt="Story Image" style="width: 100%;" />
      <audio controls src="${audioUrl}"></audio>
    `;
    storyContainer.appendChild(storyPart);
  }

  function addStoryPart(text, isUserInput) {
    const part = document.createElement("div");
    part.className = isUserInput ? "user-input" : "story-part";
    part.innerHTML = text.replace(/\n/g, "<br><br>");
    storyContainer.appendChild(part);
    storyContainer.scrollTop = storyContainer.scrollHeight;
  }

  async function fetchStoryContinuation(userInput) {
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
      displayStoryPart(result.story, result.image, result.audioUrl);
      if (result.choices.length === 0) {
        mainActionButton.disabled = true;
      } else {
        addChoices(result.choices);
      }
      previousStory += " " + result.story.trim();
      previousInputs.push(userInput);
      inputCount++;
    } catch (error) {
      console.error("Error continuing the story:", error);
    } finally {
      mainActionButton.innerText = "What happens next?";
      mainActionButton.disabled = false;
    }
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
  }

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
