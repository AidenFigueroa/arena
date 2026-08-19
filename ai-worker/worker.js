require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const express = require("express");

const app = express();

const PORT = Number(process.env.PORT) || 8080;
const WORKER_TOKEN = process.env.WORKER_TOKEN;

const OLLAMA_URL =
  process.env.OLLAMA_URL || "http://127.0.0.1:11434";

const OLLAMA_MODEL =
  process.env.OLLAMA_MODEL || "gemma3";

const COMFYUI_URL =
  process.env.COMFYUI_URL || "http://127.0.0.1:8188";

const IMAGE_WIDTH =
  Number(process.env.IMAGE_WIDTH) || 768;

const IMAGE_HEIGHT =
  Number(process.env.IMAGE_HEIGHT) || 768;

// Arena currently expects exactly three comic panels.
const IMAGE_COUNT = 3;

const COMFY_TIMEOUT_MS =
  Number(process.env.COMFY_TIMEOUT_MS) || 300000;

const FLUX_WORKFLOW_PATH = path.join(
  __dirname,
  "flux2_workflow_api.json"
);

if (!WORKER_TOKEN) {
  throw new Error("WORKER_TOKEN is missing from ai-worker/.env");
}

if (!fs.existsSync(FLUX_WORKFLOW_PATH)) {
  throw new Error(
    `Missing FLUX workflow file: ${FLUX_WORKFLOW_PATH}`
  );
}

app.use(
  express.json({
    limit: "2mb"
  })
);


// ========================================
// LIVE PROGRESS STREAMS
// ========================================

const progressSessions = new Map();

function ensureProgressSession(requestId) {
  if (!progressSessions.has(requestId)) {
    progressSessions.set(requestId, {
      startedAt: Date.now(),
      clients: new Set(),
      history: []
    });
  }

  return progressSessions.get(requestId);
}

function emitProgress(requestId, payload) {
  if (!requestId) return;

  const session = ensureProgressSession(requestId);

  const event = {
    ...payload,
    requestId,
    timestamp: new Date().toISOString(),
    elapsedMs: Date.now() - session.startedAt
  };

  session.history.push(event);

  if (session.history.length > 250) {
    session.history.shift();
  }

  const line = `data: ${JSON.stringify(event)}\n\n`;

  for (const client of session.clients) {
    try {
      client.write(line);
    } catch {}
  }
}

function finishProgressSession(requestId) {
  const session = progressSessions.get(requestId);

  if (!session) return;

  setTimeout(() => {
    const current = progressSessions.get(requestId);

    if (!current) return;

    for (const client of current.clients) {
      try {
        client.end();
      } catch {}
    }

    progressSessions.delete(requestId);
  }, 120000);
}

app.get(
  "/progress/:requestId",
  authenticate,
  (req, res) => {
    const requestId = req.params.requestId;
    const session = ensureProgressSession(requestId);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });

    res.write(
      `data: ${JSON.stringify({
        type: "connected",
        message: "Progress stream connected.",
        requestId,
        timestamp: new Date().toISOString(),
        elapsedMs: Date.now() - session.startedAt
      })}\n\n`
    );

    for (const event of session.history) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    session.clients.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
      } catch {}
    }, 15000);

    req.on("close", () => {
      clearInterval(heartbeat);
      session.clients.delete(res);
    });
  }
);

function getComfyWebSocketUrl(clientId) {
  const url = new URL(COMFYUI_URL);

  const protocol =
    url.protocol === "https:"
      ? "wss:"
      : "ws:";

  const basePath =
    url.pathname.replace(/\/$/, "");

  return (
    `${protocol}//${url.host}` +
    `${basePath}/ws?clientId=${encodeURIComponent(clientId)}`
  );
}

function openComfyWebSocket(clientId) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(
      getComfyWebSocketUrl(clientId)
    );

    const timeout = setTimeout(() => {
      try {
        socket.close();
      } catch {}

      reject(
        new Error(
          "Timed out while connecting to ComfyUI progress WebSocket."
        )
      );
    }, 10000);

    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timeout);
        resolve(socket);
      },
      { once: true }
    );

    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(
          new Error(
            "Could not connect to ComfyUI progress WebSocket."
          )
        );
      },
      { once: true }
    );
  });
}

