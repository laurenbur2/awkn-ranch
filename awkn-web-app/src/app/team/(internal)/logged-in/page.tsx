/**
 * Post-login landing for the legacy /login flow. Mirrors the legacy
 * login aesthetic — temple-room background, branded card, Cormorant +
 * Montserrat fonts, brown accent — so the round-trip feels visually
 * coherent rather than dropping users into a stubbed shadcn page.
 */
export default function LoggedInPage() {
  return (
    <>
      <link
        rel="preconnect"
        href="https://fonts.googleapis.com"
      />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Montserrat:wght@400;500;600&display=swap"
        rel="stylesheet"
      />

      <style>{loggedInCss}</style>

      <div className="bg">
        <img
          src="https://images.squarespace-cdn.com/content/v1/676255f9d9be920b868bbb78/06146aa7-574c-40e2-b352-7dbdaec35e97/PC230187-Enhanced-NR.jpg"
          alt=""
        />
      </div>
      <div className="bg-overlay" />

      <div className="logged-container">
        <div className="logged-card">
          <div className="logo">
            <img
              src="https://images.squarespace-cdn.com/content/v1/676255f9d9be920b868bbb78/e7642ed2-f2d9-40e4-94b8-bbf5eb1ab229/Transparent+Brown_black.jpg"
              alt="AWKN Ranch logo"
            />
          </div>
          <div className="subtitle">Team Portal</div>

          <div className="check">✓</div>
          <h1>Signed in</h1>
          <p className="lede">
            You're signed in. Your session is now active across the new app.
          </p>

          <div className="actions">
            <a href="http://localhost:3000/" className="btn btn-secondary">
              Back to dev landing
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

const loggedInCss = `
  :root {
    --brown-dark: #3a2618;
    --brown: #6b4226;
    --brown-light: #8b5a3c;
    --cream: #f5ede0;
    --gold: #c9a050;
    --font-heading: 'Cormorant Garamond', Georgia, serif;
    --font-body: 'Montserrat', -apple-system, BlinkMacSystemFont, sans-serif;
  }

  html, body { height: 100%; margin: 0; padding: 0; }
  body {
    font-family: var(--font-body);
    color: var(--brown-dark);
    overflow-x: hidden;
  }

  .bg {
    position: fixed;
    inset: 0;
    z-index: 0;
  }
  .bg img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .bg-overlay {
    position: fixed;
    inset: 0;
    background: linear-gradient(160deg, rgba(26,20,13,0.75) 0%, rgba(26,20,13,0.55) 50%, rgba(26,20,13,0.70) 100%);
    z-index: 1;
  }

  .logged-container {
    position: relative;
    z-index: 10;
    width: 100%;
    max-width: 460px;
    margin: 0 auto;
    padding: 4rem 1.5rem;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .logged-card {
    background: rgba(255,255,255,0.97);
    backdrop-filter: blur(20px);
    border-radius: 16px;
    padding: 2.5rem 2.25rem 2rem;
    box-shadow: 0 20px 60px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.1);
    text-align: center;
    width: 100%;
  }

  .logo { margin-bottom: 1rem; }
  .logo img {
    display: block;
    width: 140px;
    height: auto;
    margin: 0 auto;
  }

  .subtitle {
    font-family: var(--font-body);
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.25em;
    color: var(--brown);
    text-transform: uppercase;
    margin-bottom: 1.5rem;
  }

  .check {
    font-size: 3rem;
    color: var(--brown);
    line-height: 1;
    margin-bottom: 0.75rem;
    font-weight: 300;
  }

  h1 {
    font-family: var(--font-heading);
    font-size: 2rem;
    font-weight: 500;
    color: var(--brown-dark);
    margin: 0 0 0.5rem;
    letter-spacing: 0.02em;
  }

  .lede {
    font-family: var(--font-body);
    font-size: 0.9rem;
    line-height: 1.55;
    color: rgba(58,38,24,0.75);
    margin: 0 0 1.75rem;
  }

  .lede code {
    background: rgba(107,66,38,0.08);
    padding: 0.1em 0.35em;
    border-radius: 4px;
    font-size: 0.85em;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: var(--brown);
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.875rem 1.25rem;
    border-radius: 8px;
    font-family: var(--font-body);
    font-size: 0.9rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-decoration: none;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1.5px solid transparent;
  }

  .btn-primary {
    background: var(--brown);
    color: var(--cream);
    border-color: var(--brown);
  }
  .btn-primary:hover {
    background: var(--brown-dark);
    border-color: var(--brown-dark);
  }

  .btn-secondary {
    background: transparent;
    color: var(--brown);
    border-color: rgba(107,66,38,0.25);
  }
  .btn-secondary:hover {
    background: rgba(107,66,38,0.06);
    border-color: rgba(107,66,38,0.45);
  }
`;
