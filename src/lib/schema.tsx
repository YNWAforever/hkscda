const BASE_URL = PUBLIC_SITE_ORIGIN;
import { PUBLIC_SITE_ORIGIN } from "./publicOrigin";

const orgSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "香港拯救貓狗協會 HKSCDA",
  alternateName: "HK Saving Cat And Dog Association Limited",
  url: BASE_URL,
  logo: BASE_URL + "/brand/hkscda-logo-primary.jpg",
  email: "info@hkscda.com",
  telephone: "+852-98641089",
  description:
    "香港拯救貓狗協會成立於2007年，致力為流浪貓狗提供糧食、醫療、絕育及領養服務的「不殺」慈善機構。",
  foundingDate: "2007-04-01",
  taxID: "91/14493",
  sameAs: ["https://www.facebook.com/HKSCDA", "https://www.instagram.com/hkscda/"],
};

export function organizationSchema() {
  return orgSchema;
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    url: BASE_URL,
    name: "香港拯救貓狗協會 HKSCDA",
  };
}

export function datasetSchema(name: string, description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name,
    description,
    creator: orgSchema,
  };
}

export function articleSchema(
  title: string,
  description: string,
  datePublished: string,
  author: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    datePublished,
    author: { "@type": "Person", name: author },
    publisher: orgSchema,
  };
}

export function itemListSchema(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      url: item.url,
    })),
  };
}

export function breadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function renderJsonLd(schema: Record<string, unknown>) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
