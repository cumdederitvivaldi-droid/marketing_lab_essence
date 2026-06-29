import type { MetadataRoute } from "next";
import { CONSULT_URL, SITE_URL } from "@/lib/constants";

export default function sitemap(): MetadataRoute.Sitemap {
  // /kakao is intentionally omitted because KakaoPage metadata sets noindex.
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: CONSULT_URL,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
