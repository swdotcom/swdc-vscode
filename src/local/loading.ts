export async function getLoadingHtml() {
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
          </style>
      </head>
      <body>
        <div class="wrapper">
          <h4 class="header">Loading, please wait...</h4>
        </div>
      </body>
      </html>`;
}
