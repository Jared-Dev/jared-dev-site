import type { MetadataRoute } from "next";

const BASE_URL = "https://jareddev.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: `${BASE_URL}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/timeline`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/recommendation`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];
}
