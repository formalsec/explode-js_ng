const { Hono } = require('hono');
const { serve } = require('@hono/node-server');
const { serveStatic } = require('@hono/node-server/serve-static');

const app = new Hono();

app.use('/static/*', serveStatic({ root: "./static", }));

serve({ fetch : app.fetch, host: "localhost", port : "8888" });