const COMFY_NODE_LABELS = {
  "77:87": "Loading FLUX diffusion model",
  "77:88": "Loading text encoder",
  "77:89": "Loading VAE",
  "77:92": "Encoding comic-panel prompt",
  "77:83": "Preparing latent image",
  "77:86": "Preparing image noise",
  "77:93": "Preparing FLUX scheduler",
  "77:90": "Preparing guidance",
  "77:81": "Running FLUX sampler",
  "77:82": "Decoding image",
  "78": "Saving comic panel"
};

function monitorComfyProgress(
  socket,
  promptId,
  requestId,
  panelNumber
) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let lastNode = null;

    const finish = (error = null) => {
      if (settled) return;

      settled = true;
      clearTimeout(timeout);

      try {
        socket.close();
      } catch {}

      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const timeout = setTimeout(() => {
      finish(
        new Error(
          `ComfyUI progress timed out for prompt ${promptId}.`
        )
      );
    }, COMFY_TIMEOUT_MS);

    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") {
        return;
      }

      let message;

      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      const type = message.type;
      const data = message.data || {};

      if (
        data.prompt_id &&
        data.prompt_id !== promptId
      ) {
        return;
      }

      if (type === "executing") {
        if (data.node === null) {
          finish();
          return;
        }

        if (data.node && data.node !== lastNode) {
          lastNode = data.node;

          emitProgress(requestId, {
            type: "comfy_node",
            stage: "image",
            panel: panelNumber,
            totalPanels: IMAGE_COUNT,
            nodeId: String(data.node),
            message:
              COMFY_NODE_LABELS[String(data.node)] ||
              `Executing ComfyUI node ${data.node}`
          });
        }

        return;
      }

      if (type === "progress") {
        const value = Number(data.value) || 0;
        const max = Number(data.max) || 0;

        emitProgress(requestId, {
          type: "sampling",
          stage: "image",
          panel: panelNumber,
          totalPanels: IMAGE_COUNT,
          step: value,
          maxSteps: max,
          percent:
            max > 0
              ? Math.round((value / max) * 100)
              : 0,
          message:
            max > 0
              ? `Sampling ${value}/${max}`
              : "Sampling image"
        });

        return;
      }

      if (type === "execution_success") {
        finish();
        return;
      }

      if (type === "execution_error") {
        finish(
          new Error(
            data.exception_message ||
            "ComfyUI execution failed."
          )
        );
      }
    });

    socket.addEventListener(
      "close",
      () => {
        // History polling below remains the final source of truth,
        // so a closed progress socket does not automatically fail
        // an otherwise successful image generation.
        finish();
      },
      { once: true }
    );

    socket.addEventListener(
      "error",
      () => {
        finish();
      },
      { once: true }
    );
  });
}

// ========================================
// AUTH
// ========================================

function authenticate(req, res, next) {
  const authorization = req.headers.authorization;

  if (authorization !== `Bearer ${WORKER_TOKEN}`) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  next();
}

// ========================================
// BATTLE PROMPT
// ========================================

function formatTeam(teamFighters) {
  return teamFighters
    .map((fighter) => {
      return (
        `- ${fighter.name}` +
        ` (Mental: ${fighter.mental || "None"}` +
        ` | Physical: ${fighter.physical || "None"}` +
        ` | Gear: ${fighter.item || "None"})`
      );
    })
    .join("\n");
}

