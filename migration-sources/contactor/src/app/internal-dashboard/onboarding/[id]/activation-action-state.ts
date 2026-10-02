export type ActivationActionState = {
  status: "idle" | "error" | "success";
  message: string | null;
  ownerEmail: string | null;
  temporaryPassword: string | null;
};

export const initialActivationActionState: ActivationActionState = {
  status: "idle",
  message: null,
  ownerEmail: null,
  temporaryPassword: null,
};
