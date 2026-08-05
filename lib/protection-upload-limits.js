// Vercel can reject multipart request bodies before the application route runs.
// Keep the browser/server fallback below that platform boundary and require
// direct-to-storage upload for anything larger.
export const SAFE_SERVER_UPLOAD_BYTES = 3 * 1024 * 1024;