function createBattlePrompt(body) {
  const {
    team1Fighters,
    team2Fighters,
    team1,
    team2,
    team1Mental,
    team1Physical,
    team2Mental,
    team2Physical
  } = body;

  let team1Formatted;
  let team2Formatted;

  if (
    Array.isArray(team1Fighters) &&
    Array.isArray(team2Fighters)
  ) {
    team1Formatted = formatTeam(team1Fighters);
    team2Formatted = formatTeam(team2Fighters);
  } else {
    team1Formatted =
      `- ${team1}` +
      ` (Mental: ${team1Mental || "Not specified"}` +
      ` | Physical: ${team1Physical || "Not specified"})`;

    team2Formatted =
      `- ${team2}` +
      ` (Mental: ${team2Mental || "Not specified"}` +
      ` | Physical: ${team2Physical || "Not specified"})`;
  }

  return `
Write a cinematic fictional battle between Team 1 and Team 2.

TEAM 1:
${team1Formatted}

TEAM 2:
${team2Formatted}


STORY REQUIREMENTS:

Write an actual continuous story.

Do NOT write:
- a synopsis
- an outline
- story beats
- a screenplay
- a list of events
- short summaries of each phase
- headings such as "Opening Shot", "First Clash", or "Momentum Shift"

The story should read like a polished cinematic action novel
or a premium graphic-novel sequence written in prose.

Write approximately 700 to 1000 words.

Use approximately 7 to 10 substantial paragraphs.

The battle must unfold naturally from beginning to end.

Do not label the different phases of the story.


STORY STRUCTURE:

The story should naturally progress through these phases,
but these phases must NOT appear as headings or labels.


BEGINNING:

Establish the battleground with atmosphere and sensory detail.

Show:
- the location
- weather or environmental conditions when appropriate
- lighting
- sound
- the fighters' positions
- how the fighters notice or confront each other
- the tension before the first serious attack

Introduce the fighters through their behavior and actions
rather than dumping exposition about them.

Do not immediately rush to the finishing move.


FIRST EXCHANGE:

Show the first sustained exchange in detail.

Describe actual movements.

Show things such as:
- attacks
- evasions
- blocks
- counters
- changes in distance
- changes in position
- movement through the environment
- environmental interaction
- physical consequences of attacks

Do not summarize abilities.

Bad:
"Batman used his superior tactics."

Instead, actually show what Batman notices,
what decision he makes, and what action follows.

Bad:
"Spider-Man used his agility."

Instead, actually describe Spider-Man changing direction,
using momentum, evading an attack, repositioning,
or countering in a specific physical way.


ESCALATION:

Both fighters must feel dangerous and competent.

Neither fighter should become stupid, clumsy, helpless,
or inexplicably weak just so the other fighter can win.

The fight should become more difficult as both fighters
begin understanding each other's strengths and weaknesses.

Let control of the battle shift.

Include at least one meaningful reversal.

A fighter who appears to be gaining control should encounter
a serious counterattack, tactical problem, unexpected response,
or environmental complication.

Show the consequences of mistakes.


ADAPTATION:

Each fighter should recognize something important
about the opponent during the battle.

Show both fighters changing their strategy because of what
they have learned.

The adaptation must be demonstrated through action.

Do not merely write:
"He changed his strategy."

Show:
- what the fighter noticed
- what behavior changes
- how the opponent reacts
- whether the adjustment succeeds or fails


CLIMAX:

Build toward one decisive confrontation.

The final victory must feel earned.

Do NOT end the battle because:
- one fighter randomly lands a kick
- one fighter suddenly becomes stupid
- one fighter forgets an ability
- the winner randomly becomes much stronger
- an outside character interferes
- the loser simply stops fighting

The winning move should logically follow from something
established earlier in the battle.

The winner should:
- recognize an opening
- create an opening
- exploit a weakness
- execute a successful strategy
- or combine earlier observations into the final tactic

Slow the final exchange down enough that it feels important.

Show the actions that directly cause the defeat.


AFTERMATH:

End with a short cinematic closing sequence.

Show:
- the immediate condition of both fighters
- the damaged environment
- the atmosphere after the violence stops
- the clear winner

The final paragraph should feel like the final shot of a movie
or graphic novel.

Do not summarize the entire fight again.


WRITING STYLE:

Use vivid cinematic prose.

Use varied sentence lengths.

Use short sentences occasionally for impact.

Slow down important moments.

Describe physical movement clearly enough that the reader
can understand what is happening.

Use sensory details when useful:
- rain
- wind
- impact
- concrete
- metal
- glass
- smoke
- sparks
- shadows
- light
- sound
- debris
- water
- heat
- cold

Maintain spatial continuity.

The reader should understand:
- where each fighter is
- how far apart they are
- how they move relative to each other
- how the environment affects the fight

Prefer specific actions over vague statements.

Bad:
"Batman attacked Spider-Man."

Better:
"Batman stepped inside the arc of the punch, caught Spider-Man's wrist
against his forearm, and drove his shoulder forward before Spider-Man
could twist free."

Bad:
"Spider-Man dodged."

Better:
"Spider-Man folded backward beneath the strike, one palm touching the
wet concrete before his legs whipped over his head and carried him
outside Batman's reach."

Do not constantly use phrases like:
- "pressed his advantage"
- "used superior tactics"
- "utilized his agility"
- "launched an attack"
- "countered effectively"

Show those things happening instead.


DIALOGUE:

Dialogue may be used sparingly.

Dialogue should:
- fit the character
- add personality
- create tension
- remain brief during combat

Do not use dialogue simply to explain what is happening.

Do not turn the story into a screenplay.


CHARACTER RULES:

Both fighters must behave intelligently and competently.

Respect their established:
- abilities
- limitations
- fighting styles
- physical traits
- intelligence
- equipment

Do not invent:
- powers
- gadgets
- weapons
- costume features
- abilities

If uncertain whether a fighter has something,
leave it out instead of inventing it.

User-provided:
- mental skills
- physical skills
- gear

override assumptions.

Do not artificially weaken one fighter to force a winner.

Do not describe a competent fighter as randomly clumsy,
slow, careless, confused, or helpless unless the events
of the battle actually caused that condition.

The eventual winner must earn the victory through events
shown inside the story.

There must be one clear winner.

No:
- tie
- truce
- friendship ending
- unexplained surrender
- off-screen defeat
- outside rescue
- police intervention
- allies appearing
- armies appearing
- random civilians interfering

unless the user explicitly provided those characters.


STORY OUTPUT RULES:

The story must contain only normal prose paragraphs.

Do not put:
- headings
- act labels
- numbered sections
- bullet points
- JSON
- notes
- explanations
- image prompts
- image-generation instructions

inside the story.


COMIC PANEL RULES:

Separately create exactly 3 image prompt objects.

These image prompts are separate from the written story.

They represent:

1. A cinematic opening action moment
2. A major middle-of-the-fight confrontation
3. The decisive finishing moment


Each image prompt object must contain ONLY:

- scene
- left_character
- right_character


FOR ALL THREE PANELS:

Create exactly ONE comic-book panel.

Show exactly ONE frozen action moment.

For a one-on-one battle,
show exactly TWO completely separate fighters.

Both fighters must remain visually distinct.

Do not:
- merge bodies
- merge costumes
- combine masks
- combine logos
- combine colors
- fuse limbs
- duplicate fighters
- add extra characters
- add crowds
- add police
- add captions
- add speech bubbles
- add visible text
- create multiple panels
- create a comic page
- create a collage
- create a storyboard
- create split-screen imagery


PANEL 1:

Create a cinematic establishing action shot.

Use:
- environmental depth
- dramatic lighting
- strong composition
- clear silhouettes
- clearly readable fighters

Both fighters should already be involved in the confrontation.

Do not simply have both characters standing still.


PANEL 2:

Show a major confrontation from the middle of the battle.

Use:
- dynamic camera angle
- strong physical interaction
- dramatic depth
- visible momentum
- environmental interaction when appropriate

Keep both fighters visually separate.


PANEL 3:

Show the decisive finishing moment.

This should have the strongest dramatic composition.

Make the winner and loser dynamic visually understandable.

Still show exactly ONE frozen instant.


scene:

Write 20 to 45 words.

Describe:
- the environment
- the exact frozen action
- camera angle
- lighting
- atmosphere

Do not describe multiple sequential actions.


left_character:

Write 18 to 40 words.

Describe exactly ONE fighter on the LEFT.

Include:
- recognizable appearance
- body position
- pose
- exact action occurring at that instant


right_character:

Write 18 to 40 words.

Describe exactly ONE fighter on the RIGHT.

Include:
- recognizable appearance
- body position
- pose
- exact action occurring at that instant


RETURN ONLY THE REQUIRED STRUCTURED JSON.

Do not include notes, commentary, markdown,
or explanations outside the JSON.
`.trim();
}

