# QuadPulse frontend

This is a static frontend that uses the campus events API in `backend/app.py`.

## Deploy to Vercel

Import the GitHub repository and set the Vercel project Root Directory to `frontend`. Select the `Other` framework preset and leave the build command empty; the HTML, CSS, and JavaScript are served as static files.

When the Vercel site opens, enter the actual Render service URL in the Backend API URL field. It is saved in that browser's local storage. For local development, the frontend defaults to `http://127.0.0.1:5000`.

## Backend configuration

The frontend reads the public event API and sends registration requests. Add a valid database user UUID in the page to view or create registrations. The UUID is stored in the browser's local storage; no user list or email address is requested.