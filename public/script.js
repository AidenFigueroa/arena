// === Global Variables ===
let savedSteps = [];
let bracketFighters = [];
let bracketRounds = [];
let outroTemplates = [
    "As the final echoes of combat faded into the wind, the battlefield stood silent once more. Only one warrior remained standing — bloodied, breathless, but victorious. Their journey would continue, marked forever by the struggle that had unfolded. The fallen opponent lay still, a reminder of what was lost and what it took to endure.",
    
    "With the battle decided and the storm within settled, the lone victor surveyed the remnants of the clash. Though the scars would remain, their resolve had triumphed over all. The fallen’s legacy would be remembered, but it was the survivor who now walked forward alone.",
    
    "In the wake of destruction, the silence was deafening. One fighter stood amid the wreckage — not without cost, but unbroken. The battle had ended. A chapter closed in blood and dust.",
    
    "The final blow echoed like thunder across the battlefield. With their adversary vanquished, the victor stood still, caught between triumph and reflection. This moment would be carved into legend, not for the violence — but for the will to endure.",
    
    "Smoke drifted into the sky as the lone warrior lowered their weapon. Victory had come at a price, and though they stood alone, the path forward was now theirs to claim. The fallen would fade, but the fire of the survivor burned brighter than ever."
  ];
  

window.onload = () => {
  renderFighterList();
};

// === Regular Battle UI Logic ===
function addTeamFighter(containerId) {
  const container = document.getElementById(containerId);
  const div = document.createElement("div");
  div.className = "border p-2 bg-secondary rounded";
  div.innerHTML = `
    <input type="text" class="form-control mb-2" placeholder="Fighter Name" />
    <input type="text" class="form-control mb-2" placeholder="Mental Skills" />
    <input type="text" class="form-control mb-2" placeholder="Physical Skills" />
    <input type="text" class="form-control mb-2" placeholder="Items/Gear" />
    <button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">Remove</button>
  `;
  container.appendChild(div);
}

function getFightersFrom(containerId) {
  return [...document.querySelectorAll(`#${containerId} > div`)].map(div => {
    const inputs = div.querySelectorAll("input");
    return {
      name: inputs[0].value.trim(),
      mental: inputs[1].value.trim(),
      physical: inputs[2].value.trim(),
      item: inputs[3]?.value.trim()
    };
  }).filter(f => f.name);
}

function showLoading(isLoading) {
  document.getElementById("loadingSpinner").style.display = isLoading ? "block" : "none";
}

function showAvatars(url1, url2) {
  if (url1) document.getElementById("avatar1Img").src = url1;
  if (url2) document.getElementById("avatar2Img").src = url2;
  if (url1 || url2) document.getElementById("avatars").classList.remove("d-none");
}


// === Live AI Generation Progress ===
let battleProgressSource = null;
let battleProgressTimer = null;
let battleProgressStartedAt = 0;

function formatElapsed(ms) {
  const totalSeconds =
    Math.max(0, Math.floor(ms / 1000));

  const minutes =
    Math.floor(totalSeconds / 60);

  const seconds =
    totalSeconds % 60;

  return minutes > 0
    ? `${minutes}m ${String(seconds).padStart(2, "0")}s`
    : `${seconds}s`;
}

