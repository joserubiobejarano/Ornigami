export type DashboardSettingsActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export const initialDashboardSettingsActionState: DashboardSettingsActionState = {
  status: "idle",
  message: null,
};
