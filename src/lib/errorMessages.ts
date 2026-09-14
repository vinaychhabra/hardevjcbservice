export function formatAppError(message: string | null | undefined): string {
  const raw = (message ?? "").trim();
  if (!raw) return "Something went wrong. Please try again.";

  const lower = raw.toLowerCase();

  if (lower.includes("duplicate key value violates unique constraint") || lower.includes("already exists") || lower.includes("uniqueness")) {
    return "This record already exists. Please review the existing entry and update it instead of creating a duplicate.";
  }

  if (lower.includes("not-null constraint") || lower.includes("cannot be null") || lower.includes("null value in column")) {
    return "A required field is missing. Please complete all required information and try again.";
  }

  if (lower.includes("foreign key") || lower.includes("violates foreign key constraint") || lower.includes("is still referenced")) {
    return "This item is connected to other records and cannot be removed right now.";
  }

  if (lower.includes("permission") || lower.includes("forbidden") || lower.includes("not allowed")) {
    return "You do not have permission to perform this action.";
  }

  if (lower.includes("duplicate") && lower.includes("settings")) {
    return "This setting has already been saved for your account. You can update the existing record instead of creating a duplicate.";
  }

  if (lower.includes("network") || lower.includes("failed to fetch") || lower.includes("fetcherror")) {
    return "The network connection is unstable. Please try again in a moment.";
  }

  if (lower.includes("jwt") || lower.includes("token") || lower.includes("session")) {
    return "Your session has expired. Please sign in again.";
  }

  return raw;
}
