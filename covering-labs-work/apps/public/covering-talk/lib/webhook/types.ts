export type BasicInfoKey = "floor" | "elevator" | "parking";

export interface BasicInfoQuestion {
  key: BasicInfoKey;
  question: string;
  options: { label: string; value: number | boolean }[];
}

export interface BasicInfoResponse {
  key: BasicInfoKey;
  value: number | boolean;
}

export interface ButtonDetection {
  isButton: boolean;
  type: "ambiguous_item" | "basic_info" | null;
}

export type TimeSlotBlock = "A" | "B" | "C";