// ========================================
// OLLAMA
// ========================================

async function generateBattle(prompt, requestId) {
  const storyStartedAt = Date.now();

  emitProgress(requestId, {
    type: "story_start",
    stage: "story",
    message: `Writing cinematic battle with ${OLLAMA_MODEL}`
  });

  console.log(
    `Generating battle with ${OLLAMA_MODEL}...`
  );

  const response = await fetch(
    `${OLLAMA_URL}/api/generate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: `
${prompt}

IMPORTANT JSON OUTPUT FORMAT:

Return exactly one JSON object with this shape:

{
  "title": "short battle title",
  "winner": "name of the winning fighter",
  "story": "the complete 700 to 1000 word cinematic prose story",
  "image_prompts": [
    {
      "scene": "opening panel scene",
      "left_character": "left fighter description and action",
      "right_character": "right fighter description and action"
    },
    {
      "scene": "middle panel scene",
      "left_character": "left fighter description and action",
      "right_character": "right fighter description and action"
    },
    {
      "scene": "finishing panel scene",
      "left_character": "left fighter description and action",
      "right_character": "right fighter description and action"
    }
  ]
}

Do not add any keys other than:
title, winner, story, image_prompts.

Each image_prompts object must contain only:
scene, left_character, right_character.

Return JSON only.
Do not wrap the JSON in markdown.
        `.trim(),
        format: "json",
        stream: false,
        options: {
          temperature: 0.4
        }
      })
    }
  );

  if (!response.ok) {
    const errorText =
      await response.text();

    throw new Error(
      `Ollama error ${response.status}: ${errorText}`
    );
  }

  const data =
    await response.json();

  if (!data.response) {
    throw new Error(
      "Ollama returned no battle."
    );
  }

  let battle;

  try {
    battle =
      JSON.parse(data.response);
  } catch {
    console.error(
      "Invalid Ollama JSON:",
      data.response
    );

    throw new Error(
      "Ollama returned invalid battle JSON."
    );
  }

  if (
    typeof battle.title !== "string" ||
    battle.title.trim().length === 0
  ) {
    throw new Error(
      "Battle JSON did not contain a valid title."
    );
  }

  if (
    typeof battle.winner !== "string" ||
    battle.winner.trim().length === 0
  ) {
    throw new Error(
      "Battle JSON did not contain a valid winner."
    );
  }

  if (
    typeof battle.story !== "string" ||
    battle.story.trim().length === 0
  ) {
    throw new Error(
      "Battle JSON did not contain a valid story."
    );
  }

  if (
    !Array.isArray(
      battle.image_prompts
    ) ||
    battle.image_prompts.length !==
      IMAGE_COUNT
  ) {
    throw new Error(
      `Expected ${IMAGE_COUNT} image prompts but received ${
        Array.isArray(
          battle.image_prompts
        )
          ? battle.image_prompts.length
          : "invalid data"
      }.`
    );
  }

  for (
    let i = 0;
    i < battle.image_prompts.length;
    i++
  ) {
    const panel =
      battle.image_prompts[i];

    if (
      !panel ||
      typeof panel !== "object" ||
      typeof panel.scene !== "string" ||
      typeof panel.left_character !== "string" ||
      typeof panel.right_character !== "string"
    ) {
      throw new Error(
        `Image prompt ${i + 1} has an invalid structure.`
      );
    }
  }

  battle.summary =
    battle.story.trim();

  emitProgress(requestId, {
    type: "story_complete",
    stage: "story",
    message: "Cinematic battle story complete",
    durationSeconds:
      Math.round(
        ((Date.now() - storyStartedAt) / 1000) * 10
      ) / 10
  });

  return battle;
}

// ========================================
// FLUX WORKFLOW
// ========================================

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function loadFluxWorkflowTemplate() {
  const raw = fs.readFileSync(
    FLUX_WORKFLOW_PATH,
    "utf8"
  );

  return JSON.parse(raw);
}

function randomSeed() {
  return Math.floor(
    Math.random() * Number.MAX_SAFE_INTEGER
  );
}

function buildFluxPanelPrompt(panel) {
  return `
Single cinematic American superhero comic-book panel.
Exactly ONE panel.
Exactly ONE frozen action moment.
Exactly TWO separate fighters only.

Style requirements:
premium comic-book illustration, cinematic composition, dramatic framing,
clean bold ink lines, sharp anatomy, crisp silhouettes, graphic-novel shading,
rich but controlled comic-book color, rain and atmosphere rendered clearly,
high contrast lighting, strong depth, readable action, polished professional finish.

Hard rules:
do NOT merge the two fighters
do NOT blend costumes
do NOT fuse limbs or masks
do NOT duplicate characters
do NOT add extra characters
do NOT add extra superhero logos or emblems
do NOT create collage, page layout, storyboard, split panels, captions, speech bubbles, or visible text

Composition rules:
left fighter must stay clearly on the LEFT side
right fighter must stay clearly on the RIGHT side
both characters must be fully readable and visually separate
the action must feel cinematic and dramatic
the scene must look like one high-quality comic panel, not a poster and not a page

SCENE:
${panel.scene}

LEFT FIGHTER:
${panel.left_character}

RIGHT FIGHTER:
${panel.right_character}
`.trim();
}

function createFluxWorkflow(panel, index) {
  const workflow =
    deepClone(loadFluxWorkflowTemplate());

  const PROMPT_NODE = "76";
  const SAVE_IMAGE_NODE = "78";
  const WIDTH_NODE = "77:84";
  const HEIGHT_NODE = "77:85";
  const NOISE_NODE = "77:86";

  for (const nodeId of [
    PROMPT_NODE,
    SAVE_IMAGE_NODE,
    WIDTH_NODE,
    HEIGHT_NODE,
    NOISE_NODE
  ]) {
    if (!workflow[nodeId]) {
      throw new Error(
        `FLUX workflow is missing node ${nodeId}.`
      );
    }
  }

  workflow[PROMPT_NODE].inputs.value =
    buildFluxPanelPrompt(panel);

  workflow[WIDTH_NODE].inputs.value =
    IMAGE_WIDTH;

  workflow[HEIGHT_NODE].inputs.value =
    IMAGE_HEIGHT;

  workflow[NOISE_NODE].inputs.noise_seed =
    randomSeed();

  workflow[SAVE_IMAGE_NODE].inputs.filename_prefix =
    `arena_battle_${Date.now()}_${index + 1}`;

  return workflow;
}

// ========================================
// COMFYUI API
// ========================================

async function queueComfyWorkflow(workflow, clientId) {
  const response = await fetch(
    `${COMFYUI_URL}/prompt`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: workflow,
        client_id: clientId
      })
    }
  );

  const responseText =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `ComfyUI queue error ${response.status}: ${responseText}`
    );
  }

  const data = JSON.parse(responseText);

  if (!data.prompt_id) {
    throw new Error(
      "ComfyUI did not return a prompt_id."
    );
  }

  return data.prompt_id;
}

function sleep(ms) {
  return new Promise(
    (resolve) => setTimeout(resolve, ms)
  );
}

async function waitForImage(promptId) {
  const started = Date.now();

  while (
    Date.now() - started <
    COMFY_TIMEOUT_MS
  ) {
    const response = await fetch(
      `${COMFYUI_URL}/history/${promptId}`
    );

    if (!response.ok) {
      throw new Error(
        `Could not read ComfyUI history. Status ${response.status}`
      );
    }

    const history = await response.json();
    const execution = history[promptId];

    if (execution) {
      if (
        execution.status &&
        execution.status.status_str === "error"
      ) {
        console.error(
          "ComfyUI execution failed:",
          JSON.stringify(
            execution.status,
            null,
            2
          )
        );

        throw new Error(
          "ComfyUI failed while generating the image."
        );
      }

      if (execution.outputs) {
        for (
          const output of
          Object.values(execution.outputs)
        ) {
          if (
            output &&
            Array.isArray(output.images) &&
            output.images.length > 0
          ) {
            return output.images[0];
          }
        }
      }
    }

    await sleep(1000);
  }

  throw new Error(
    `ComfyUI timed out after ${COMFY_TIMEOUT_MS} ms for prompt ${promptId}`
  );
}

async function downloadImage(imageInfo) {
  const params = new URLSearchParams({
    filename: imageInfo.filename,
    subfolder:
      imageInfo.subfolder || "",
    type:
      imageInfo.type || "output"
  });

  const response = await fetch(
    `${COMFYUI_URL}/view?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error(
      `Could not download ComfyUI image. Status ${response.status}`
    );
  }

  const arrayBuffer =
    await response.arrayBuffer();

  const imageBuffer =
    Buffer.from(arrayBuffer);

  return (
    "data:image/png;base64," +
    imageBuffer.toString("base64")
  );
}

