import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import "dotenv/config";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";

// ✅ Gemini client
const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY || "",
});

// ✅ MCP server
const server = new McpServer({
  name: "Weather Service",
  version: "1.0.0",
  capabilities: {
    tools: {},
    prompts: {},
    resources: {},
  },
});

// ✅ Helper: WeatherAPI.com
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

// ✅ MCP Tool
server.tool(
  "getWeather",
  {
    fullPrompt: z.string().describe("The complete user query about weather data"),
    city: z.string().optional().describe("City name for weather data"),
  },
  async ({ fullPrompt, city = "London" }) => {
    try {
      let weatherJson;

      try {
        // 🔑 Primary: WeatherAPI.com
        weatherJson = await fetchWeather(city);
      } catch (err: any) {
        // No fallback API - provide clear error message
        return {
          content: [{ 
            type: "text", 
            text: `❌ Unable to fetch weather data for "${city}". WeatherAPI.com error: ${err.message}. Please check your WEATHER_API_KEY or try a different city name.` 
          }],
        };
      }

      // 🤖 Try to analyze with Gemini, but fallback if quota exceeded
      try {
        const result = await generateText({
          model: google("gemini-1.5-flash"), // Use flash model for lower quota usage
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
          // Log the error to stderr for debugging
          process.stderr.write(`[AI-ERROR] Unhandled AI error: ${aiErr.message}\n`);
          throw aiErr; // Re-throw if it's not a known API issue
        }
      }
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `❌ Error fetching weather data: ${err.message}` }],
      };
    }
  }
);

// Helper function to format basic weather report without AI
function formatBasicWeatherReport(weatherData: any, query: string, city: string): string {
  try {
    // Handle WeatherAPI.com format
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
    
    // Handle Open-Meteo format (if we ever add it back)
    if (weatherData.current_weather) {
      const current = weatherData.current_weather;
      return `🌤️ **Weather Report for ${city}**

**Current Conditions:**
- Temperature: ${current.temperature}°C
- Wind Speed: ${current.windspeed} km/h
- Wind Direction: ${current.winddirection}°

**Query:** "${query}"
**Data source:** Open-Meteo

*Note: AI analysis unavailable due to quota limits. Showing basic weather data.*`;
    }

    return `❌ Unable to parse weather data format: ${JSON.stringify(weatherData).substring(0, 200)}...`;
  } catch (err) {
    return `❌ Error formatting weather report: ${err}`;
  }
}

// ✅ Start MCP server
async function startServer() {
  try {
    // Ensure no console.log or other stdout pollution
    const originalConsoleError = console.error;
    
    // Redirect console to stderr to avoid polluting stdout
    console.log = (...args) => originalConsoleError('[LOG]', ...args);
    console.error = (...args) => originalConsoleError('[ERROR]', ...args);
    
    const transport = new StdioServerTransport();
    
    // Connect to the transport
    await server.connect(transport);
    
    // Handle process signals to ensure clean shutdown
    process.on('SIGINT', () => {
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      process.exit(0);
    });
    
    // Keep the process alive - this is crucial for MCP stdio transport
    // Don't use setInterval as it can cause issues
    process.stdin.resume();
    
  } catch (error) {
    // Log error to stderr, not stdout
    console.error('Server startup error:', error);
    process.exit(1);
  }
}

startServer().catch(error => {
  console.error('Unhandled server error:', error);
  process.exit(1);
});
