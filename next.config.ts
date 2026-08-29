import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Next writes AGENTS.md / CLAUDE.md on `next dev` by default. Arca already
   *  documents itself in SCOPE.md and Design.md, so the generated pair is just
   *  another thing to keep in sync. */
  agentRules: false,

  /**
   * Arca runs inside TaleSpire's embedded browser as a Symbiote, which loads
   * the app in an iframe. The default `X-Frame-Options: DENY` that most hosts
   * add would make the panel render as a blank box, so framing is allowed and
   * constrained by CSP instead of by a blunt header.
   *
   * `frame-ancestors` is deliberately permissive in development. Before the
   * first real deploy this must be narrowed to TaleSpire's own origin — see
   * SCOPE.md §10 R2.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://*.talespire.com",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
