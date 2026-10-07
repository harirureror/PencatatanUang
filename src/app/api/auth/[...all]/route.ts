import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/server/auth";

/** Endpoint Better Auth: sesi, masuk, keluar (/api/auth/*). Pendaftaran lewat /api/akun/daftar. */
export const { GET, POST } = toNextJsHandler(auth);
