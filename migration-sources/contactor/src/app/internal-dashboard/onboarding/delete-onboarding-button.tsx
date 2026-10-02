"use client";

type DeleteOnboardingButtonProps = {
  businessName: string;
};

export function DeleteOnboardingButton({ businessName }: DeleteOnboardingButtonProps) {
  return (
    <button
      type="submit"
      onClick={(event) => {
        const confirmed = window.confirm(
          `Are you sure you want to delete "${businessName}"? This action cannot be undone.`,
        );
        if (!confirmed) {
          event.preventDefault();
        }
      }}
      className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
    >
      Delete
    </button>
  );
}
