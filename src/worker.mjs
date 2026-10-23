// Run before static assets, including cache hits. No page rendering or remote fetching lives here.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.protocol === "http:") {
      url.protocol = "https:";
      return Response.redirect(url.href, 308);
    }
    return env.ASSETS.fetch(request);
  },
};
