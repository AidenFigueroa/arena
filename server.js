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
  throw new Error(
    "AI_WORKER_URL is missing from environment variables."
  );
}

if (!AI_WORKER_TOKEN) {
  throw new Error(
    "AI_WORKER_TOKEN is missing from environment variables."
  );
}

app.use(
  express.static(path.join(__dirname, "public"))
);

app.use(
  express.json({
    limit: "2mb"
  })
);


/* ============================================================
   HELPERS
============================================================ */

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}


function getClientForUrl(url) {
  return url.protocol === "https:"
    ? https
    : http;
}


/*
  GET request helper.

  We use this to call /health on the Lightning worker.

  Calling the public /health URL is what causes Lightning's
  auto-start endpoint to wake the sleeping Studio.
*/
function getUrl(urlString) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);

    const client = getClientForUrl(url);

    const req = client.request(
      url,
      {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      },
      (response) => {
        let raw = "";

        response.setEncoding("utf8");

        response.on("data", (chunk) => {
          raw += chunk;
        });

        response.on("end", () => {
          resolve({
            statusCode:
              response.statusCode || 500,

            raw
          });
        });
      }
    );

    req.on("error", reject);

    /*
      Each individual health request gets 20 seconds.

      If Lightning is still waking, this request may fail.
      That is expected. waitForWorkerReady() retries it.
    */
    req.setTimeout(
      20000,
      () => {
        req.destroy(
          new Error(
            "AI worker health request timed out."
          )
        );
      }
    );

    req.end();
  });
}


/*
  Wait for the Lightning worker to become usable.

  This does THREE things:

  1. Calling /health wakes the sleeping Lightning Studio.
  2. Lightning starts the T4.
  3. on_start.sh starts Ollama, ComfyUI and worker.js.

  We do not send the actual battle until all three services
  report ready.
*/
async function waitForWorkerReady() {
  const baseUrl =
    AI_WORKER_URL.replace(/\/$/, "");

  const healthUrl =
    `${baseUrl}/health`;

  /*
    Give the entire wake sequence six minutes.

    Your cold-start test took several attempts, so this gives
    Lightning enough time to boot the T4 and start everything.
  */
  const deadline =
    Date.now() + 6 * 60 * 1000;

  let attempt = 0;

  console.log(
    "Waking/checking AI worker..."
  );

  console.log(
    `Worker health URL: ${healthUrl}`
  );

  while (Date.now() < deadline) {
    attempt++;

    console.log(
      `AI worker wake check ${attempt}...`
    );

    try {
      const response =
        await getUrl(healthUrl);

      if (
        response.statusCode >= 200 &&
        response.statusCode < 300
      ) {
        let data = null;

        try {
          data =
            JSON.parse(response.raw);
        } catch {
          console.log(
            "Worker health returned non-JSON response."
          );
        }

        if (
          data &&
          data.worker === "ok" &&
          data.ollama === true &&
          data.comfyui === true
        ) {
          console.log(
            "AI worker is fully ready."
          );

          console.log(
            `Ollama: ${data.ollama}`
          );

          console.log(
            `ComfyUI: ${data.comfyui}`
          );

          console.log(
            `Model: ${data.ollamaModel || "unknown"}`
          );

          return;
        }

        console.log(
          "Worker responded, but AI services are not ready yet."
        );
      } else {
        console.log(
          `Worker health returned status ${response.statusCode}.`
        );
      }
    } catch (error) {
      console.log(
        `AI worker not ready yet: ${error.message}`
      );
    }

    await sleep(10000);
  }

  throw new Error(
    "AI worker did not become ready within 6 minutes."
  );
}


/*
  POST JSON helper used for the actual /battle request.

  There is intentionally no socket timeout because AI image
  generation can take several minutes.
*/
function postJson(
  urlString,
  headers,
  bodyObject
) {
  return new Promise(
    (resolve, reject) => {
      const url =
        new URL(urlString);

      const client =
        getClientForUrl(url);

      const body =
        JSON.stringify(bodyObject);

      const req =
        client.request(
          url,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              "Content-Length":
                Buffer.byteLength(body),

              ...headers
            },

            timeout: 0
          },

          (response) => {
            let raw = "";

            response.setEncoding(
              "utf8"
            );

            response.on(
              "data",
              (chunk) => {
                raw += chunk;
              }
            );

            response.on(
              "end",
              () => {
                resolve({
                  statusCode:
                    response.statusCode ||
                    500,

                  raw
                });
              }
            );
          }
        );

      req.on(
        "error",
        reject
      );

      /*
        Disable socket inactivity timeout for
        long AI generations.
      */
      req.setTimeout(0);

      req.write(body);

      req.end();
    }
  );
}