async function generateImage(
  panel,
  index,
  requestId
) {
  const panelNumber = index + 1;
  const imageStartedAt = Date.now();
  const clientId = randomUUID();

  emitProgress(requestId, {
    type: "panel_start",
    stage: "image",
    panel: panelNumber,
    totalPanels: IMAGE_COUNT,
    message: `Preparing comic panel ${panelNumber} of ${IMAGE_COUNT}`
  });

  console.log(
    `Generating comic panel ${panelNumber}/${IMAGE_COUNT}...`
  );

  console.log(
    JSON.stringify(panel, null, 2)
  );

  const workflow =
    createFluxWorkflow(panel, index);

  emitProgress(requestId, {
    type: "comfy_connect",
    stage: "image",
    panel: panelNumber,
    totalPanels: IMAGE_COUNT,
    message: "Connecting to ComfyUI"
  });

  let socket = null;

  try {
    socket =
      await openComfyWebSocket(clientId);
  } catch (socketError) {
    console.warn(
      "ComfyUI progress WebSocket unavailable:",
      socketError.message
    );

    emitProgress(requestId, {
      type: "progress_warning",
      stage: "image",
      panel: panelNumber,
      totalPanels: IMAGE_COUNT,
      message:
        "Live sampler steps unavailable; generation is still running"
    });
  }

  const promptId =
    await queueComfyWorkflow(
      workflow,
      clientId
    );

  emitProgress(requestId, {
    type: "panel_queued",
    stage: "image",
    panel: panelNumber,
    totalPanels: IMAGE_COUNT,
    promptId,
    message: `Panel ${panelNumber} queued in ComfyUI`
  });

  console.log(
    `ComfyUI prompt ID: ${promptId}`
  );

  if (socket) {
    await monitorComfyProgress(
      socket,
      promptId,
      requestId,
      panelNumber
    );
  }

  const imageInfo =
    await waitForImage(promptId);

  emitProgress(requestId, {
    type: "download",
    stage: "image",
    panel: panelNumber,
    totalPanels: IMAGE_COUNT,
    message: "Retrieving completed panel"
  });

  const imageData =
    await downloadImage(imageInfo);

  const durationSeconds =
    Math.round(
      ((Date.now() - imageStartedAt) / 1000) * 100
    ) / 100;

  emitProgress(requestId, {
    type: "panel_complete",
    stage: "image",
    panel: panelNumber,
    totalPanels: IMAGE_COUNT,
    durationSeconds,
    message:
      `Panel ${panelNumber} complete in ${durationSeconds.toFixed(2)}s`
  });

  console.log(
    `Comic panel ${panelNumber} finished successfully.`
  );

  return imageData;
}

