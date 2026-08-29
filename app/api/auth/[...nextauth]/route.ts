/** Auth.js callback and session endpoints. All of the behaviour lives in
 *  `src/lib/auth.ts`; this only mounts its handlers. */
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
