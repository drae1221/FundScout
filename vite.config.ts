import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In `npm run dev`, send API calls to the live Netlify site so the page has real data.
const API = "https://fundscout-cu.netlify.app";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: API, changeOrigin: true },
      "/.netlify": { target: API, changeOrigin: true },
    },
  },
});