async function generateImageWithRetry(
  panel,
  index,
  requestId,
  maxAttempts = 3
) {
  let lastError = null;

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    try {
      console.log(
        `Panel ${index + 1}: attempt ${attempt}/${maxAttempts}`
      );

      if (attempt > 1) {
        emitProgress(requestId, {
          type: "panel_retry",
          stage: "image",
          panel: index + 1,
          totalPanels: IMAGE_COUNT,
          attempt,
          maxAttempts,
          message:
            `Retrying panel ${index + 1}, attempt ${attempt}/${maxAttempts}`
        });
      }

      return await generateImage(
        panel,
        index,
        requestId
      );
    } catch (error) {
      lastError = error;

      console.error(
        `Panel ${index + 1} attempt ${attempt} failed:`
      );

      console.error(error);

      emitProgress(requestId, {
        type: "panel_attempt_failed",
        stage: "image",
        panel: index + 1,
        totalPanels: IMAGE_COUNT,
        attempt,
        maxAttempts,
        message:
          `Panel ${index + 1} attempt ${attempt} failed`
      });
    }
  }

  throw (
    lastError ||
    new Error(
      `Panel ${index + 1} failed after ${maxAttempts} attempts.`
    )
  );
}

// ========================================
// ROUTES
// ========================================

app.post(
  "/battle",
  authenticate,
  async (req, res) => {
    const requestId =
      typeof req.body.requestId === "string" &&
      req.body.requestId.trim()
        ? req.body.requestId.trim()
        : randomUUID();

    ensureProgressSession(requestId);

    try {
      console.log(
        "\nBattle request received."
      );

      emitProgress(requestId, {
        type: "battle_start",
        stage: "battle",
        message: "Battle request received"
      });

      const battlePrompt =
        createBattlePrompt(req.body);

      const battle =
        await generateBattle(
          battlePrompt,
          requestId
        );

      console.log(
        "Battle generation complete."
      );

      console.log(
        `Title: ${battle.title}`
      );

      console.log(
        `Winner: ${battle.winner}`
      );

      console.log(
        `${battle.image_prompts.length} comic panel prompts created.`
      );

      const images = [];

      for (
        let i = 0;
        i < battle.image_prompts.length;
        i++
      ) {
        const image =
          await generateImageWithRetry(
            battle.image_prompts[i],
            i,
            requestId,
            3
          );

        images.push(image);
      }

      if (
        images.length !== IMAGE_COUNT
      ) {
        throw new Error(
          `Expected ${IMAGE_COUNT} completed images but received ${images.length}.`
        );
      }

      console.log(
        `Battle finished. ${images.length}/${IMAGE_COUNT} images generated.`
      );

      emitProgress(requestId, {
        type: "done",
        stage: "complete",
        percent: 100,
        message: "Battle generation complete"
      });

      finishProgressSession(requestId);

      return res.json({
        title: battle.title,
        summary: battle.summary,
        winner: battle.winner,
        images
      });
    } catch (err) {
      console.error(
        "AI worker battle error:"
      );

      console.error(err);

      emitProgress(requestId, {
        type: "error",
        stage: "error",
        message:
          err.message ||
          "Battle generation failed."
      });

      finishProgressSession(requestId);

      return res
        .status(500)
        .json({
          title: null,
          summary: null,
          winner: null,
          images: [],
          error:
            err.message ||
            "Battle generation failed."
        });
    }
  }
);

