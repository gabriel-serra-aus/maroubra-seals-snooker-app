import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", ".data/**", "netlify/**", "scripts/**"]),
  {
    // The browser's own dialogs are out of bounds: they cannot be styled or read on the club phone, and a
    // phone set to block them silently answers "cancel". Use useDialog() from components/Dialog.tsx.
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "alert", message: "Use the app's own dialog: useDialog() in components/Dialog.tsx." },
        { name: "confirm", message: "Use ask() from useDialog() in components/Dialog.tsx." },
        { name: "prompt", message: "Use askText() from useDialog() in components/Dialog.tsx." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "window", property: "alert", message: "Use the app's own dialog: useDialog() in components/Dialog.tsx." },
        { object: "window", property: "confirm", message: "Use ask() from useDialog() in components/Dialog.tsx." },
        { object: "window", property: "prompt", message: "Use askText() from useDialog() in components/Dialog.tsx." },
      ],
    },
  },
]);
