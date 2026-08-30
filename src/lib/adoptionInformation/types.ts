export type AdoptionAnimalType = "dog" | "cat";
export type AdoptionInformationResource = "fees" | "estates" | "rules" | "careTopics";

export type AdoptionLanguage = "zh-HK" | "en";
export type BilingualText = Record<AdoptionLanguage, string>;

export type AdoptionFee = {
  id: string;
  animalType: AdoptionAnimalType;
  itemName: string;
  priceHkd: string;
  sortOrder: number;
  isPublished: boolean;
};

export type DogFriendlyEstate = {
  id: string;
  estateName: string;
  district: string;
  notes: string | null;
  sortOrder: number;
  isPublished: boolean;
};

export type AdoptionRuleContent = {
  id: string;
  content: BilingualText;
  sortOrder: number;
  isPublished: boolean;
};

export type CareTopic = {
  id: string;
  animalType: AdoptionAnimalType;
  label: BilingualText;
  content: BilingualText;
  sortOrder: number;
  isPublished: boolean;
};

export type PublicAdoptionInformation = {
  fees: AdoptionFee[];
  estates: DogFriendlyEstate[];
  rules: AdoptionRuleContent[];
  careTopics: CareTopic[];
};

export type AdminAdoptionInformationQuery = {
  resource: AdoptionInformationResource;
  q?: string;
  animalType?: AdoptionAnimalType;
  page: number;
  pageSize: number;
};

export type AdminAdoptionInformationPage = {
  resource: AdoptionInformationResource;
  items: Array<AdoptionFee | DogFriendlyEstate | AdoptionRuleContent | CareTopic>;
  total: number;
  page: number;
  pageSize: number;
};
