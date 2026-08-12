const path = require("path");
require("dotenv").config({ override: true });

const express = require("express");
const OpenAI = require("openai");

const key = process.env.OPENAI_API_KEY;

console.log("OpenAI key loaded:", key ? "YES" : "NO");
console.log("Key length:", key?.length);
console.log("Key starts:", key?.slice(0, 8));
console.log("Key ends:", key?.slice(-4));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY?.trim(),
});

const app = express();
const PORT = 3000;

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());



// Format team fighters into readable string for prompt
function formatTeam(teamFighters) {
  return teamFighters
    .map((f) => `- ${f.name} (🧠 ${f.mental || "None"} | 💪 ${f.physical || "None"} | 🎒 ${f.item || "None"})`)
    .join("\n");
}

// Battle simulation route
app.post("/api/battle", async (req, res) => {
  const {
    team1Fighters,
    team2Fighters,
    team1Avatar,
    team2Avatar,
    team1,
    team2,
    team1Mental,
    team1Physical,
    team2Mental,
    team2Physical
  } = req.body;

  let team1Formatted = "";
  let team2Formatted = "";

  if (Array.isArray(team1Fighters) && Array.isArray(team2Fighters)) {
    team1Formatted = formatTeam(team1Fighters);
    team2Formatted = formatTeam(team2Fighters);
  } else {
    team1Formatted = `- ${team1} (🧠 ${team1Mental || "Unknown"} | 💪 ${team1Physical || "Unknown"})`;
    team2Formatted = `- ${team2} (🧠 ${team2Mental || "Unknown"} | 💪 ${team2Physical || "Unknown"})`;
  }

  const prompt = `
You are a legendary battle narrator AI. Write a long, cinematic, strategic, and round-by-round battle between two fighters or teams.

Each fighter has unique mental, physical, and item-based abilities. Incorporate their gear, tactics, and personality.

Each fight must end in death — no ties, no peace. One side must fall dramatically.

Use vivid action, environmental detail, and creative attack/counter moves.

Team 1:
${team1Formatted}

Team 2:
${team2Formatted}

Begin:
`;

try {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content:
          "You are a brutal, unforgiving battle narrator. You MUST kill one side. Never end in peace.",
      },
      {
        role: "user",
        content: prompt
      },
    ],
    max_tokens: 4500,
    temperature: 0.9,
  });

  let summary =
    completion.choices[0].message.content.trim();

  // =============================
  // IMAGE GENERATION STARTS HERE
  // =============================

  let steps = summary
    .split(/(?<=\.)\s*\n+/)
    .filter(Boolean);

  while (steps.length < 5) {
    steps.push(
      "A tense moment between two fighters in a dramatic battleground."
    );
  }

  steps = steps.slice(0, 5);

  let imageResponses = [];

  try {
    imageResponses = await Promise.all(
      steps.map(async (text, index) => {
        try {
          const safeScene = text
            .replace(/\bcorpse\b/gi, "fallen opponent")
            .replace(/\blifeless body\b/gi, "defeated opponent")
            .replace(/\bblood\b/gi, "")
            .replace(/\bbloody\b/gi, "")
            .replace(/\bbloodied\b/gi, "")
            .replace(/\bgore\b/gi, "")
            .replace(/\bkilled\b/gi, "defeated")
            .replace(/\bkill\b/gi, "defeat")
            .replace(/\bdeath\b/gi, "defeat")
            .replace(/\bdied\b/gi, "fell")
            .replace(/\bdies\b/gi, "falls")
            .replace(/\bdecapitated\b/gi, "defeated")
            .replace(/\bdismembered\b/gi, "defeated")
            .trim();

          const imagePrompt = `
Cinematic illustrated battle scene.

Scene:
${safeScene}

Style:
dramatic comic-book illustration,
cinematic lighting,
dynamic action poses,
intense expressions,
dramatic camera angle,
detailed environment,
high energy,
non-graphic fantasy combat,
no gore,
no visible severe injuries,
no text,
no captions.
          `.trim();

          console.log(
            `🎯 Generating image ${index + 1}`
          );

          const image =
            await openai.images.generate({
              model: "gpt-image-2",
              prompt: imagePrompt,
              size: "1024x1024",
              quality: "low"
            });

          const base64Image =
            image.data?.[0]?.b64_json;

          if (!base64Image) {
            return null;
          }

          return `data:image/png;base64,${base64Image}`;

        } catch (imgErr) {
          console.error(
            `⚠️ Image ${index + 1} failed:`,
            imgErr?.message || imgErr
          );

          return null;
        }
      })
    );

    imageResponses =
      imageResponses.filter(Boolean);

    return res.json({
      summary,
      images: imageResponses
    });

  } catch (imgOuterErr) {
    console.error(
      "❌ Image generation error:",
      imgOuterErr
    );

    return res.json({
      summary,
      images: []
    });
  }

} catch (err) {

  console.error("❌ OpenAI Error:");
  console.error(err);

  res.status(500).json({
    summary: null,
    images: [],
    error: err.message || "Unknown server error"
  });
}
});



app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
