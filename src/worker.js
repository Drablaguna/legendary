import { onRequestPost, onRequestOptions } from "../functions/api/sync.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/sync" || url.pathname.startsWith("/api/sync?")) {
      const context = {
        request,
        env,
        params: {},
        waitUntil: ctx && ctx.waitUntil ? ctx.waitUntil.bind(ctx) : () => {},
      };

      if (request.method === "OPTIONS") {
        return onRequestOptions(context);
      }
      if (request.method === "POST") {
        return onRequestPost(context);
      }
      return new Response("Method Not Allowed", { status: 405 });
    }

    // Fall back to static assets (Cloudflare Workers Assets)
    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  },
};
