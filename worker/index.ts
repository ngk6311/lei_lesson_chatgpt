/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { appendRecord, cancelBooking, classifyStudent, createBooking, getBootstrap, rescheduleBooking, type GoogleEnv } from "./google";

interface Env extends GoogleEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/bootstrap" && request.method === "GET") {
      try {
        return Response.json(await getBootstrap(env), { headers: { "cache-control": "no-store" } });
      } catch (error) {
        console.error(error);
        return Response.json({ error: error instanceof Error ? error.message : "資料載入失敗" }, { status: 500 });
      }
    }

    if (url.pathname === "/api/records" && request.method === "POST") {
      try {
        return Response.json(await appendRecord(env, await request.json() as Record<string, unknown>));
      } catch (error) {
        console.error(error);
        return Response.json({ error: error instanceof Error ? error.message : "紀錄儲存失敗" }, { status: 500 });
      }
    }

    if (url.pathname === "/api/students/classify" && request.method === "POST") {
      try {
        return Response.json(await classifyStudent(env, await request.json() as Record<string, unknown>));
      } catch (error) {
        console.error(error);
        return Response.json({ error: error instanceof Error ? error.message : "分類儲存失敗" }, { status: 500 });
      }
    }

    if (url.pathname === "/api/bookings" && request.method === "POST") {
      try {
        return Response.json(await createBooking(env, await request.json() as Record<string, unknown>));
      } catch (error) {
        console.error(error);
        return Response.json({ error: error instanceof Error ? error.message : "預約建立失敗" }, { status: 500 });
      }
    }

    const bookingMatch = url.pathname.match(/^\/api\/bookings\/([^/]+)$/);
    if (bookingMatch && request.method === "PATCH") {
      try { return Response.json(await rescheduleBooking(env, decodeURIComponent(bookingMatch[1]), await request.json() as Record<string, unknown>)); }
      catch (error) { return Response.json({ error: error instanceof Error ? error.message : "更改時間失敗" }, { status: 500 }); }
    }
    if (bookingMatch && request.method === "DELETE") {
      try { return Response.json(await cancelBooking(env, decodeURIComponent(bookingMatch[1]))); }
      catch (error) { return Response.json({ error: error instanceof Error ? error.message : "取消預約失敗" }, { status: 500 }); }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
