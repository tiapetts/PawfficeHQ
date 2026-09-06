import { createClient } from "@supabase/supabase-js";

const supabaseURL = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const appEnvironment = import.meta.env.VITE_APP_ENV ?? "development";

const productionProjectRef = "kvplhxmgkgnnrdzuikkm";
const stagingProjectRef = "dlxxkfgbffogrsejdinw";

if (!supabaseURL || !supabasePublishableKey) {
  throw new Error("Supabase environment variables are missing.");
}

if (appEnvironment === "staging" && supabaseURL.includes(productionProjectRef)) {
  throw new Error(
    "Staging is configured with the production Supabase project. Refusing to start.",
  );
}

if (
  typeof window !== "undefined" &&
  /(^|\.)pawfficehq\.com$/.test(window.location.hostname) &&
  supabaseURL.includes(stagingProjectRef)
) {
  throw new Error(
    "Production is configured with the staging Supabase project. Refusing to start.",
  );
}

export const supabase = createClient(supabaseURL, supabasePublishableKey);
