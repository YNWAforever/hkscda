export const brand = {
  nameZh: "香港拯救貓狗協會",
  nameEn: "Hong Kong Saving Cat and Dog Association",
  acronym: "HKSCDA",
  slogan: "領養代替購買",
  logo: {
    src: "/brand/hkscda-logo-primary.jpg",
    alt: "香港拯救貓狗協會 HKSCDA",
    width: 960,
    height: 960,
  },
  /**
   * Registration and contact details. Single source: the footer and the home
   * trust panel must never state these independently, and they are operational
   * facts the plan requires be stated once (section 9, WP-1).
   */
  org: {
    charityFileNumber: "91/14493",
    afcdLicenceNumber: "ORG-00041",
    email: "info@hkscda.com",
    phone: "9864 1089",
    phoneHref: "tel:+85298641089",
    foundedLabel: "2007 年 4 月 1 日",
    foundedYear: "2007",
  },
  social: {
    facebook: "https://www.facebook.com/HKSCDA",
    instagram: "https://www.instagram.com/hkscda/",
  },
  colors: {
    blue: "#05648E",
    magenta: "#A61C56",
  },
} as const;
