import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import "dotenv/config";

// Import your weather function directly
async function fetchWeather(city: string) {
  const apiKey = process.env.WEATHER_API_KEY;
  if (!apiKey) throw new Error("Missing WEATHER_API_KEY in .env");

  const url = `http://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(
    city
  )}&aqi=no`;

  const response = await fetch(url);
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`WeatherAPI failed (${response.status}): ${errText}`);
  }
  return await response.json();
}

// Gemini client
const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY || "",
});

// Your existing weather tool logic
async function getWeatherTool(fullPrompt: string, city: string = "London") {
  try {
    let weatherJson;

    try {
      // Primary: WeatherAPI.com
      weatherJson = await fetchWeather(city);
    } catch (err: any) {
      return {
        content: [{ 
          type: "text", 
          text: `❌ Unable to fetch weather data for "${city}". WeatherAPI.com error: ${err.message}. Please check your WEATHER_API_KEY or try a different city name.` 
        }],
      };
    }

    // Try to analyze with Gemini, but fallback if quota exceeded
    try {
      const result = await generateText({
        model: google("gemini-1.5-flash"),
        prompt: `
You are a Weather Assistant. Below is live weather data:

${JSON.stringify(weatherJson, null, 2)}

User Query: "${fullPrompt}"

Provide a concise weather summary including temperature, humidity, condition, and wind. Keep it brief.
        `,
      });

      return { content: [{ type: "text", text: result.text }] };
    } catch (aiErr: any) {
      // Fallback to basic weather report without AI enhancement
      if (aiErr.message?.includes('quota') || 
          aiErr.message?.includes('rate') ||
          aiErr.message?.includes('unregistered callers') ||
          aiErr.message?.includes('established identity') ||
          aiErr.message?.includes('API Key')) {
        const basicReport = formatBasicWeatherReport(weatherJson, fullPrompt, city);
        return { content: [{ type: "text", text: basicReport }] };
      } else {
        throw aiErr;
      }
    }
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `❌ Error fetching weather data: ${err.message}` }],
    };
  }
}

// Helper function to format basic weather report
function formatBasicWeatherReport(weatherData: any, query: string, city: string): string {
  try {
    if (weatherData.current) {
      const current = weatherData.current;
      const location = weatherData.location;
      return `🌤️ **Weather Report for ${location?.name || city}**

**Current Conditions:**
- Temperature: ${current.temp_c}°C (${current.temp_f}°F)
- Condition: ${current.condition?.text || 'Unknown'}
- Humidity: ${current.humidity}%
- Wind: ${current.wind_kph} km/h ${current.wind_dir}
- Feels like: ${current.feelslike_c}°C

**Query:** "${query}"
**Data source:** WeatherAPI.com

*Note: AI analysis unavailable due to quota limits. Showing basic weather data.*`;
    }
    
    return `❌ Unable to parse weather data format: ${JSON.stringify(weatherData).substring(0, 200)}...`;
  } catch (err) {
    return `❌ Error formatting weather report: ${err}`;
  }
}

// Simple HTTP server
import { createServer } from 'http';
import { URL } from 'url';

const server = createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/weather') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { fullPrompt, city } = JSON.parse(body);
        const result = await getWeatherTool(fullPrompt, city);
        
        if (result.content && result.content.length > 0) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: true, 
            weather: result.content[0].text 
          }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'No weather data returned' 
          }));
        }
      } catch (error: any) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: false, 
          error: error.message 
        }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const PORT = process.env.MCP_HTTP_PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 MCP HTTP Wrapper running on port ${PORT}`);
});
