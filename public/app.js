document.addEventListener("DOMContentLoaded", () => {
  let mediaRecorder;
  let audioChunks = [];
  let previousStory = "";
  let previousInputs = [];
  let inputCount = 0;
  const mainActionButton = document.getElementById("mainActionButton");
  const storyContainer = document.getElementById("story-container");

  document
    .getElementById("storyForm")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      mainActionButton.disabled = true;
      mainActionButton.innerText = "Loading...";

      const genre = document.getElementById("genre").value;
      const childGender = document.getElementById("childGender").value;
      const theme = document.getElementById("theme").value;
      const age = document.getElementById("age").value;
      const artStyle = document.getElementById("artStyle").value;

      const response = await fetch("/generate-story", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ genre, childGender, theme, age, artStyle }),
      });

      if (response.ok) {
        const data = await response.json();
        displayStoryPart(data.story, data.image, data.audioUrl, data.choices);
        mainActionButton.innerText = "What happens next?";
      } else {
        console.error("Error generating story:", response.statusText);
        mainActionButton.innerText = "Create Story";
      }
      mainActionButton.disabled = false;
    });

  mainActionButton.addEventListener("click", async () => {
    if (mainActionButton.innerText === "Finished") {
      stopRecording();
    } else if (mainActionButton.innerText === "What happens next?") {
      startRecording();
    }
  });

  function startRecording() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = (event) => {
          audioChunks.push(event.data);
        };
        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
          const formData = new FormData();
          formData.append("audio", audioBlob, "audio.webm");

          mainActionButton.disabled = true;
          mainActionButton.innerText = "Loading...";

          const response = await fetch("/transcribe", {
            method: "POST",
            body: formData,
          });

          if (response.ok) {
            const data = await response.json();
            const userInput = data.transcription.trim();
            previousInputs.push(userInput);
            previousStory += `\n${userInput}`;
            inputCount++;

            const continueResponse = await fetch("/continue-story", {
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

            if (continueResponse.ok) {
              const continueData = await continueResponse.json();
              displayStoryPart(
                continueData.story,
                null,
                null,
                continueData.choices
              );
              mainActionButton.innerText = "What happens next?";
            } else {
              console.error(
                "Error continuing story:",
                continueResponse.statusText
              );
              mainActionButton.innerText = "What happens next?";
            }
          } else {
            console.error("Error transcribing audio:", response.statusText);
            mainActionButton.innerText = "What happens next?";
          }
          mainActionButton.disabled = false;
        };
        mediaRecorder.start();
        mainActionButton.innerText = "Finished";
      });
    } else {
      console.error("getUserMedia not supported on your browser!");
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  }

  function displayStoryPart(story, imageUrl, audioUrl, choices) {
    const part = document.createElement("div");
    part.className = "story-part";

    const storyText = document.createElement("p");
    storyText.innerText = story;
    part.appendChild(storyText);

    if (imageUrl) {
      const img = document.createElement("img");
      img.src = imageUrl;
      img.alt = "Story Image";
      img.style.width = "100%";
      part.appendChild(img);
    }

    if (audioUrl) {
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.src = audioUrl;
      part.appendChild(audio);
    }

    if (choices && choices.length > 0) {
      const choicesContainer = document.createElement("div");
      choicesContainer.className = "choices";
      choices.forEach((choice) => {
        const choiceParagraph = document.createElement("p");
        choiceParagraph.innerText = choice;
        choicesContainer.appendChild(choiceParagraph);
      });
      part.appendChild(choicesContainer);
    }

    storyContainer.appendChild(part);
    part.scrollIntoView({ behavior: "smooth" });

    const newButton = document.createElement("button");
    newButton.innerText = "What happens next?";
    newButton.id = "mainActionButton";
    newButton.disabled = false;
    storyContainer.appendChild(newButton);

    mainActionButton.remove();
    mainActionButton = newButton;
  }
});
