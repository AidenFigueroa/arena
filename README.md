AI Battle Simulator

AI Battle Simulator is a browser-based application that uses OpenAI models to generate cinematic battles between fictional characters, custom fighters, or teams.

Users can define fighter names, mental abilities, physical abilities, and equipment, then simulate a narrated battle. The application also includes a tournament mode that places fighters into a bracket and advances winners through multiple rounds.

Features

Battle Simulator

Create two opposing teams

Add multiple fighters to either team

Enter optional fighter details:

Mental skills

Physical skills

Items or equipment

Add optional avatar image URLs

Generate a cinematic battle narrative

Display the battle one step at a time

Generate illustrated battle scenes

Replay the generated battle summary

Tournament Bracket

Add custom fighters

Store fighter names and abilities

Randomize bracket placement

Support automatic BYE advancement

Simulate individual bracket matches

Advance winners into later rounds

Display summaries for completed matches

Technology Stack

Frontend

HTML5

CSS3

Vanilla JavaScript

Bootstrap 5

Backend

Node.js

Express

OpenAI Node.js SDK

dotenv

AI Services Used by the Current Code

gpt-4o for battle narration

dall-e-3 for generated battle images

Project Structure

ai-battle-sim/
├── public/
│   ├── index.html
│   └── script.js
├── server.js
├── package.json
├── .env
├── .gitignore
└── README.md

File Descriptions

File

Purpose

public/index.html

Main user interface for battles and tournaments

public/script.js

Frontend form handling, battle display, fighter management, and bracket logic

server.js

Express server and OpenAI battle-generation endpoint

package.json

Project metadata, dependencies, and start script

.env

Stores the OpenAI API key locally

.gitignore

Prevents private or generated files from being committed

README.md

Project setup and usage documentation

Requirements

Before running the project, install:

Node.js

npm

An OpenAI API key

Check that Node.js and npm are available:

node --version
npm --version

Installation

1. Clone the Repository

git clone <your-repository-url>
cd ai-battle-sim

Replace <your-repository-url> with the actual GitHub repository URL.

2. Install Dependencies

npm install

The project currently uses:

{
  "dotenv": "^16.5.0",
  "express": "^4.18.2",
  "openai": "^4.100.0"
}

3. Create the Environment File

Create a file named .env in the project root:

OPENAI_API_KEY=your_openai_api_key_here

Do not place quotes around the key unless the value itself requires them.

4. Create a .gitignore

node_modules/
.env
.DS_Store
npm-debug.log*

The .env file must not be pushed to GitHub because it contains the private API key.

5. Start the Server

npm start

The current start command runs:

node server.js

Open the application at:

http://localhost:3000

How to Use

Standard Battle

Open the Battle Simulator tab.

Click Add Fighter under Team 1.

Enter at least the fighter's name.

Optionally enter mental skills, physical skills, and equipment.

Add one or more fighters to Team 2.

Optionally add avatar image URLs.

Click Simulate Battle.

Wait for the generated narration and images.

Use Replay Battle to display the saved battle again.

At least one named fighter must exist on each team.

Tournament Mode

Open the Tournament Bracket tab.

Enter a fighter name.

Optionally enter mental skills, physical skills, and equipment.

Click Add Fighter.

Add at least two fighters.

Click Generate Bracket.

Simulate each available match.

Winners automatically advance into the next round.

When a fighter has no opponent, that fighter advances through a BYE.

API

Generate a Battle

POST /api/battle
Content-Type: application/json

The backend accepts two different request formats.

Team Battle Request

{
  "team1Fighters": [
    {
      "name": "Goku",
      "mental": "Combat instinct",
      "physical": "Super strength and speed",
      "item": "Power Pole"
    }
  ],
  "team2Fighters": [
    {
      "name": "Superman",
      "mental": "Experienced strategist",
      "physical": "Flight, strength, and heat vision",
      "item": "None"
    }
  ],
  "team1Avatar": "https://example.com/team1.png",
  "team2Avatar": "https://example.com/team2.png"
}

Bracket Match Request

{
  "team1": "Goku",
  "team2": "Superman",
  "team1Mental": "Combat instinct",
  "team1Physical": "Super strength and speed",
  "team2Mental": "Experienced strategist",
  "team2Physical": "Flight, strength, and heat vision"
}

Current Response Format

{
  "summary": "Generated battle narration...",
  "images": [
    "https://generated-image-url.example/1",
    "https://generated-image-url.example/2"
  ]
}

summary contains the complete generated battle narration.

images contains any battle images that were generated successfully. Individual image failures are ignored so the narration can still be returned.

Backend Flow

When /api/battle receives a request, the server:

Reads the submitted fighters.

Converts fighter data into a readable prompt.

Requests a cinematic battle from OpenAI.

Splits the generated summary into battle steps.

Pads the result if fewer than five steps are found.

Uses the first five steps as image prompts.

Requests one generated image per selected step.

Filters out failed image requests.

Returns the narration and successful images to the browser.

Frontend Flow

The frontend:

Collects fighter information from the form.

Sends the fighter data to /api/battle.

Shows a loading spinner.

Saves the returned narration.

Reveals each narration step with a delay.

Displays optional avatar images.

Appends generated comic panels.

Allows the narration to be replayed.

Environment Variables

Variable

Required

Description

OPENAI_API_KEY

Yes

API key used by the OpenAI SDK

PORT

No

Server port when supported by server.js

The current server uses port 3000 directly. For hosting platforms, replace:

const PORT = 3000;

with:

const PORT = process.env.PORT || 3000;

