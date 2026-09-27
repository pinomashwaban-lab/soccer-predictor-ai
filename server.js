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

  if (req.url === "/api/fixtures") {
    if (!API_KEY) {
      return send(res, 500, {
        error: "API key is not configured on the server."
      });
    }

    try {
      const response = await fetch(
        "https://v3.football.api-sports.io/fixtures?next=20",
        {
          headers: {
            "x-apisports-key": API_KEY
          }
        }
      );

      const data = await response.json();

      return send(res, response.status, data);
    } catch (error) {
      return send(res, 500, {
        error: "Could not connect to API-Sports."
      });
    }
  }

  return send(res, 404, {
    error: "Endpoint not found"
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