/* ============================================================
   BATTLE PROGRESS SSE PROXY
============================================================ */

app.get(
  "/api/battle-progress/:requestId",
  (req, res) => {
    const requestId =
      req.params.requestId;

    if (
      !/^[A-Za-z0-9_-]{8,128}$/.test(
        requestId
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            "Invalid progress request ID."
        });
    }

    const workerUrl =
      new URL(
        `${AI_WORKER_URL.replace(
          /\/$/,
          ""
        )}/progress/${encodeURIComponent(
          requestId
        )}`
      );

    const client =
      getClientForUrl(workerUrl);

    res.writeHead(
      200,
      {
        "Content-Type":
          "text/event-stream",

        "Cache-Control":
          "no-cache, no-transform",

        Connection:
          "keep-alive",

        "X-Accel-Buffering":
          "no"
      }
    );

    const upstream =
      client.request(
        workerUrl,
        {
          method: "GET",

          headers: {
            Authorization:
              `Bearer ${AI_WORKER_TOKEN}`,

            Accept:
              "text/event-stream"
          }
        },

        (workerResponse) => {
          if (
            !workerResponse.statusCode ||
            workerResponse.statusCode <
              200 ||
            workerResponse.statusCode >=
              300
          ) {
            res.write(
              `data: ${JSON.stringify({
                type: "error",

                message:
                  `Progress worker returned status ${
                    workerResponse.statusCode ||
                    500
                  }`
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

    upstream.on(
      "error",
      (error) => {
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
      }
    );

    upstream.setTimeout(0);

    upstream.end();

    req.on(
      "close",
      () => {
        upstream.destroy();
      }
    );
  }
);


/* ============================================================
   BATTLE ROUTE
============================================================ */

app.post(
  "/api/battle",
  async (req, res) => {
    try {
      const baseUrl =
        AI_WORKER_URL.replace(
          /\/$/,
          ""
        );

      const workerUrl =
        `${baseUrl}/battle`;

      const requestId =
        typeof req.body?.requestId ===
        "string"
          ? req.body.requestId
          : "no-request-id";

      console.log("");
      console.log(
        "=========================================="
      );

      console.log(
        `Battle request received [${requestId}]`
      );

      /*
        IMPORTANT:

        Do NOT immediately send /battle.

        First hit /health repeatedly. That wakes Lightning and
        waits until T4 + Ollama + ComfyUI + worker.js are ready.
      */
      console.log(
        "Waking AI worker if necessary..."
      );

      await waitForWorkerReady();

      console.log(
        `Sending battle request to AI worker... [${requestId}]`
      );

      console.log(
        `Worker battle URL: ${workerUrl}`
      );

      const workerResponse =
        await postJson(
          workerUrl,

          {
            Authorization:
              `Bearer ${AI_WORKER_TOKEN}`
          },

          req.body
        );

      let data;

      try {
        data =
          JSON.parse(
            workerResponse.raw
          );
      } catch {
        throw new Error(
          `AI worker returned invalid JSON: ${workerResponse.raw}`
        );
      }

      if (
        workerResponse.statusCode <
          200 ||
        workerResponse.statusCode >=
          300
      ) {
        console.error(
          "AI worker error:",
          data
        );

        return res
          .status(
            workerResponse.statusCode
          )
          .json({
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
        `Battle generated with ${
          data.images?.length || 0
        } images`
      );

      console.log(
        "=========================================="
      );

      return res.json({
        title:
          data.title || null,

        summary:
          data.summary,

        winner:
          data.winner || null,

        images:
          Array.isArray(data.images)
            ? data.images
            : []
      });
    } catch (err) {
      console.error(
        "Battle generation failed:"
      );

      console.error(err);

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


/* ============================================================
   START SERVER
============================================================ */

const server =
  app.listen(
    PORT,
    () => {
      console.log(
        `Arena server running at http://localhost:${PORT}`
      );

      console.log(
        `AI worker base URL: ${AI_WORKER_URL}`
      );
    }
  );

/*
  Don't kill an active long-running HTTP connection merely
  because battle generation takes several minutes.
*/
server.timeout = 0;