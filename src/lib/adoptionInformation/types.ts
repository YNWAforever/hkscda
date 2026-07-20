export type AdoptionAnimalType = "dog" | "cat";
export type AdoptionInformationResource = "fees" | "estates";

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

export type PublicAdoptionInformation = {
  fees: AdoptionFee[];
  estates: DogFriendlyEstate[];
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
  items: Array<AdoptionFee | DogFriendlyEstate>;
  total: number;
  page: number;
  pageSize: number;
};
