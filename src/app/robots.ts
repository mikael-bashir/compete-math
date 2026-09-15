import { MetadataRoute } from "next";

// Served at /robots.txt. Keep the crawler out of the API, private account
// pages and the development-only routes; everything else is public.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/account/", "/dev-login", "/component-test", "/auth/verify"],
    },
    sitemap: "https://competemath.com/sitemap.xml",
  };
}
