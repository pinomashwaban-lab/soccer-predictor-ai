const http = require("http");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_SPORTS_KEY;

const SIGNAL_THRESHOLD = 78;
const CACHE_MS = 15 * 60 * 1000;

let signalCache = {
  time: 0,
  data: []
};

function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });

  res.end(JSON.stringify(data));
}

async function apiRequest(url) {
  const response = await fetch(url, {
    headers: {
      "x-apisports-key": API_KEY
    }
  });

  return {
    status: response.status,
    data: await response.json()
  };
}

function getDate(offset) {
  const date = new Date();

  date.setUTCDate(
    date.getUTCDate() + offset
  );

  return date.toISOString().split("T")[0];
}

function parsePercent(value) {
  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    return NaN;
  }

  return parseFloat(
    String(value).replace("%", "")
  );
}

async function getUpcomingFixtures() {

  const dates = [
    getDate(0),
    getDate(1),
    getDate(2)
  ];

  const all = [];

  for (const date of dates) {

    const result = await apiRequest(
      `https://v3.football.api-sports.io/fixtures?date=${date}`
    );

    if (
      result.data &&
      Array.isArray(result.data.response)
    ) {

      all.push(
        ...result.data.response
      );

    }
  }

  const now = Date.now();
  const seen = new Set();

  return all

    .filter(fixture =>
      fixture.fixture &&
      fixture.fixture.date
    )

    .filter(fixture =>
      new Date(
        fixture.fixture.date
      ).getTime() > now
    )

    .sort((a, b) =>
      new Date(
        a.fixture.date
      ).getTime() -
      new Date(
        b.fixture.date
      ).getTime()
    )

    .filter(fixture => {

      const id =
        fixture.fixture.id;

      if (seen.has(id)) {
        return false;
      }

      seen.add(id);

      return true;
    });
}

async function getSignal(fixture) {

  try {

    const result = await apiRequest(
      `https://v3.football.api-sports.io/predictions?fixture=${fixture.fixture.id}`
    );

    const prediction =
      result.data?.response?.[0]?.predictions;

    if (!prediction) {
      return null;
    }

    const home =
      parsePercent(
        prediction.percent?.home
      );

    const draw =
      parsePercent(
        prediction.percent?.draw
      );

    const away =
      parsePercent(
        prediction.percent?.away
      );

    const options = [

      {
        type: "HOME",
        value: home
      },

      {
        type: "DRAW",
        value: draw
      },

      {
        type: "AWAY",
        value: away
      }

    ].filter(option =>
      !Number.isNaN(option.value)
    );

    if (!options.length) {
      return null;
    }

    const strongest =
      options.reduce(
        (a, b) =>
          b.value > a.value
            ? b
            : a
      );

    if (
      strongest.value <
      SIGNAL_THRESHOLD
    ) {
      return null;
    }

    return {

      fixture,

      prediction,

      signal:
        strongest.type,

      probability:
        strongest.value

    };

  } catch (error) {

    console.error(
      "Prediction error:",
      error.message
    );

    return null;
  }
}

const server = http.createServer(
  async (req, res) => {

    if (req.method === "OPTIONS") {
      return send(res, 204, {});
    }

    /*
     * HEALTH CHECK
     */

    if (req.url === "/health") {

      return send(res, 200, {

        online: true,

        service:
          "Soccer Predictor AI",

        apiConfigured:
          !!API_KEY,

        signalThreshold:
          `${SIGNAL_THRESHOLD}%`

      });

    }

    /*
     * NORMAL UPCOMING FIXTURES
     */

    if (req.url === "/api/fixtures") {

      if (!API_KEY) {

        return send(res, 500, {
          error:
            "API key is not configured on the server."
        });

      }

      try {

        const fixtures =
          await getUpcomingFixtures();

        return send(res, 200, {

          get: "fixtures",

          results:
            fixtures.length,

          response:
            fixtures.slice(0, 10)

        });

      } catch (error) {

        console.error(error);

        return send(res, 500, {

          error:
            "Could not load upcoming fixtures."

        });

      }
    }

    /*
     * 78% SIGNAL MODE
     */

    if (req.url === "/api/signals") {

      if (!API_KEY) {

        return send(res, 500, {

          error:
            "API key is not configured on the server."

        });

      }

      /*
       * Use cached signals for 15 minutes
       * to protect the free API quota.
       */

      if (
        Date.now() -
        signalCache.time <
        CACHE_MS
      ) {

        return send(res, 200, {

          threshold:
            SIGNAL_THRESHOLD,

          cached: true,

          results:
            signalCache.data.length,

          response:
            signalCache.data

        });

      }

      try {

        const candidates =
          (
            await getUpcomingFixtures()
          ).slice(0, 15);

        const signals = [];

        /*
         * Check up to 15 upcoming matches.
         * Stop when 10 qualifying signals
         * have been found.
         */

        for (
          const fixture
          of candidates
        ) {

          if (
            signals.length >= 10
          ) {
            break;
          }

          const signal =
            await getSignal(
              fixture
            );

          if (signal) {

            signals.push(
              signal
            );

          }

        }

        signalCache = {

          time: Date.now(),

          data: signals

        };

        return send(res, 200, {

          threshold:
            SIGNAL_THRESHOLD,

          cached: false,

          results:
            signals.length,

          response:
            signals

        });

      } catch (error) {

        console.error(error);

        return send(res, 500, {

          error:
            "Could not generate 78% signals."

        });

      }
    }

    /*
     * INDIVIDUAL PREDICTION
     */

    if (
      req.url.startsWith(
        "/api/prediction"
      )
    ) {

      if (!API_KEY) {

        return send(res, 500, {

          error:
            "API key is not configured on the server."

        });

      }

      try {

        const url = new URL(
          req.url,
          `http://${req.headers.host}`
        );

        const fixture =
          url.searchParams.get(
            "fixture"
          );

        if (!fixture) {

          return send(res, 400, {

            error:
              "Fixture ID is required."

          });

        }

        const result =
          await apiRequest(
            `https://v3.football.api-sports.io/predictions?fixture=${fixture}`
          );

        return send(
          res,
          result.status,
          result.data
        );

      } catch (error) {

        console.error(error);

        return send(res, 500, {

          error:
            "Could not retrieve prediction."

        });

      }
    }

    return send(res, 404, {

      error:
        "Endpoint not found"

    });

  }
);

server.listen(
  PORT,
  () => {

    console.log(
      `Soccer Predictor AI server running on port ${PORT}`
    );

  }
);