function getOrCreateProgressPanel() {
  let panel =
    document.getElementById(
      "generationProgress"
    );

  if (panel) {
    return panel;
  }

  panel =
    document.createElement("div");

  panel.id =
    "generationProgress";

  panel.className =
    "card bg-dark text-light border-secondary mt-4 d-none";

  panel.innerHTML = `
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h5 class="mb-0 text-warning">AI Battle Generation</h5>
        <span id="generationElapsed" class="small text-secondary">0s</span>
      </div>

      <div class="progress mb-3" style="height: 10px;">
        <div
          id="generationOverallBar"
          class="progress-bar progress-bar-striped progress-bar-animated"
          role="progressbar"
          style="width: 2%;"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="2"
        ></div>
      </div>

      <div id="generationStage" class="mb-3">
        Preparing battle...
      </div>

      <div class="row g-2 mb-3">
        <div class="col-12 col-md-3">
          <div id="storyProgressCard" class="border rounded p-2 h-100">
            <div class="small text-secondary">Story</div>
            <div class="progress-status">Waiting</div>
          </div>
        </div>

        <div class="col-12 col-md-3">
          <div id="panelProgressCard1" class="border rounded p-2 h-100">
            <div class="small text-secondary">Panel 1</div>
            <div class="progress-status">Waiting</div>
          </div>
        </div>

        <div class="col-12 col-md-3">
          <div id="panelProgressCard2" class="border rounded p-2 h-100">
            <div class="small text-secondary">Panel 2</div>
            <div class="progress-status">Waiting</div>
          </div>
        </div>

        <div class="col-12 col-md-3">
          <div id="panelProgressCard3" class="border rounded p-2 h-100">
            <div class="small text-secondary">Panel 3</div>
            <div class="progress-status">Waiting</div>
          </div>
        </div>
      </div>

      <div class="border rounded bg-black p-2">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <span class="small text-secondary">Generation log</span>
          <span id="generationPercent" class="small text-secondary">2%</span>
        </div>

        <pre
          id="generationLog"
          class="mb-0 text-light"
          style="max-height: 260px; overflow-y: auto; white-space: pre-wrap; font-size: 0.8rem;"
        ></pre>
      </div>
    </div>
  `;

  const battleForm =
    document.getElementById(
      "battleForm"
    );

  battleForm.insertAdjacentElement(
    "afterend",
    panel
  );

  return panel;
}

function setProgressBar(percent) {
  const clamped =
    Math.max(
      2,
      Math.min(100, Math.round(percent))
    );

  const bar =
    document.getElementById(
      "generationOverallBar"
    );

  const label =
    document.getElementById(
      "generationPercent"
    );

  if (bar) {
    bar.style.width =
      `${clamped}%`;

    bar.setAttribute(
      "aria-valuenow",
      String(clamped)
    );

    if (clamped >= 100) {
      bar.classList.remove(
        "progress-bar-animated"
      );
    }
  }

  if (label) {
    label.textContent =
      `${clamped}%`;
  }
}

function setProgressCard(
  elementId,
  text,
  completed = false
) {
  const card =
    document.getElementById(
      elementId
    );

  if (!card) {
    return;
  }

  const status =
    card.querySelector(
      ".progress-status"
    );

  if (status) {
    status.textContent =
      completed
        ? `✓ ${text}`
        : text;
  }

  if (completed) {
    card.classList.add(
      "border-success"
    );
  }
}

function addGenerationLog(
  message,
  level = "INFO",
  elapsedMs = null
) {
  const log =
    document.getElementById(
      "generationLog"
    );

  if (!log) {
    return;
  }

  const elapsed =
    elapsedMs === null
      ? Date.now() -
        battleProgressStartedAt
      : elapsedMs;

  const timestamp =
    formatElapsed(elapsed)
      .padStart(7, " ");

  log.textContent +=
    `[${level}] ${timestamp}  ${message}\n`;

  log.scrollTop =
    log.scrollHeight;
}

function resetProgressPanel() {
  const panel =
    getOrCreateProgressPanel();

  panel.classList.remove(
    "d-none"
  );

  document.getElementById(
    "generationStage"
  ).textContent =
    "Connecting to AI worker...";

  document.getElementById(
    "generationLog"
  ).textContent = "";

  for (const id of [
    "storyProgressCard",
    "panelProgressCard1",
    "panelProgressCard2",
    "panelProgressCard3"
  ]) {
    const card =
      document.getElementById(id);

    if (!card) continue;

    card.classList.remove(
      "border-success",
      "border-danger"
    );

    const status =
      card.querySelector(
        ".progress-status"
      );

    if (status) {
      status.textContent =
        "Waiting";
    }
  }

  const bar =
    document.getElementById(
      "generationOverallBar"
    );

  if (bar) {
    bar.classList.add(
      "progress-bar-animated"
    );
  }

  setProgressBar(2);

  battleProgressStartedAt =
    Date.now();

  if (battleProgressTimer) {
    clearInterval(
      battleProgressTimer
    );
  }

  battleProgressTimer =
    setInterval(() => {
      const elapsed =
        Date.now() -
        battleProgressStartedAt;

      const label =
        document.getElementById(
          "generationElapsed"
        );

      if (label) {
        label.textContent =
          formatElapsed(elapsed);
      }
    }, 500);

  addGenerationLog(
    "Opening live progress stream"
  );
}

