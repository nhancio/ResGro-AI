# Running Deployed Agents Through a Laptop Browser

This setup is for temporary demonstrations or testing. It allows the deployed
frontend to execute `/data` and `/campaigns` agents using Chrome on your laptop.

## Why the Tunnel Targets the Local Agents API

`LOCAL_BROWSER_CDP_URL` can connect agent code to a remote Chrome browser.
However, `/data` downloads report files and then reads those files from the
same machine as the Agents API. If Cloud Run controls Chrome on a laptop, the
download lands on the laptop while Cloud Run looks for the file in its own
filesystem.

The working route is:

```text
Deployed frontend -> ngrok HTTPS URL -> local Agents API -> local Chrome
```

Both browser actions and downloaded files then run on the laptop.

## Prerequisites

1. The repository dependencies must be installed:

   ```bash
   ./run.sh install
   ```

2. Install and authenticate ngrok:

   ```bash
   brew install ngrok/ngrok/ngrok
   ngrok config add-authtoken <your-ngrok-authtoken>
   ```

   Create or copy an authtoken from the ngrok dashboard. Do not use DoorDash
   credentials in this command.

3. Make sure no other local Agents API is running on port `8001`, and no other
   ngrok tunnel is using the local inspector on port `4040`.

## Start the Laptop Bridge

From the repository root, run:

```bash
./scripts/start-local-agents-tunnel.sh
```

The script:

1. Starts a dedicated Chrome debugging window on port `9222`, unless one is
   already running.
2. Starts the local Agents API on `127.0.0.1:8001` configured to use that
   Chrome window.
3. Publishes the local API through a temporary ngrok HTTPS URL.
4. Prints the frontend deployment command containing that HTTPS URL.

The dedicated Chrome profile may require a one-time DoorDash login. Complete
login only in the Chrome window started for this test.

## Point the Deployed Frontend to the Bridge

Copy the URL printed by the bridge script and deploy the frontend:

```bash
RESGRO_TUNNEL_AGENTS_URL="https://example.ngrok-free.app" ./deploy.sh netlify prod
```

This override changes only that frontend build. It does not overwrite the
normal Cloud Run Agents API URL stored in configuration.

After deployment:

1. Open the deployed app and sign in.
2. Open **Agents**.
3. Run the **Data** agent (`/data`). Watch the local Chrome window complete the
   DoorDash report download; the resulting files are processed locally.
4. Run the **Campaigns** agent (`/campaigns`). Any portal browser work also
   occurs in the local Chrome window.

Local logs are written to `logs/local-tunnel-*.log`.

## Stop the Bridge and Restore Normal Deployment

Stop the local processes:

```bash
./scripts/start-local-agents-tunnel.sh stop
```

Redeploy the frontend without the temporary override so it calls the regular
Cloud Run Agents API again:

```bash
./deploy.sh netlify prod
```

## Security and Production Use

The local Agents API currently permits browser requests without application
authentication at the tunnel boundary. Anyone with the temporary ngrok URL
could attempt to call it while it is running. Keep the URL private and stop the
tunnel immediately after testing.

This is not a production architecture. For production, run the browser and
Agents API in controlled cloud infrastructure with authentication and shared
download storage, or implement a secure worker that uploads laptop-downloaded
files back to the deployed service.
