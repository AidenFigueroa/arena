# AI Battle Simulator

**A full-stack generative AI application that creates cinematic battles, illustrated scenes, and single-elimination tournaments from user-defined fighters.**

AI Battle Simulator allows users to create fictional fighters or teams, describe their mental abilities, physical abilities, and equipment, and generate a narrated battle through the OpenAI API. The application converts the resulting narrative into sequential battle scenes, requests matching AI-generated images, and presents the experience through an interactive browser interface.

A tournament mode extends the same generation pipeline into a bracket system that randomizes competitors, handles automatic byes, simulates individual matches, and advances winners through later rounds.

> **Status:** Functional prototype for local development and testing. The current version demonstrates the core AI and tournament workflows but requires stronger validation, structured model output, rate limiting, and automated testing before public deployment.

## Project Highlights

* Built a full-stack generative AI application with Node.js, Express, and vanilla JavaScript
* Integrated text and image generation through the OpenAI Node.js SDK
* Designed a prompt-building pipeline for custom fighters, teams, abilities, and equipment
* Converted generated narration into sequential battle scenes
* Generated up to five illustrated panels from selected narrative steps
* Allowed narration to succeed even when individual image requests fail
* Built a randomized single-elimination tournament bracket
* Implemented automatic bye advancement and winner progression
* Supported both team-battle and tournament-match request formats
* Identified current reliability, security, cost, and scalability limitations
* Documented a production-oriented refactoring plan

## Why I Built It

I built AI Battle Simulator to explore how a generative AI feature becomes a complete interactive application rather than a single API call.

The main challenge was coordinating several stages of work:

1. Collect structured fighter information from the browser
2. Convert that information into a clear model prompt
3. Request a cinematic battle narrative
4. Break the narrative into displayable battle steps
5. Select scenes that can be used as image prompts
6. Request matching generated artwork
7. Handle partial image-generation failures
8. Return the available results to the frontend
9. Reveal the battle progressively in the browser
10. Reuse the generation workflow inside a tournament bracket

This project gave me practical experience with API integration, prompt construction, asynchronous request handling, frontend state, tournament progression, and the reliability problems that appear when probabilistic model output controls application logic.

## Core Features

### Battle Simulator

Users can:

* Create two opposing teams
* Add multiple fighters to either team
* Enter fighter names, mental abilities, physical abilities, and equipment
* Add optional avatar image URLs
* Generate a cinematic battle narrative
* View the battle one step at a time
* Display generated illustrations for selected scenes
* Replay the completed battle

At least one named fighter must be submitted for each team.

### Tournament Mode

The tournament system supports:

* Custom fighter creation
* Fighter ability and equipment data
* Randomized bracket placement
* Automatic bye advancement
* Individual match simulation
* Winner advancement into later rounds
* Match summaries for completed battles
* Multi-round single-elimination progression

## Technology Stack

### Frontend

* HTML5
* CSS3
* Vanilla JavaScript
* Bootstrap 5

### Backend

* Node.js
* Express
* OpenAI Node.js SDK
* dotenv

### AI Services Used by the Current Implementation

* `gpt-4o` for battle narration
* `dall-e-3` for generated battle scenes

## Application Architecture

```text
Browser Interface
      |
      | Fighter and team data
      v
POST /api/battle
      |
      v
Express Backend
      |
      +--> Validate and normalize request data
      +--> Format fighters into a battle prompt
      +--> Request cinematic narration
      +--> Split narration into battle steps
      +--> Select up to five scene prompts
      +--> Request generated images
      +--> Filter failed image requests
      |
      v
JSON Response
      |
      +--> Battle summary
      +--> Successful image URLs
      |
      v
Frontend Presentation
      |
      +--> Progressive narration reveal
      +--> Generated comic panels
      +--> Replay controls
      +--> Tournament bracket updates
```

## AI Generation Pipeline

When the backend receives a battle request, it:

1. Reads the submitted fighter or team data
2. Formats the data into a readable prompt
3. Sends the prompt to the text-generation model
4. Receives a complete battle narrative
5. Splits the narrative into individual battle steps
6. Pads the result when fewer than five steps are available
7. Uses the first five selected steps as image prompts
8. Requests one generated image for each selected scene
9. Filters out unsuccessful image requests
10. Returns the narration and successful images to the browser

This design treats narration as the primary result. Image generation is optional enhancement data, so a failed image request does not have to discard an otherwise successful battle.

## Frontend Experience

The frontend:

* Collects fighter data from dynamically managed forms
* Sends battle requests to the Express API
* Displays a loading state while generation is in progress
* Stores the returned battle summary
* Reveals narration steps with a delay
* Displays optional fighter avatars
* Appends generated battle panels
* Supports replaying the saved battle
* Creates and updates tournament bracket state
* Advances winners into later rounds

## API

### Generate a Battle

```http
POST /api/battle
Content-Type: application/json
```

The endpoint supports both team battles and tournament matches.

### Team Battle Request

```json
{
  "team1Fighters": [
    {
      "name": "Fighter One",
      "mental": "Strategic planning",
      "physical": "Enhanced speed and strength",
      "item": "Energy staff"
    }
  ],
  "team2Fighters": [
    {
      "name": "Fighter Two",
      "mental": "Experienced tactician",
      "physical": "Flight and energy projection",
      "item": "Shield"
    }
  ],
  "team1Avatar": "https://example.com/team-one.png",
  "team2Avatar": "https://example.com/team-two.png"
}
```

### Tournament Match Request

```json
{
  "team1": "Fighter One",
  "team2": "Fighter Two",
  "team1Mental": "Strategic planning",
  "team1Physical": "Enhanced speed and strength",
  "team2Mental": "Experienced tactician",
  "team2Physical": "Flight and energy projection"
}
```

