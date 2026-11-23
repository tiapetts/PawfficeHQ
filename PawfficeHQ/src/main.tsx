import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import AgreementReview from "./components/AgreementReview.tsx";
import { Analytics } from "@vercel/analytics/react";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { initializeMonitoring } from "./lib/monitoring.ts";
import { registerPawfficeServiceWorker } from "./lib/registerServiceWorker.ts";

initializeMonitoring();
registerPawfficeServiceWorker();

const isStaging = import.meta.env.VITE_APP_ENV === "staging";
const agreementToken = new URLSearchParams(window.location.search).get("agreement_token");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      {isStaging ? (
        <div className="staging-banner" role="status">
          STAGING — TEST DATA ONLY
        </div>
      ) : null}
      {agreementToken ? <AgreementReview token={agreementToken} /> : <App />}
      <Analytics />
    </ErrorBoundary>
  </StrictMode>,
);
