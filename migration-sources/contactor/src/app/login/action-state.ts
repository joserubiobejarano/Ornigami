export type LoginActionState = {
  status: "idle" | "error";
  message: string | null;
};

export const initialLoginActionState: LoginActionState = {
  status: "idle",
  message: null,
};
