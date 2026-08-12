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

function displayBattleSteps(steps) {
  const result = document.getElementById("battleResult");
  const resultBox = document.getElementById("resultBox");
  result.innerHTML = "";

  const lastLine = steps[steps.length - 1];
  const match = lastLine.match(/(.*?) (defeats|destroys|wins|annihilates|overpowers|eliminates) (.*?)(\.|!|$)/i);
  const winnerHeader = document.createElement("h4");
  winnerHeader.className = "text-center text-warning mb-4";
  winnerHeader.textContent = match ? `🔥 ${match[1]} ${match[2]} ${match[3]} 🔥` : "🔥 Epic Battle Results 🔥";
  result.appendChild(winnerHeader);

  steps.forEach((text, i) => {
    setTimeout(() => {
      const p = document.createElement("p");
      p.className = "step";
      p.textContent = text;
      result.appendChild(p);
      setTimeout(() => p.classList.add("show"), 10);
    }, i * 1400);
  });

  resultBox.classList.remove("d-none");
}

// === Regular Battle Submission ===
document.getElementById("battleForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const team1Fighters = getFightersFrom("team1Inputs");
  const team2Fighters = getFightersFrom("team2Inputs");
  const team1Avatar = document.getElementById("team1Avatar").value.trim();
  const team2Avatar = document.getElementById("team2Avatar").value.trim();

  if (team1Fighters.length === 0 || team2Fighters.length === 0) {
    alert("Please enter at least one fighter per team.");
    return;
  }

  showLoading(true);
try {
  const res = await fetch("/api/battle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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
  // Show the avatars and battle text
  savedSteps = data.summary.trim().split(/(?<=\.)\s*\n+/);
  showAvatars(team1Avatar, team2Avatar);
  displayBattleSteps(savedSteps); // Must run before we append to battleResult

  // Then show comic panels under the summary
 setTimeout(() => {
  if (data.images && Array.isArray(data.images) && data.images.length > 0) {
    const comicContainer = document.createElement("div");
    comicContainer.className = "mt-4";

    const title = document.createElement("h5");
    title.textContent = "🖼 Battle Comic Panels";
    title.className = "text-warning";
    comicContainer.appendChild(title);

    data.images.forEach((url, i) => {
      const img = document.createElement("img");
      img.src = url;
      img.alt = `Scene ${i + 1}`;
      img.className = "img-fluid rounded mb-3 border border-light";
      comicContainer.appendChild(img);
    });

    document.getElementById("battleResult").appendChild(comicContainer);
  }
}, savedSteps.length * 1400); // delay based on how many lines are shown


} catch (err) {
  console.error("BATTLE ERROR:", err);
  alert(`Failed to generate battle:\n${err.message}`);
} finally {
  showLoading(false);
}

document.getElementById("replayBtn").addEventListener("click", () => {
  displayBattleSteps(savedSteps);
  })
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
  