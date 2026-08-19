require("dotenv").config();

const express = require("express");
const path = require("path");
const http = require("http");
const https = require("https");

const app = express();

const PORT = process.env.PORT || 3000;
const AI_WORKER_URL = process.env.AI_WORKER_URL;
const AI_WORKER_TOKEN = process.env.AI_WORKER_TOKEN;

if (!AI_WORKER_URL) {
  throw new Error("AI_WORKER_URL is missing from environment variables.");
}

if (!AI_WORKER_TOKEN) {
  throw new Error("AI_WORKER_TOKEN is missing from environment variables.");
}

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "2mb" }));

function postJson(urlString, headers, bodyObject) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const client = url.protocol === "https:" ? https : http;
    const body = JSON.stringify(bodyObject);

    const req = client.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...headers
        },
        timeout: 0
      },
      (response) => {
        let raw = "";

        response.setEncoding("utf8");

        response.on("data", (chunk) => {
          raw += chunk;
        });

        response.on("end", () => {
          resolve({
            statusCode: response.statusCode || 500,
            raw
          });
        });
      }
    );

    req.on("error", reject);

    // Disable socket inactivity timeout for long local AI generations.
    req.setTimeout(0);

    req.write(body);
    req.end();
  });
}


function getClientForUrl(url) {
  return url.protocol === "https:"
    ? https
    : http;
}

app.get(
  "/api/battle-progress/:requestId",
  (req, res) => {
    const requestId = req.params.requestId;

    if (!/^[A-Za-z0-9_-]{8,128}$/.test(requestId)) {
      return res.status(400).json({
        error: "Invalid progress request ID."
      });
    }

    const workerUrl = new URL(
      `${AI_WORKER_URL.replace(/\/$/, "")}/progress/${encodeURIComponent(requestId)}`
    );

    const client =
      getClientForUrl(workerUrl);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });

    const upstream = client.request(
      workerUrl,
      {
        method: "GET",
        headers: {
          Authorization:
            `Bearer ${AI_WORKER_TOKEN}`,
          Accept: "text/event-stream"
        }
      },
      (workerResponse) => {
        if (
          !workerResponse.statusCode ||
          workerResponse.statusCode < 200 ||
          workerResponse.statusCode >= 300
        ) {
          res.write(
            `data: ${JSON.stringify({
              type: "error",
              message:
                `Progress worker returned status ${workerResponse.statusCode || 500}`
            })}\n\n`
          );

          res.end();
          return;
        }

        workerResponse.on(
          "data",
          (chunk) => {
            res.write(chunk);
          }
        );

        workerResponse.on(
          "end",
          () => {
            res.end();
          }
        );
      }
    );

    upstream.on("error", (error) => {
      try {
        res.write(
          `data: ${JSON.stringify({
            type: "error",
            message:
              `Progress stream error: ${error.message}`
          })}\n\n`
        );
      } catch {}

      try {
        res.end();
      } catch {}
    });

    upstream.setTimeout(0);
    upstream.end();

    req.on("close", () => {
      upstream.destroy();
    });
  }
);

app.post("/api/battle", async (req, res) => {
  try {
    const workerUrl =
      `${AI_WORKER_URL.replace(/\/$/, "")}/battle`;

    console.log("Sending battle request to AI worker...");

    const workerResponse = await postJson(
      workerUrl,
      {
        Authorization: `Bearer ${AI_WORKER_TOKEN}`
      },
      req.body
    );

    let data;

    try {
      data = JSON.parse(workerResponse.raw);
    } catch {
      throw new Error(
        `AI worker returned invalid JSON: ${workerResponse.raw}`
      );
    }

    if (
      workerResponse.statusCode < 200 ||
      workerResponse.statusCode >= 300
    ) {
      console.error("AI worker error:", data);

      return res.status(workerResponse.statusCode).json({
        title: null,
        summary: null,
        winner: null,
        images: [],
        error:
          data.error ||
          `AI worker returned status ${workerResponse.statusCode}`
      });
    }

    console.log(
      `Battle generated with ${data.images?.length || 0} images`
    );

    return res.json({
      title: data.title || null,
      summary: data.summary,
      winner: data.winner || null,
      images: Array.isArray(data.images) ? data.images : []
    });
  } catch (err) {
    console.error("Battle generation failed:");
    console.error(err);

    return res.status(500).json({
      title: null,
      summary: null,
      winner: null,
      images: [],
      error: err.message || "Battle generation failed."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Arena server running at http://localhost:${PORT}`);
});