app.get(
  "/health",
  async (req, res) => {
    let ollama = false;
    let comfyui = false;

    try {
      const response =
        await fetch(
          `${OLLAMA_URL}/api/tags`
        );

      ollama = response.ok;
    } catch {}

    try {
      const response =
        await fetch(
          `${COMFYUI_URL}/system_stats`
        );

      comfyui = response.ok;
    } catch {}

    return res.json({
      worker: "ok",
      ollama,
      comfyui,
      ollamaModel: OLLAMA_MODEL,
      imageWidth: IMAGE_WIDTH,
      imageHeight: IMAGE_HEIGHT,
      imageCount: IMAGE_COUNT,
      comfyTimeoutMs:
        COMFY_TIMEOUT_MS,
      fluxWorkflowPath:
        FLUX_WORKFLOW_PATH
    });
  }
);

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Arena AI worker running on port ${PORT}`
    );

    console.log(
      `Ollama: ${OLLAMA_URL}`
    );

    console.log(
      `Ollama model: ${OLLAMA_MODEL}`
    );

    console.log(
      `ComfyUI: ${COMFYUI_URL}`
    );

    console.log(
      `FLUX workflow: ${FLUX_WORKFLOW_PATH}`
    );

    console.log(
      `Images: ${IMAGE_COUNT} at ${IMAGE_WIDTH}x${IMAGE_HEIGHT}`
    );
  }
);