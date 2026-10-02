export type OwnerSettingsActionState = {
  status: "idle" | "error" | "success";
  message: string | null;
};

export const initialOwnerSettingsActionState: OwnerSettingsActionState = {
  status: "idle",
  message: null,
};
