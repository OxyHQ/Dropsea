/**
 * Dropsea's web Worker. Cloudflare serves every file of the export, and
 * index.html to every navigation, without running this. It runs only for a
 * request that is not a navigation and matches no file: a hashed bundle an
 * older index.html still names, say. That gets a 404, never index.html, which
 * a browser would refuse as a script.
 */
export default {
  fetch() {
    return new Response('Not Found', { status: 404 });
  },
};
