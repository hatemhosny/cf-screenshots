/// <reference types="@cloudflare/workers-types" />

/**
 * Cloudflare Pages Function to generate screenshots from HTML using Browser Rendering API
 * and save to an R2 bucket
 *
 * Path: /api/screenshot
 */

interface Env {
  ACCOUNT_ID: string;
  API_TOKEN: string;
  SCREENSHOTS_BUCKET: R2Bucket;
}

interface RequestData {
  html: string;
  filename?: string;
  screenshotOptions?: {
    omitBackground?: boolean;
    fullPage?: boolean;
    type?: "jpeg" | "png";
    quality?: number;
    clip?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    deviceScaleFactor?: number;
  };
}

interface SuccessResponse {
  success: true;
  message: string;
  filename: string;
  size: number;
}

interface ErrorResponse {
  success: false;
  error: string;
}

const corsHeaders = {
  headers: {
    "Access-Control-Allow-Origin": "*",
  },
};

export async function onRequestPost(context: {
  request: Request;
  env: Env;
}): Promise<Response> {
  try {
    const { request, env } = context;

    if (request.method === "OPTIONS") {
      return new Response("id", corsHeaders);
    }

    // Parse the request body to get the HTML string
    const requestData: RequestData = await request.json();
    const { html, filename, screenshotOptions } = requestData;

    if (!html) {
      return new Response("Missing HTML content in request body", {
        status: 400,
      });
    }

    // Generate a filename if not provided
    const screenshotFilename: string =
      filename || `screenshot-${Date.now()}.png`;

    // Prepare the request to Cloudflare Browser Rendering API
    const apiUrl: string = `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/browser-rendering/screenshot`;

    // Create the request payload
    const payload = {
      html: html,
      screenshotOptions: screenshotOptions || {
        omitBackground: false,
        fullPage: true,
        type: "png",
      },
    };

    // Make the request to the Browser Rendering API
    const screenshotResponse: Response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!screenshotResponse.ok) {
      const errorText: string = await screenshotResponse.text();
      return new Response(`Failed to generate screenshot: ${errorText}`, {
        status: screenshotResponse.status,
      });
    }

    // Get the screenshot as a buffer
    const screenshotBuffer: ArrayBuffer =
      await screenshotResponse.arrayBuffer();

    // Upload the screenshot to R2
    await env.SCREENSHOTS_BUCKET.put(screenshotFilename, screenshotBuffer, {
      httpMetadata: {
        contentType: "image/png",
      },
      customMetadata: {
        createdAt: new Date().toISOString(),
        source: "browser-rendering-api",
      },
    });

    // Return success response
    const response: SuccessResponse = {
      success: true,
      message: "Screenshot generated and saved to R2",
      filename: screenshotFilename,
      size: screenshotBuffer.byteLength,
    };

    return new Response(JSON.stringify(response), {
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    // Handle errors
    console.error("Error:", error);

    const errorResponse: ErrorResponse = {
      success: false,
      error:
        error instanceof Error ? error.message : "An unknown error occurred",
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}