function finishProgressTimer() {
  if (battleProgressTimer) {
    clearInterval(
      battleProgressTimer
    );

    battleProgressTimer = null;
  }
}

function updateGenerationProgress(event) {
  const stage =
    document.getElementById(
      "generationStage"
    );

  if (event.message && stage) {
    stage.textContent =
      event.message;
  }

  switch (event.type) {
    case "connected":
      addGenerationLog(
        "Progress stream connected",
        "INFO",
        event.elapsedMs
      );
      break;

    case "battle_start":
      addGenerationLog(
        "Battle request received",
        "INFO",
        event.elapsedMs
      );
      setProgressBar(4);
      break;

    case "story_start":
      setProgressCard(
        "storyProgressCard",
        "Writing..."
      );

      addGenerationLog(
        event.message ||
          "Writing cinematic story",
        "AI",
        event.elapsedMs
      );

      setProgressBar(6);
      break;

    case "story_complete":
      setProgressCard(
        "storyProgressCard",
        event.durationSeconds
          ? `Complete · ${event.durationSeconds}s`
          : "Complete",
        true
      );

      addGenerationLog(
        event.durationSeconds
          ? `Story complete in ${event.durationSeconds}s`
          : "Story complete",
        "AI",
        event.elapsedMs
      );

      setProgressBar(10);
      break;

    case "panel_start":
      setProgressCard(
        `panelProgressCard${event.panel}`,
        "Preparing..."
      );

      addGenerationLog(
        `Panel ${event.panel}/${event.totalPanels}: preparing FLUX workflow`,
        "INFO",
        event.elapsedMs
      );
      break;

    case "comfy_connect":
    case "panel_queued":
    case "comfy_node":
    case "download":
    case "progress_warning":
      setProgressCard(
        `panelProgressCard${event.panel}`,
        event.message
      );

      addGenerationLog(
        event.message,
        event.type === "progress_warning"
          ? "WARN"
          : "COMFY",
        event.elapsedMs
      );
      break;

    case "sampling": {
      const panel =
        Number(event.panel) || 1;

      const panelProgress =
        Number(event.percent) || 0;

      const overall =
        10 +
        (panel - 1) * 30 +
        (panelProgress / 100) * 30;

      setProgressCard(
        `panelProgressCard${panel}`,
        `Sampling ${event.step}/${event.maxSteps} · ${event.percent}%`
      );

      addGenerationLog(
        `Panel ${panel}: ${event.step}/${event.maxSteps} sampling steps (${event.percent}%)`,
        "FLUX",
        event.elapsedMs
      );

      setProgressBar(overall);
      break;
    }

    case "panel_complete": {
      const panel =
        Number(event.panel) || 1;

      setProgressCard(
        `panelProgressCard${panel}`,
        event.durationSeconds
          ? `Complete · ${event.durationSeconds.toFixed(2)}s`
          : "Complete",
        true
      );

      addGenerationLog(
        event.message,
        "DONE",
        event.elapsedMs
      );

      setProgressBar(
        10 + panel * 30
      );
      break;
    }

    case "panel_retry":
      addGenerationLog(
        event.message,
        "RETRY",
        event.elapsedMs
      );
      break;

    case "panel_attempt_failed":
      addGenerationLog(
        event.message,
        "WARN",
        event.elapsedMs
      );
      break;

    case "done":
      addGenerationLog(
        "Battle generation complete",
        "DONE",
        event.elapsedMs
      );

      if (stage) {
        stage.textContent =
          "Battle generation complete";
      }

      setProgressBar(100);
      finishProgressTimer();

      if (battleProgressSource) {
        battleProgressSource.close();
        battleProgressSource = null;
      }
      break;

    case "error":
      addGenerationLog(
        event.message ||
          "Generation failed",
        "ERROR",
        event.elapsedMs
      );

      if (stage) {
        stage.textContent =
          event.message ||
          "Generation failed";
      }

      finishProgressTimer();
      break;
  }
}