### Current Response

```json
{
  "summary": "Generated battle narration...",
  "images": [
    "https://generated-image-url.example/1",
    "https://generated-image-url.example/2"
  ]
}
```

The `summary` contains the generated narration. The `images` array contains only the image requests that completed successfully.

## Project Structure

```text
ai-battle-sim/
├── public/
│   ├── index.html       # Battle and tournament interface
│   └── script.js        # Forms, rendering, fighter state, and bracket logic
├── server.js            # Express server and OpenAI generation workflow
├── package.json         # Dependencies and start command
├── .env                 # Local API configuration
├── .gitignore           # Excluded secrets and generated files
└── README.md
```

## Installation

### Prerequisites

* A recent Node.js release
* npm
* An OpenAI API key

Verify Node.js and npm:

```bash
node --version
npm --version
```

### Clone the Repository

```bash
git clone <your-repository-url>
cd ai-battle-sim
```

### Install Dependencies

```bash
npm install
```

The current project dependencies include:

```json
{
  "dotenv": "^16.5.0",
  "express": "^4.18.2",
  "openai": "^4.100.0"
}
```

### Configure the Environment

Create a `.env` file in the project root:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

Do not commit this file or expose the API key in frontend JavaScript.

Recommended `.gitignore` entries:

```gitignore
node_modules/
.env
.DS_Store
npm-debug.log*
```

### Start the Application

```bash
npm start
```

The current start command runs:

```bash
node server.js
```

Open the application at:

```text
http://localhost:3000
```

## Engineering Challenges

### Coordinating Text and Image Generation

A standard battle can require one narration request followed by as many as five image requests. The backend must coordinate multiple asynchronous operations while preserving the narration when one or more images fail.

### Turning Probabilistic Output Into Application State

The current tournament logic attempts to identify the winner from the generated narration. Natural-language output is not a reliable application interface because both names may appear in the final sentence, pronouns may be used, or the result may be phrased unpredictably.

A production version should require structured output such as:

```json
{
  "winner": "Fighter One",
  "loser": "Fighter Two",
  "summary": "Generated battle narration..."
}
```

This would separate display content from tournament-control data.

### Maintaining Bracket State

Tournament mode must track competitors across rounds, automatically advance fighters with no opponent, enable only valid matches, and insert winners into the correct future position.

The current implementation works as a prototype but should use stable round and match identifiers rather than relying on fixed DOM element positions.

### Managing API Cost

Each battle may trigger up to six paid generation requests: one for text and five for images. A public version would need:

* Rate limiting
* Per-user request limits
* Duplicate-submission prevention
* Configurable image counts
* An image-generation toggle
* Usage monitoring
* Clear failure messages

### Handling Untrusted Input

Fighter names and abilities are user-controlled data. They must be validated before reaching prompts or the DOM.

A production version should:

* Limit input lengths
* Validate required fields and data types
* Avoid rendering raw input with `innerHTML`
* Use `textContent` or safe DOM construction
* Treat browser data as untrusted
* Add server-side request validation

## Current Limitations

The current version is a functional prototype, not a production deployment.

Known limitations include:

* Tournament winners are inferred from unstructured narration
* Request data is not fully validated
* API usage is not rate-limited
* Image generation can consume credits quickly
* User-controlled text may be inserted with `innerHTML`
* The replay listener can be registered more than once
* Tournament equipment is not consistently stored and submitted
* Bracket result lookup assumes a fixed DOM layout
* Duplicate battle submissions are not fully prevented
* Error handling is not centralized
* Automated tests have not been added
* The server currently uses a fixed port value

## Production Readiness Roadmap

The next engineering priorities are:

1. Return structured winner and loser fields from the backend
2. Validate and normalize every battle request
3. Limit fighter names, abilities, and equipment fields
4. Add rate limiting and request quotas
5. Add an image-generation toggle and configurable image count
6. Prevent duplicate submissions during generation
7. Sanitize all user-controlled text
8. Replace fixed bracket lookups with unique match identifiers
9. Add centralized backend error handling
10. Split narration and image generation into separate services
11. Add automated API and bracket tests
12. Support `process.env.PORT` for deployment platforms

A possible future backend structure is:

```text
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
```

## Potential Enhancements

* Selectable battle environments
* Adjustable battle length
* Lethal and non-lethal battle modes
* Fighter stat sliders
* Saved fighters
* Saved battle history
* Downloadable tournament brackets
* Animated health bars
* Sound effects
* Custom team names
* Configurable battle rules
* Structured scorecards
* Seeded brackets
* Multiple narration styles
* Single- and double-elimination tournaments

## Skills Demonstrated

* Full-stack JavaScript development
* Node.js and Express API development
* OpenAI API integration
* Prompt construction and data formatting
* Text and image generation workflows
* Asynchronous request coordination
* Graceful handling of partial failures
* REST endpoint design
* Dynamic frontend forms
* Browser state management
* Tournament and bracket algorithms
* DOM rendering and event handling
* Environment-variable and secret management
* API cost analysis
* Input-validation and security analysis
* Production-readiness planning
* Technical documentation

## Current Status

AI Battle Simulator is a working prototype that demonstrates how generative text and image models can be integrated into an interactive full-stack application.

Its strongest engineering areas are the multi-stage AI generation pipeline, partial-failure handling, dynamic fighter management, and tournament progression. Future work is focused on replacing narration-based winner detection with structured model output, strengthening validation and security, controlling API usage, and separating the backend into testable services.

## License

No license is currently specified.

## Author

Aiden Figueroa
