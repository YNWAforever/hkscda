export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <!-- External stylesheet, not an inline element style: style-src is nonce-based and this
         page is rendered outside the SSR render (so it has no request nonce to stamp). -->
    <link rel="stylesheet" href="/error.css" />
  </head>
  <body>
    <div class="card">
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <!-- A plain link, not an inline onclick: script-src has no 'unsafe-inline' (the CSP is
             nonce-based), and an event-handler attribute cannot carry a nonce. An empty href
             reloads this URL. -->
        <a class="primary" href="">Try again</a>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
