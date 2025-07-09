export async function getDashboardErrorHtml() {
  return `<!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0" shrink-to-fit=no">
          <title>Code Time</title>
          <style>
            * {
              box-sizing: border-box;
            }

            *, ::before, ::after {
                --tw-shadow: 0 0 #0000;
            }

            *, ::before, ::after {
                --tw-border-opacity: 1;
                border-color: rgba(228, 228, 231, var(--tw-border-opacity));
            }
            *, ::before, ::after {
                box-sizing: border-box;
                border-width: 0;
                border-style: solid;
                border-color: currentColor;
            }

            h1,
            h2,
            h3,
            h4,
            p {
              margin: 0;
              padding: 0;
              font-size: 1rem;
            }

            body {
              font-weight: 400;
              background-color: transparent;
              color: #9c9c9c;
            }

            .wrapper {
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              padding-top: 8px;
              padding-bottom: 8px;
            }

            .header {
              margin-bottom: 1rem;
            }

            .dialog {
              margin-bottom: 2rem;
            }

            .body-text {
              margin-top: 10px;
              margin-bottom: 1rem;
              font-size: 1.125rem;
            }

            .btn-primary {
              padding-left: 0.5rem;
              padding-right: 0.5rem;
              padding-bottom: 0.25rem;
              padding-top: 0.25rem;
              font-size: 1.125rem;
              cursor: pointer;
              border-radius: 0.25rem;
              background-color: rgb(14 165 233 / var(--tw-bg-opacity, 1));
              color: rgb(255 255 255 / var(--tw-text-opacity, 1));
            }
            .btn-primary:hover {
              background-color: rgb(14 165 233 / 0.8);
            }
            a:link {
              font-size: 1.125rem;
            }
            a:hover {
              color: rgb(14 165 233 / var(--tw-bg-opacity, 1));
            }
          </style>
          <script language="javascript">
            const vscode = acquireVsCodeApi();

            function onCmdClick(action, payload = {}) {
              vscode.postMessage({
                  command: 'command_execute',
                  action,
                  payload
              });
            }
            function disableLink(link) {
              link.onclick = function(event) {
                event.preventDefault(); // Prevents the default link behavior
              };
            }
          </script>
      </head>
      <body>
        <div class="wrapper">
          <h4 class="header">Oops! Something went wrong.</h4>
          <div class="dialog">
            <p class="body-text">
              It looks like this view is temporarily unavailable, but we're working to fix the problem.
            </p>
            <p>
              Keep an eye on our <a href="https://status.software.com/">status page</a> or reach out to us at <a href="mailto:support@software.com">support@software.com</a> if you need help.
            </p>
          </div>
        </div>
      </body>
      </html>`;
}
