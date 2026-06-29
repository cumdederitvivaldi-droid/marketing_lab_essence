import type { MetadataRoute } from "next";
import { KAKAO_BRIDGE_URL, SITE_URL } from "@/lib/constants";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/*", KAKAO_BRIDGE_URL],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
