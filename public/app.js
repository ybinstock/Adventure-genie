document.addEventListener("DOMContentLoaded", () => {
  let mediaRecorder;
  let audioChunks = [];
  let previousStory = "";
  let previousInputs = [];
  let inputCount = 0;
  const form = document.getElementById("storyForm");
  const mainActionButton = document.getElementById("main-action");
  const storyContainer = document.getElementById("story-container");
  const loadingDiv = document.getElementById("loading");

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const genre = document.getElementById("genre").value;
    const childGender = document.getElementById("childGender").value;
    const theme = document.getElementById("theme").value;
    const age = document.getElementById("age").value;
    const artStyle = document.getElementById("artStyle").value;

    loadingDiv.style.display = "block";
    storyContainer.innerHTML = "";
    document.getElementById("audioOutput").innerHTML = "";
    mainActionButton.style.display = "none"; // Hide the main action button

    try {
      const response = await fetch("/generate-story", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ genre, childGender, theme, age, artStyle }),
      });

      if (response.ok) {
        const data = await response.json();
        displayStoryPart(data.story, data.image, data.audioUrl);
        addChoices(data.choices);
        createNextButton();
      } else {
        console.error("Error generating story:", response.statusText);
      }
    } catch (error) {
      console.error("Error generating story:", error);
    } finally {
      loadingDiv.style.display = "none";
    }
  });

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
        button.innerText = "Finished";
      });
    } else {
      console.error("Your browser does not support audio recording.");
    }
  }

  function stopRecording(button) {
    mediaRecorder.stop();
    button.innerText = "Loading...";
    button.disabled = true;
  }

  function displayStoryPart(text, image, audioUrl) {
    const storyPart = document.createElement("div");
    storyPart.className = "story-part";
    storyPart.innerHTML = `
      <p>${text.replace(/\n/g, "<br><br>")}</p>
      <img src="${image}" alt="Story Image" style="width: 50%;" />
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

  function createNextButton() {
    const nextButton = document.createElement("button");
    nextButton.className = "main-action";
    nextButton.innerText = "What happens next?";
    nextButton.disabled = false;
    nextButton.onclick = async () => {
      if (nextButton.innerText === "What happens next?") {
        startRecording(nextButton);
      } else if (nextButton.innerText === "Finished") {
        stopRecording(nextButton);
      }
    };
    storyContainer.appendChild(nextButton);
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
      addChoices(result.choices);
      previousStory += " " + result.story.trim();
      previousInputs.push(userInput);
      inputCount++;
      document.querySelector(".main-action").style.display = "none"; // Hide the previous button
      createNextButton(); // Create the next button at the bottom
    } catch (error) {
      console.error("Error continuing the story:", error);
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