function openBattleProgressStream(
  requestId
) {
  if (battleProgressSource) {
    battleProgressSource.close();
  }

  resetProgressPanel();

  battleProgressSource =
    new EventSource(
      `/api/battle-progress/${encodeURIComponent(requestId)}`
    );

  battleProgressSource.onmessage =
    (event) => {
      try {
        const data =
          JSON.parse(event.data);

        updateGenerationProgress(
          data
        );
      } catch (error) {
        console.error(
          "Invalid progress event:",
          error
        );
      }
    };

  return new Promise((resolve) => {
    let resolved = false;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    battleProgressSource.onopen =
      finish;

    setTimeout(
      finish,
      2000
    );
  });
}

function closeBattleProgressStream() {
  if (battleProgressSource) {
    battleProgressSource.close();
    battleProgressSource = null;
  }

  finishProgressTimer();
}

// === Regular Battle Result Helpers ===
function cleanSummaryText(summary) {
  let text = String(summary || "").trim();

  const suspiciousMarkers = [
    "\nIMAGE PROMPT",
    "\nIMAGE_PROMPTS",
    "\n```json",
    "\n{\"scene\"",
    "\n[{\"scene\"",
    "\n], [ {"
  ];

  let cutIndex = text.length;

  for (const marker of suspiciousMarkers) {
    const index = text.toLowerCase().indexOf(marker.toLowerCase());

    if (index !== -1 && index < cutIndex) {
      cutIndex = index;
    }
  }

  return text.slice(0, cutIndex).trim();
}

function summaryToSteps(summary) {
  return cleanSummaryText(summary)
    .split(/\n\s*\n|\n/)
    .map(step => step.trim())
    .filter(Boolean);
}

function displayBattleSteps(steps, winner = "", title = "") {
  const result = document.getElementById("battleResult");
  const resultBox = document.getElementById("resultBox");

  result.innerHTML = "";

  const winnerHeader = document.createElement("h4");
  winnerHeader.className = "text-center text-warning mb-4";

  if (winner) {
    winnerHeader.textContent =
      `🔥 ${winner} wins${title ? ` — ${title}` : ""} 🔥`;
  } else if (title) {
    winnerHeader.textContent = `🔥 ${title} 🔥`;
  } else {
    winnerHeader.textContent = "🔥 Epic Battle Results 🔥";
  }

  result.appendChild(winnerHeader);

  steps.forEach((text, i) => {
    setTimeout(() => {
      const p = document.createElement("p");
      p.className = "step";
      p.textContent = text;
      result.appendChild(p);

      setTimeout(() => p.classList.add("show"), 10);
    }, i * 900);
  });

  resultBox.classList.remove("d-none");
}

function appendComicPanels(images) {
  if (!Array.isArray(images) || images.length === 0) {
    return;
  }

  const result = document.getElementById("battleResult");

  const previousPanels =
    result.querySelector(".battle-comic-panels");

  if (previousPanels) {
    previousPanels.remove();
  }

  const comicContainer =
    document.createElement("div");

  comicContainer.className =
    "mt-4 battle-comic-panels";

  const title =
    document.createElement("h5");

  title.textContent =
    "🖼 Battle Comic Panels";

  title.className =
    "text-warning";

  comicContainer.appendChild(title);

  const row =
    document.createElement("div");

  row.className = "row g-3";

  images.forEach((url, i) => {
    const col =
      document.createElement("div");

    col.className = "col-12 col-md-4";

    const img =
      document.createElement("img");

    img.src = url;
    img.alt = `Battle comic panel ${i + 1}`;
    img.className =
      "img-fluid rounded border border-light w-100";

    col.appendChild(img);
    row.appendChild(col);
  });

  comicContainer.appendChild(row);
  result.appendChild(comicContainer);
}

// === Regular Battle Submission ===
let battleRequestInProgress = false;

