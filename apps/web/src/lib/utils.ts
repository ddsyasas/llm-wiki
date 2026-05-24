import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge about our custom font-size classes from
// tailwind.config.ts's theme.extend.fontSize. Without this, twMerge treats a
// class like "text-ui" as ambiguous and may drop a sibling color class like
// "text-primary-foreground" — which is how the chats sidebar's "+ New chat"
// button ended up with no color override and inheriting dark body text in
// light mode.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["display", "h1", "h2", "h3", "body", "ui", "caption"] },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