Current Limitations

This project is a functional prototype, but several areas need improvement before public deployment.

API Cost

Each standard battle can make:

One text-generation request

Up to five image-generation requests

Repeated simulations can use API credits quickly. Add rate limiting, request limits, or an option to disable image generation before deploying publicly.

Winner Detection

Tournament winner detection currently guesses the winner by examining whether a fighter's name appears in the final generated sentence.

This is unreliable because:

Both fighter names may appear

The narration may use pronouns

The final sentence may not state the winner clearly

Similar fighter names may produce false matches

A stronger design would require the backend to return structured data:

{
  "winner": "Goku",
  "loser": "Superman",
  "summary": "..."
}

Image Generation Response

The server should always send a response, even when the image-generation block fails.

A safer structure is:

try {
  imageResponses = await Promise.all(imageTasks);
} catch (error) {
  imageResponses = [];
}

return res.json({
  summary,
  images: imageResponses.filter(Boolean)
});

Replay Event Listener

The replay button listener is currently added inside the battle form submission handler. Submitting multiple battles can register multiple replay listeners.

Register the listener once outside the submit handler:

document.getElementById("replayBtn").addEventListener("click", () => {
  displayBattleSteps(savedSteps);
});

Tournament Equipment

The tournament interface includes an equipment field, but the current bracket JavaScript does not store or send it.

The fighter object should include:

bracketFighters.push({
  name,
  mental,
  physical,
  item
});

Bracket Display Lookup

The current bracket result lookup assumes a fixed number of matches:

document.querySelectorAll("#bracketDisplay .resultArea")[roundIdx * 2 + matchIdx]

This can select the wrong result area in larger tournaments.

Use a unique data attribute instead:

<div
  class="resultArea"
  data-round="0"
  data-match="0">
</div>

Then select it with:

document.querySelector(
  `.resultArea[data-round="${roundIdx}"][data-match="${matchIdx}"]`
);

HTML Injection

Fighter names and abilities are inserted with innerHTML.

A user could enter HTML that is rendered by the page. Prefer textContent, DOM element creation, or escaping user input before inserting it into HTML.

Prompt and Content Behavior

The current server prompt requires every battle to end with one side dying. This is a project design choice, but it reduces flexibility and may make the application inappropriate for some audiences.

A future version could include battle modes such as:

Knockout

Surrender

First blood

Non-lethal

Death battle

Team objective

Environmental survival

Recommended Improvements

High Priority

Return a structured winner from the backend.

Validate all request data.

Limit fighter name and ability lengths.

Add image-generation controls.

Add request rate limiting.

Add centralized error handling.

Prevent duplicate submissions while a battle is running.

Sanitize user-controlled text.

Move inline button handlers into script.js.

Add automated tests.

Feature Ideas

Selectable battle environments

Adjustable battle length

Non-lethal and lethal modes

Fighter stat sliders

Saved fighters

Saved battle history

Downloadable tournament brackets

Battle sound effects

Animated health bars

Team names

Custom battle rules

Structured scorecards

Seeded tournament brackets

Multiple AI narration styles

Image generation toggle

Single-elimination and double-elimination modes

Suggested Future Project Structure

ai-battle-sim/
├── public/
│   ├── index.html
│   ├── script.js
│   └── styles.css
├── src/
│   ├── app.js
│   ├── routes/
│   │   └── battleRoutes.js
│   ├── controllers/
│   │   └── battleController.js
│   ├── services/
│   │   ├── narrationService.js
│   │   └── imageService.js
│   ├── middleware/
│   │   ├── errorHandler.js
│   │   ├── rateLimiter.js
│   │   └── validateBattle.js
│   └── utils/
│       └── formatTeam.js
├── tests/
├── server.js
├── package.json
├── .env
├── .gitignore
└── README.md

Troubleshooting

OPENAI_API_KEY Is Missing

Confirm that:

The .env file exists in the project root

The variable is named exactly OPENAI_API_KEY

require("dotenv").config() runs before the OpenAI client is created

The server was restarted after editing .env

The Browser Shows Failed to generate battle

Check the terminal for the actual backend error.

Common causes include:

Missing API key

Invalid API key

Insufficient API credit

Unsupported model access

Network failure

Invalid request data

The server failing to return a response

The Page Loads but the Battle Request Returns 404

Confirm that:

The server is running

The page was opened through http://localhost:3000

The frontend sends requests to /api/battle

server.js defines app.post("/api/battle", ...)

Do not open public/index.html directly with a file:/// URL because the API route is provided by Express.

Tournament Match Shows an Error

Confirm that:

Both fighters are defined

The request contains team1 and team2

The backend supports the bracket request format

The OpenAI request succeeded

The response includes a non-empty summary

Images Do Not Appear

The narration may still succeed when one or more image requests fail.

Check:

Image-generation access

API credit

Image prompt validation

Browser console errors

Server warning messages

Security Notes

Never commit .env.

Never expose the OpenAI API key in frontend JavaScript.

Keep all OpenAI requests on the server.

Add rate limiting before public deployment.

Validate and limit all user input.

Do not trust fighter data received from the browser.

Avoid rendering raw user input through innerHTML.

Git Setup

Initialize the repository:

git init
git add .
git commit -m "Initial commit"

Connect it to GitHub:

git branch -M main
git remote add origin <your-repository-url>
git push -u origin main

When the remote repository already contains a README or another initial commit:

git pull origin main --rebase
git push -u origin main

License

No license was specified in the provided package.json.

Add a license before distributing or accepting outside contributions.

Author

Aiden Figueroa