document.getElementById("battleForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  if (battleRequestInProgress) {
    console.warn(
      "Battle request ignored because another battle is already generating."
    );
    return;
  }

  battleRequestInProgress = true;

  const submitButton =
    e.currentTarget.querySelector(
      'button[type="submit"], input[type="submit"]'
    );

  if (submitButton) {
    submitButton.disabled = true;

    if (submitButton.tagName === "BUTTON") {
      submitButton.dataset.originalText =
        submitButton.textContent;

      submitButton.textContent =
        "Generating Battle...";
    }
  }

  const team1Fighters = getFightersFrom("team1Inputs");
  const team2Fighters = getFightersFrom("team2Inputs");
  const team1Avatar = document.getElementById("team1Avatar").value.trim();
  const team2Avatar = document.getElementById("team2Avatar").value.trim();

  if (team1Fighters.length === 0 || team2Fighters.length === 0) {
    battleRequestInProgress = false;

    if (submitButton) {
      submitButton.disabled = false;

      if (
        submitButton.tagName === "BUTTON" &&
        submitButton.dataset.originalText
      ) {
        submitButton.textContent =
          submitButton.dataset.originalText;
      }
    }

    alert("Please enter at least one fighter per team.");
    return;
  }

  showLoading(true);

  const requestId =
    (
      window.crypto &&
      typeof window.crypto.randomUUID === "function"
    )
      ? window.crypto.randomUUID()
      : `battle_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  await openBattleProgressStream(
    requestId
  );

  try {
    const res = await fetch("/api/battle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId,
        team1Fighters,
        team2Fighters,
        team1Avatar,
        team2Avatar
      })
    });

    const raw = await res.text();
    console.log("RAW SERVER RESPONSE:", raw);

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`Server returned non-JSON response: ${raw}`);
    }

    if (!res.ok) {
      throw new Error(data.error || `Server error: ${res.status}`);
    }

    if (!data.summary) {
      throw new Error("Server returned no battle summary.");
    }

    savedSteps = summaryToSteps(data.summary);

    showAvatars(team1Avatar, team2Avatar);

    displayBattleSteps(
      savedSteps,
      data.winner || "",
      data.title || ""
    );

    setTimeout(() => {
      appendComicPanels(data.images || []);
    }, savedSteps.length * 900);

  } catch (err) {
    console.error("BATTLE ERROR:", err);

    updateGenerationProgress({
      type: "error",
      message: err.message,
      elapsedMs:
        Date.now() -
        battleProgressStartedAt
    });

    closeBattleProgressStream();

    alert(
      `Failed to generate battle:\n${err.message}`
    );
  } finally {
    battleRequestInProgress = false;

    if (submitButton) {
      submitButton.disabled = false;

      if (
        submitButton.tagName === "BUTTON" &&
        submitButton.dataset.originalText
      ) {
        submitButton.textContent =
          submitButton.dataset.originalText;
      }
    }

    showLoading(false);
  }
});

document.getElementById("replayBtn").addEventListener("click", () => {
  displayBattleSteps(savedSteps);
});


// === Bracket System ===
function addFighterToBracket() {
  const name = document.getElementById("fighterName").value.trim();
  const mental = document.getElementById("fighterMental").value.trim();
  const physical = document.getElementById("fighterPhysical").value.trim();
  if (!name) return alert("Enter all fighter details.");
  bracketFighters.push({ name, mental, physical });
  document.getElementById("fighterName").value = "";
  document.getElementById("fighterMental").value = "";
  document.getElementById("fighterPhysical").value = "";
  renderFighterList();
}

function renderFighterList() {
  const list = document.getElementById("bracketFighterList");
  list.innerHTML = "";
  bracketFighters.forEach((f, idx) => {
    const li = document.createElement("li");
    li.className = "list-group-item bg-secondary text-light";
    li.innerHTML = `
      <strong>${f.name}</strong><br/>🧠 ${f.mental}<br/>💪 ${f.physical}<br/>
      <button class="btn btn-sm btn-danger mt-1" onclick="removeFighter(${idx})">Remove</button>
    `;
    list.appendChild(li);
  });
}

function removeFighter(index) {
  bracketFighters.splice(index, 1);
  renderFighterList();
}

function generateBracket() {
  if (bracketFighters.length < 2) return alert("Add at least 2 fighters.");
  const shuffled = [...bracketFighters].sort(() => Math.random() - 0.5);
  bracketRounds = [];

  let currentRound = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    const fighter1 = shuffled[i];
    const fighter2 = shuffled[i + 1] || { name: "BYE", mental: "", physical: "" };
    currentRound.push({ fighter1, fighter2, winner: null, summary: "" });
  }
  bracketRounds.push(currentRound);

  while (currentRound.length > 1) {
    currentRound = Array(Math.ceil(currentRound.length / 2)).fill(null).map(() => ({
      fighter1: null,
      fighter2: null,
      winner: null,
      summary: ""
    }));
    bracketRounds.push(currentRound);
  }
  renderBracket();
}

function renderBracket() {
  const bracketDisplay = document.getElementById("bracketDisplay");
  bracketDisplay.innerHTML = "";

  bracketRounds.forEach((round, roundIndex) => {
    const roundDiv = document.createElement("div");
    roundDiv.className = "border p-3 bg-secondary rounded mb-3";
    roundDiv.innerHTML = `<h5>Round ${roundIndex + 1}</h5>`;

    round.forEach((match, matchIndex) => {
      const { fighter1, fighter2, winner, summary } = match;
      const matchDiv = document.createElement("div");
      matchDiv.className = "p-2 mt-2 bg-dark text-light border rounded";
      matchDiv.innerHTML = `
        <strong>Match ${matchIndex + 1}:</strong><br/>
        ${fighter1?.name ?? "TBD"} 🆚 ${fighter2?.name ?? "TBD"}<br/>
        ${winner ? `🏆 <strong>${winner.name} wins</strong><br/>` : ""}
        <button class="btn btn-sm btn-outline-light mt-2" onclick="simulateBracketMatch(${roundIndex}, ${matchIndex})" ${winner ? "disabled" : ""}>Simulate Match</button>
        <div class="mt-2 resultArea">${summary}</div>
      `;
      roundDiv.appendChild(matchDiv);
    });
    bracketDisplay.appendChild(roundDiv);
  });
}

async function simulateBracketMatch(roundIdx, matchIdx) {
    const match = bracketRounds[roundIdx][matchIdx];
    const { fighter1, fighter2 } = match;
  
    if (!fighter1 || !fighter2 || fighter2.name === "BYE") {
      match.winner = fighter1;
      match.summary = `${fighter1.name} advances automatically due to a BYE.`;
      renderBracket();
      return;
    }
  
    const display = document.querySelectorAll("#bracketDisplay .resultArea")[roundIdx * 2 + matchIdx];
    display.innerHTML = "Simulating...";
  
    try {
      const res = await fetch("/api/battle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team1: fighter1.name,
          team2: fighter2.name,
          team1Mental: fighter1.mental,
          team1Physical: fighter1.physical,
          team2Mental: fighter2.mental,
          team2Physical: fighter2.physical
        })
      });
  
      const data = await res.json();
      const steps = data.summary.trim().split(/(?<=\.)\s*\n+/);
      
      // Regexes to detect peaceful language or required kill ending
      const peaceRegex = /(resolution|respect|mutual|understanding|allies|truce|nodded|bowed|walked away|unity|friendship|camaraderie|shared bond|side by side|part ways|honor|became allies)/i;
      const deathRegex = /stood over .*?['’]s (lifeless body|corpse)/i;
      
      // Guess winner based on name occurrence in final sentence
      const lastLine = steps[steps.length - 1];
      let winnerGuess = lastLine.includes(fighter2.name) ? fighter2 : fighter1;
      let loserGuess = winnerGuess === fighter1 ? fighter2 : fighter1;
      
      // STEP 1: Find where the peaceful resolution *starts*
      let peacefulStartIdx = steps.findIndex(line => peaceRegex.test(line));
      
      // STEP 2: If a peaceful paragraph exists, remove everything from that point
      if (peacefulStartIdx !== -1) {
        steps.splice(peacefulStartIdx); // removes all lines from that point forward
      }
      
      if (!deathRegex.test(steps[steps.length - 1])) {
        steps.push(`${winnerGuess.name} struck the final blow, ending ${loserGuess.name}'s life without hesitation.`);
        steps.push(`${winnerGuess.name} stood over ${loserGuess.name}’s corpse, their battle finally over.`);
      
        // Add varied final paragraph
        const outroTemplates = [ /*...list from above...*/ ];
        const randomOutro = outroTemplates[Math.floor(Math.random() * outroTemplates.length)];
        steps.push(randomOutro);
      }
      
      

      

 
  
      match.summary = steps.join("<br/>");
      match.winner = winnerGuess;
  
      // Advance to next round
      const nextRound = bracketRounds[roundIdx + 1];
      if (nextRound) {
        const target = nextRound[Math.floor(matchIdx / 2)];
        if (matchIdx % 2 === 0) target.fighter1 = winnerGuess;
        else target.fighter2 = winnerGuess;
      }
  
      renderBracket();
    } catch (err) {
      display.innerHTML = "Error simulating match.";
      console.error(err);
    }
}
  