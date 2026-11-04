/** Upper bound on the base64 image string sent to /api/detect (keeps us under Vercel's 4.5 MB request limit). */
export const MAX_BASE64_LENGTH = 4_000_000;
