const http = require("http");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_SPORTS_KEY;

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

const server = http.createServer(async (req, res) => {

  if (req.method === "OPTIONS") {
    return send(res, 204, {});
  }

  if (req.url === "/health") {
    return send(res, 200, {
      online: true,
      service: "Soccer Predictor AI",
      apiConfigured: !!API_KEY
    });
  }

  /*
   * TODAY'S FIXTURES
   */

  if (req.url === "/api/fixtures") {

    if (!API_KEY) {
      return send(res, 500, {
        error: "API key is not configured on the server."
      });
    }

    try {

      const today =
        new Date().toISOString().split("T")[0];

      const result = await apiRequest(
        `https://v3.football.api-sports.io/fixtures?date=${today}`
      );

      return send(
        res,
        result.status,
        result.data
      );

    } catch (error) {

      return send(res, 500, {
        error: "Could not connect to API-Sports."
      });

    }
  }

  /*
   * MATCH PREDICTION
   *
   * Example:
   * /api/prediction?fixture=123456
   */

  if (req.url.startsWith("/api/prediction")) {

    if (!API_KEY) {
      return send(res, 500, {
        error: "API key is not configured on the server."
      });
    }

    try {

      const url =
        new URL(
          req.url,
          `http://${req.headers.host}`
        );

      const fixture =
        url.searchParams.get("fixture");

      if (!fixture) {
        return send(res, 400, {
          error: "Fixture ID is required."
        });
      }

      const result = await apiRequest(
        `https://v3.football.api-sports.io/predictions?fixture=${fixture}`
      );

      return send(
        res,
        result.status,
        result.data
      );

    } catch (error) {

      return send(res, 500, {
        error: "Could not retrieve prediction."
      });

    }
  }

  return send(res, 404, {
    error: "Endpoint not found"
  });

});

server.listen(PORT, () => {
  console.log(
    `Soccer Predictor AI server running on port ${PORT}`
  );
});
